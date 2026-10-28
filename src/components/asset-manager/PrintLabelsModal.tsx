import React, { useState, useEffect, useRef } from 'react';
import { Asset, Organization } from '../../types';
import { 
  Printer, 
  X, 
  Download, 
  Settings2, 
  Layers, 
  CheckCircle2, 
  Sparkles,
  FileText,
  Sliders,
  Maximize2
} from 'lucide-react';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';

export type LabelSheetFormat = 'avery5160' | 'avery5163' | 'thermalRoll' | 'compact21';

interface LabelConfig {
  format: LabelSheetFormat;
  showOrgName: boolean;
  showModel: boolean;
  showSerialNumber: boolean;
  showCategory: boolean;
  showBranch: boolean;
  showAssetCode: boolean;
  customFooterText: string;
}

interface PrintLabelsModalProps {
  assets: Asset[];
  organization: Organization;
  onClose: () => void;
}

export const PrintLabelsModal: React.FC<PrintLabelsModalProps> = ({
  assets,
  organization,
  onClose
}) => {
  const [config, setConfig] = useState<LabelConfig>({
    format: 'avery5160',
    showOrgName: true,
    showModel: true,
    showSerialNumber: true,
    showCategory: true,
    showBranch: true,
    showAssetCode: true,
    customFooterText: `Property of ${organization.name}`
  });

  const [qrCodeMap, setQrCodeMap] = useState<Record<string, string>>({});
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(true);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Pre-generate offline high-contrast QR code data URLs for all assets
  useEffect(() => {
    let isCancelled = false;

    const generateAllQr = async () => {
      setIsGeneratingQr(true);
      const newMap: Record<string, string> = {};

      for (const ast of assets) {
        if (isCancelled) return;
        try {
          const payload = JSON.stringify({
            code: ast.assetCode,
            sn: ast.serialNumber || '',
            name: ast.name,
            orgId: ast.orgId
          });

          const dataUrl = await QRCode.toDataURL(payload, {
            margin: 1,
            width: 200,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#000000',
              light: '#ffffff'
            }
          });
          newMap[ast.id] = dataUrl;
        } catch (err) {
          console.error(`Failed to generate QR for asset ${ast.assetCode}:`, err);
        }
      }

      if (!isCancelled) {
        setQrCodeMap(newMap);
        setIsGeneratingQr(false);
      }
    };

    generateAllQr();

    return () => {
      isCancelled = true;
    };
  }, [assets]);

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    setIsExportingPdf(true);
    try {
      if (config.format === 'thermalRoll') {
        // Continuous single label roll: 54mm x 28mm (approx 2.12" x 1.1")
        const pdf = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: [54, 28]
        });

        assets.forEach((ast, index) => {
          if (index > 0) pdf.addPage([54, 28], 'landscape');

          // Header
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(7);
          pdf.text(organization.name.toUpperCase().slice(0, 24), 2, 4);

          // QR Code
          const qr = qrCodeMap[ast.id];
          if (qr) {
            pdf.addImage(qr, 'PNG', 2, 6, 18, 18);
          }

          // Details next to QR
          pdf.setFontSize(8);
          pdf.text(ast.assetCode, 22, 9);

          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(6);
          pdf.text(ast.name.slice(0, 22), 22, 13);
          if (config.showSerialNumber && ast.serialNumber) {
            pdf.text(`S/N: ${ast.serialNumber.slice(0, 16)}`, 22, 17);
          }
          if (config.showBranch && ast.branchName) {
            pdf.text(`Loc: ${ast.branchName.slice(0, 16)}`, 22, 21);
          }

          // Footer
          pdf.setFontSize(5);
          pdf.setTextColor(100);
          pdf.text(config.customFooterText.slice(0, 36), 2, 26);
          pdf.setTextColor(0);
        });

        pdf.save(`${organization.name.replace(/\s+/g, '_')}_Thermal_Asset_Labels.pdf`);
      } else {
        // Standard Letter Sheet (Avery 5160 or Avery 5163)
        const is5163 = config.format === 'avery5163';
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'in',
          format: 'letter'
        });

        const cols = is5163 ? 2 : 3;
        const rows = is5163 ? 5 : 10;
        const labelsPerPage = cols * rows;

        const labelWidth = is5163 ? 4.0 : 2.625;
        const labelHeight = is5163 ? 2.0 : 1.0;
        const leftMargin = is5163 ? 0.15 : 0.1875;
        const topMargin = 0.5;
        const colGap = is5163 ? 0.2 : 0.125;

        assets.forEach((ast, index) => {
          const pageIndex = Math.floor(index / labelsPerPage);
          const indexOnPage = index % labelsPerPage;

          if (index > 0 && indexOnPage === 0) {
            pdf.addPage('letter', 'portrait');
          }

          const col = indexOnPage % cols;
          const row = Math.floor(indexOnPage / cols);

          const x = leftMargin + col * (labelWidth + colGap);
          const y = topMargin + row * labelHeight;

          // Draw faint border guide
          pdf.setDrawColor(220, 225, 230);
          pdf.rect(x, y, labelWidth, labelHeight);

          // Content
          const qr = qrCodeMap[ast.id];
          const qrSize = is5163 ? 1.2 : 0.65;
          const qrX = x + 0.08;
          const qrY = y + 0.15;

          if (qr) {
            pdf.addImage(qr, 'PNG', qrX, qrY, qrSize, qrSize);
          }

          const textX = qrX + qrSize + 0.08;
          let currentY = y + 0.2;

          // Org header
          if (config.showOrgName) {
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(is5163 ? 8 : 6);
            pdf.setTextColor(80, 80, 80);
            pdf.text(organization.name.toUpperCase().slice(0, is5163 ? 30 : 20), textX, currentY);
            currentY += is5163 ? 0.2 : 0.12;
          }

          // Asset Code
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(is5163 ? 11 : 8.5);
          pdf.setTextColor(0, 0, 0);
          pdf.text(ast.assetCode, textX, currentY);
          currentY += is5163 ? 0.25 : 0.14;

          // Asset Name
          if (config.showModel) {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(is5163 ? 9 : 6.5);
            pdf.text(ast.name.slice(0, is5163 ? 26 : 18), textX, currentY);
            currentY += is5163 ? 0.18 : 0.11;
          }

          // Serial Number
          if (config.showSerialNumber && ast.serialNumber) {
            pdf.setFontSize(is5163 ? 7.5 : 5.5);
            pdf.setTextColor(60, 60, 60);
            pdf.text(`S/N: ${ast.serialNumber.slice(0, is5163 ? 24 : 16)}`, textX, currentY);
            currentY += is5163 ? 0.16 : 0.1;
          }

          // Branch / Category
          if (config.showBranch && ast.branchName) {
            pdf.setFontSize(is5163 ? 7 : 5);
            pdf.text(`Loc: ${ast.branchName.slice(0, is5163 ? 22 : 14)}`, textX, currentY);
          }

          // Footer notice
          if (config.customFooterText) {
            pdf.setFontSize(is5163 ? 6 : 4.5);
            pdf.setTextColor(120, 120, 120);
            pdf.text(config.customFooterText.slice(0, is5163 ? 40 : 28), x + 0.08, y + labelHeight - 0.06);
          }
        });

        pdf.save(`${organization.name.replace(/\s+/g, '_')}_Avery_Asset_Labels.pdf`);
      }
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md flex flex-col items-center p-3 sm:p-6 print:p-0 print:bg-white print:static">
      {/* Dynamic Print Stylesheet for exact label sheet geometry */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-label-sheet, #printable-label-sheet * {
            visibility: visible;
          }
          #printable-label-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          @page {
            size: ${config.format === 'thermalRoll' ? '54mm 28mm' : 'letter portrait'};
            margin: ${config.format === 'thermalRoll' ? '1mm' : '0.5in 0.1875in'};
          }
        }
      `}</style>

      {/* Control & Customization Toolbar (Hidden during print) */}
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 mb-6 shadow-2xl print:hidden animate-in fade-in slide-in-from-top-3 duration-200">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Printer className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-100">
                  Enterprise Hardware Asset Label Studio
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {assets.length} Selected
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Precision formatted for Avery sticker sheets, Zebra thermal printers, and high-res vector PDF export
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={handleExportPDF}
              disabled={isGeneratingQr || isExportingPdf}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>{isExportingPdf ? 'Exporting...' : 'Export PDF'}</span>
            </button>
            <button
              onClick={handlePrint}
              disabled={isGeneratingQr}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Sheet</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Customization Options Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 text-xs">
          <div>
            <label className="block text-slate-400 font-medium mb-1.5 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-emerald-400" /> Sheet Template
            </label>
            <select
              value={config.format}
              onChange={(e) => setConfig(prev => ({ ...prev, format: e.target.value as LabelSheetFormat }))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-medium cursor-pointer"
            >
              <option value="avery5160">Avery 5160 / 30 per sheet (1" x 2-5/8")</option>
              <option value="avery5163">Avery 5163 / 10 per sheet (2" x 4")</option>
              <option value="thermalRoll">Zebra / Dymo Thermal Roll (2" x 1")</option>
              <option value="compact21">A4 Compact / 21 per sheet (70mm x 38mm)</option>
            </select>
          </div>

          <div>
            <label className="block text-slate-400 font-medium mb-1.5 flex items-center gap-1.5">
              <Settings2 className="w-3.5 h-3.5 text-emerald-400" /> Label Fields
            </label>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.showSerialNumber}
                  onChange={(e) => setConfig(prev => ({ ...prev, showSerialNumber: e.target.checked }))}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span>Serial #</span>
              </label>
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.showBranch}
                  onChange={(e) => setConfig(prev => ({ ...prev, showBranch: e.target.checked }))}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span>Location</span>
              </label>
              <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={config.showOrgName}
                  onChange={(e) => setConfig(prev => ({ ...prev, showOrgName: e.target.checked }))}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span>Org Header</span>
              </label>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-slate-400 font-medium mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-400" /> Ownership Statement (Footer)
            </label>
            <input
              type="text"
              value={config.customFooterText}
              onChange={(e) => setConfig(prev => ({ ...prev, customFooterText: e.target.value }))}
              placeholder="e.g. Property of OmniCorp IT"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
            />
          </div>
        </div>
      </div>

      {/* Printable Sheet Viewport */}
      <div 
        id="printable-label-sheet"
        className="w-full max-w-5xl bg-white text-slate-900 rounded-2xl p-6 sm:p-8 shadow-2xl print:shadow-none print:p-0 print:rounded-none min-h-[600px]"
      >
        {isGeneratingQr ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm font-medium">Generating high-density vector QR codes...</p>
          </div>
        ) : (
          <div className={`grid gap-3 ${
            config.format === 'avery5163' 
              ? 'grid-cols-1 sm:grid-cols-2 print:grid-cols-2' 
              : config.format === 'thermalRoll'
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-1 print:gap-1'
                : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-3'
          }`}>
            {assets.map((ast) => {
              const qr = qrCodeMap[ast.id];
              const is5163 = config.format === 'avery5163';
              const isThermal = config.format === 'thermalRoll';

              return (
                <div
                  key={ast.id}
                  className={`border border-slate-300 rounded-lg p-3 bg-white flex flex-col justify-between print:border-slate-300 print:rounded-none ${
                    is5163 ? 'min-h-[170px]' : isThermal ? 'min-h-[105px] border-dashed' : 'min-h-[110px]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* High-res Offline QR Code */}
                    <div className="shrink-0 bg-white p-0.5 border border-slate-200 rounded">
                      {qr ? (
                        <img 
                          src={qr} 
                          alt={ast.assetCode} 
                          className={is5163 ? 'w-24 h-24' : isThermal ? 'w-16 h-16' : 'w-16 h-16'} 
                        />
                      ) : (
                        <div className="w-16 h-16 bg-slate-100 flex items-center justify-center text-[9px] text-slate-400">
                          QR
                        </div>
                      )}
                    </div>

                    {/* Metadata & Tag Info */}
                    <div className="flex-1 min-w-0">
                      {config.showOrgName && (
                        <div className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500 truncate">
                          {organization.name}
                        </div>
                      )}
                      
                      <div className={`font-mono font-black text-slate-950 truncate tracking-tight ${is5163 ? 'text-base' : 'text-xs'}`}>
                        {ast.assetCode}
                      </div>

                      {config.showModel && (
                        <div className={`font-bold text-slate-800 truncate ${is5163 ? 'text-xs' : 'text-[11px]'}`}>
                          {ast.name}
                        </div>
                      )}

                      {config.showSerialNumber && ast.serialNumber && (
                        <div className="text-[10px] text-slate-600 font-mono truncate">
                          S/N: <span className="font-semibold text-slate-900">{ast.serialNumber}</span>
                        </div>
                      )}

                      {config.showBranch && ast.branchName && (
                        <div className="text-[9px] text-slate-500 truncate">
                          Loc: {ast.branchName}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer Notice */}
                  {config.customFooterText && (
                    <div className="text-[8px] font-medium text-slate-400 border-t border-slate-100 pt-1 mt-1 truncate">
                      {config.customFooterText}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

