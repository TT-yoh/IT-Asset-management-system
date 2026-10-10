import React from 'react';
import { Asset, Organization } from '../types';
import { Printer, X, Download, Sparkles } from 'lucide-react';

interface BatchLabelPrinterProps {
  assets: Asset[];
  organization: Organization;
  onClose: () => void;
}

export const BatchLabelPrinter: React.FC<BatchLabelPrinterProps> = ({
  assets,
  organization,
  onClose
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/90 backdrop-blur-md flex flex-col items-center p-4 sm:p-6 print:p-0 print:bg-white print:static">
      {/* Non-printable Control Toolbar */}
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 shadow-2xl flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Printer className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">
              Batch Hardware Asset Label Generator
            </h2>
            <p className="text-xs text-slate-400">
              Generating {assets.length} printable labels for Avery / Zebra sticker sheets & A4 paper
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print Sheet
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Printable Sheet Grid */}
      <div className="w-full max-w-5xl bg-white text-slate-900 rounded-2xl p-6 shadow-2xl print:shadow-none print:p-0 print:rounded-none">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-3">
          {assets.map((ast) => {
            const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
              JSON.stringify({
                code: ast.assetCode,
                sn: ast.serialNumber,
                org: organization.name,
                branch: ast.branchName
              })
            )}`;

            return (
              <div
                key={ast.id}
                className="border-2 border-slate-900 border-dashed rounded-xl p-3 flex flex-col justify-between bg-white relative print:break-inside-avoid print:border-solid print:border-slate-800"
                style={{ minHeight: '180px' }}
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{organization.logo || '🏢'}</span>
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-tight truncate max-w-[130px]">
                      {organization.name}
                    </span>
                  </div>
                  <span className="text-[9px] font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-300 text-slate-700">
                    {ast.branchName.slice(0, 12)}
                  </span>
                </div>

                {/* Content: QR code + Info */}
                <div className="flex gap-3 items-center">
                  <div className="w-20 h-20 flex-shrink-0 bg-slate-50 border border-slate-200 rounded-lg p-1 flex items-center justify-center">
                    <img
                      src={qrUrl}
                      alt={ast.assetCode}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] text-slate-500 uppercase font-semibold">Asset Tag</div>
                    <div className="text-sm font-black font-mono text-slate-950 tracking-wider">
                      {ast.assetCode}
                    </div>

                    <div className="text-[11px] font-bold text-slate-800 truncate mt-1">
                      {ast.name}
                    </div>
                    <div className="text-[10px] text-slate-600 truncate">{ast.model}</div>

                    <div className="mt-1 text-[9px] font-mono text-slate-500">
                      S/N: <span className="font-semibold text-slate-700">{ast.serialNumber}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Barcode line simulation */}
                <div className="mt-2 pt-1.5 border-t border-slate-200 flex items-center justify-between text-[8px] text-slate-400 font-mono">
                  <span>PROPERTY OF {organization.name.toUpperCase()}</span>
                  <span>ID: {ast.id.slice(-6)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
