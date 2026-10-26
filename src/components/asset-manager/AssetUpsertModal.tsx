import React, { useState, useEffect } from 'react';
import { Asset, Branch, AssetCategory, Organization } from '../../types';
import { 
  X, 
  Sparkles, 
  Check, 
  Cpu, 
  DollarSign, 
  Calendar, 
  MapPin, 
  Tag, 
  Layers, 
  FileText,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  SlidersHorizontal
} from 'lucide-react';
import { fetchHardwareSpecs } from '../../lib/ai/specs';
import { AssetService } from '../../lib/asset-service';

interface AssetUpsertModalProps {
  isOpen: boolean;
  editingAsset: Asset | null;
  prefilledTag?: string;
  branches: Branch[];
  categories: AssetCategory[];
  currentOrg: Organization;
  onClose: () => void;
  onSave: (asset: Asset) => void;
}

export const AssetUpsertModal: React.FC<AssetUpsertModalProps> = ({
  isOpen,
  editingAsset,
  prefilledTag,
  branches,
  categories,
  currentOrg,
  onClose,
  onSave
}) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [showAdvancedFields, setShowAdvancedFields] = useState<boolean>(false);

  const [formData, setFormData] = useState<Partial<Asset>>({
    name: '',
    model: '',
    assetCode: '',
    serialNumber: '',
    macAddress: '',
    imeiNumber: '',
    categoryId: categories[0]?.id || 'cat-1',
    categoryName: categories[0]?.name || 'Laptop',
    branchId: branches[0]?.id || '',
    branchName: branches[0]?.name || '',
    status: 'ACTIVE',
    condition: 'NEW',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseCost: 1200,
    currentValue: 1200,
    warrantyExpiry: new Date(Date.now() + 365 * 24 * 3600 * 1000 * 3).toISOString().split('T')[0],
    notes: '',
    imageUrl: ''
  });

  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState('');
  const [formError, setFormError] = useState('');

  const monthsElapsed = React.useMemo(() => {
    if (!formData.purchaseDate) return 0;
    const pDate = new Date(formData.purchaseDate);
    if (isNaN(pDate.getTime())) return 0;
    const now = new Date();
    return Math.max(0, (now.getFullYear() - pDate.getFullYear()) * 12 + (now.getMonth() - pDate.getMonth()));
  }, [formData.purchaseDate]);

  const computedDepreciatedValue = React.useMemo(() => {
    const cost = Number(formData.purchaseCost) || 0;
    const date = formData.purchaseDate || new Date().toISOString().split('T')[0]!;
    return AssetService.calculateCurrentValue(cost, date);
  }, [formData.purchaseCost, formData.purchaseDate]);

  useEffect(() => {
    if (editingAsset) {
      setFormData(editingAsset);
    } else {
      const generatedCode = prefilledTag || `AST-${Math.floor(1000 + Math.random() * 9000)}`;
      setFormData({
        name: '',
        model: '',
        assetCode: generatedCode,
        serialNumber: `SN-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        macAddress: '',
        imeiNumber: '',
        categoryId: categories[0]?.id || 'cat-1',
        categoryName: categories[0]?.name || 'Laptop',
        branchId: branches[0]?.id || '',
        branchName: branches[0]?.name || '',
        status: 'ACTIVE',
        condition: 'NEW',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchaseCost: 1200,
        currentValue: 1200,
        warrantyExpiry: new Date(Date.now() + 365 * 24 * 3600 * 1000 * 3).toISOString().split('T')[0],
        notes: '',
        imageUrl: ''
      });
    }
    setActiveStep(1);
    setAiSuccessMessage('');
    setFormError('');
  }, [editingAsset, prefilledTag, isOpen, branches, categories]);

  if (!isOpen) return null;

  const handleCatalogAutoFill = async () => {
    const query = formData.model || formData.name;
    if (!query || query.trim().length === 0) {
      setFormError('Please enter a device model (e.g. Dell XPS 15 or MacBook Pro 16) first.');
      return;
    }

    setAiLoading(true);
    setFormError('');
    setAiSuccessMessage('');

    try {
      const specs = await fetchHardwareSpecs(query);
      
      const matchedCat = categories.find(c => 
        c.name.toLowerCase().includes(specs.suggestedCategory.toLowerCase()) ||
        specs.suggestedCategory.toLowerCase().includes(c.name.toLowerCase())
      );

      setFormData(prev => ({
        ...prev,
        name: prev.name || `${specs.manufacturer} ${specs.model}`,
        model: specs.model,
        categoryId: matchedCat ? matchedCat.id : prev.categoryId,
        categoryName: matchedCat ? matchedCat.name : prev.categoryName,
        purchaseCost: specs.estimatedCostUSD || prev.purchaseCost,
        currentValue: specs.estimatedCostUSD || prev.currentValue,
        notes: `${specs.cpu} | ${specs.ram} | ${specs.storage}${specs.ports ? ` | Ports: ${specs.ports}` : ''}\n${specs.notes}`
      }));

      setAiSuccessMessage(`Catalog specs populated for ${specs.model}!`);
    } catch (err: any) {
      setFormError('Failed to populate specs: ' + err.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim() || !formData.assetCode?.trim()) {
      setFormError('Asset Name and Asset Code are required.');
      return;
    }

    const branch = branches.find(b => b.id === formData.branchId) || branches[0]!;
    const category = categories.find(c => c.id === formData.categoryId) || categories[0]!;

    const payload: Asset = {
      id: editingAsset?.id || `ast-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      orgId: currentOrg.id,
      name: formData.name.trim(),
      model: formData.model?.trim() || formData.name.trim(),
      assetCode: formData.assetCode.trim(),
      serialNumber: formData.serialNumber?.trim() || `SN-${Date.now().toString().slice(-6)}`,
      macAddress: formData.macAddress?.trim(),
      imeiNumber: formData.imeiNumber?.trim(),
      categoryId: category.id,
      categoryName: category.name,
      branchId: branch.id,
      branchName: branch.name,
      status: formData.status || 'ACTIVE',
      condition: formData.condition || 'NEW',
      purchaseDate: formData.purchaseDate || new Date().toISOString().split('T')[0]!,
      purchaseCost: Number(formData.purchaseCost) || 0,
      currentValue: Number(formData.currentValue ?? formData.purchaseCost) || 0,
      warrantyExpiry: formData.warrantyExpiry || '',
      assignedToUserId: editingAsset?.assignedToUserId,
      assignedToUserName: editingAsset?.assignedToUserName,
      assignedAt: editingAsset?.assignedAt,
      imageUrl: formData.imageUrl || '',
      notes: formData.notes || ''
    };

    onSave(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <Tag className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                {editingAsset ? 'Edit Hardware Asset' : 'Enroll New Asset'}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono">
                  {showAdvancedFields ? 'Technical Mode' : 'Guided Wizard'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {currentOrg.name} Primary TiDB Ledger
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAdvancedFields(!showAdvancedFields)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1 transition-colors border border-slate-700"
              title="Toggle between Simplified Wizard and All Technical Fields"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {showAdvancedFields ? 'Simplified Wizard' : 'All Fields'}
              </span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Hardware Catalog Auto-Fill Banner */}
        <div className="px-5 py-3 bg-gradient-to-r from-emerald-500/10 via-slate-900 to-teal-500/10 border-b border-emerald-500/20 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-emerald-300">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <span>Type a model & auto-populate enterprise specs & pricing</span>
          </div>

          <button
            type="button"
            onClick={handleCatalogAutoFill}
            disabled={aiLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {aiLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Fetching Specs...
              </>
            ) : (
              <>
                <Cpu className="w-3.5 h-3.5" /> Auto-fill from Catalog
              </>
            )}
          </button>
        </div>

        {/* Success / Error Banners */}
        {aiSuccessMessage && (
          <div className="mx-5 mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{aiSuccessMessage}</span>
          </div>
        )}

        {formError && (
          <div className="mx-5 mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          {!showAdvancedFields ? (
            /* WIZARD MODE: 2 Guided Steps */
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold pb-2 border-b border-slate-800">
                <span className={activeStep === 1 ? 'text-emerald-400' : 'text-slate-500'}>
                  1. Device Identity & AI Spec
                </span>
                <span className="text-slate-600">→</span>
                <span className={activeStep === 2 ? 'text-emerald-400' : 'text-slate-500'}>
                  2. Facility & Ownership
                </span>
              </div>

              {activeStep === 1 ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Model or Device Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.model || formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value, name: e.target.value })}
                      placeholder="e.g. MacBook Pro 16, Dell XPS 15, Logitech MX Master 3S, or Dell KM5221W Combo"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Asset Tag / Barcode
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.assetCode || ''}
                        onChange={(e) => setFormData({ ...formData, assetCode: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Category</label>
                      <select
                        value={formData.categoryId}
                        onChange={(e) => {
                          const c = categories.find(cat => cat.id === e.target.value);
                          setFormData({ ...formData, categoryId: e.target.value, categoryName: c?.name || 'Hardware' });
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (!formData.name?.trim()) {
                          setFormError('Please enter a device model or name.');
                          return;
                        }
                        setFormError('');
                        setActiveStep(2);
                      }}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold flex items-center gap-1.5 transition-all"
                    >
                      Next Step <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Operating Branch Location
                      </label>
                      <select
                        value={formData.branchId}
                        onChange={(e) => {
                          const b = branches.find(br => br.id === e.target.value);
                          setFormData({ ...formData, branchId: e.target.value, branchName: b?.name || '' });
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Asset Physical Condition
                      </label>
                      <select
                        value={formData.condition || 'NEW'}
                        onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="NEW">Brand New (Unopened/Mint)</option>
                        <option value="GOOD">Good (Preexisting / Deployed)</option>
                        <option value="FAIR">Fair (Visible Wear / Operational)</option>
                        <option value="POOR">Poor (Degraded / Nearing Disposal)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                        <span>Original Acquisition Date</span>
                        <span className="text-[10px] text-slate-500 font-normal">Past dates allowed</span>
                      </label>
                      <input
                        type="date"
                        value={formData.purchaseDate || ''}
                        onChange={(e) => {
                          const newDate = e.target.value;
                          const calcVal = AssetService.calculateCurrentValue(Number(formData.purchaseCost) || 0, newDate);
                          setFormData({ ...formData, purchaseDate: newDate, currentValue: calcVal });
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Original Purchase Cost ($)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.purchaseCost || 0}
                        onChange={(e) => {
                          const cost = Number(e.target.value);
                          const calcVal = AssetService.calculateCurrentValue(cost, formData.purchaseDate || new Date().toISOString().split('T')[0]!);
                          setFormData({ ...formData, purchaseCost: cost, currentValue: calcVal });
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Preexisting Asset Depreciation Valuation Card */}
                  <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-slate-300 font-semibold">
                        <DollarSign className="w-4 h-4 text-emerald-400" />
                        <span>Current Depreciated Valuation</span>
                      </div>
                      {monthsElapsed > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                          {monthsElapsed} months elapsed
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <input
                          type="number"
                          min="0"
                          value={formData.currentValue ?? computedDepreciatedValue}
                          onChange={(e) => setFormData({ ...formData, currentValue: Number(e.target.value) })}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl font-mono text-emerald-400 font-bold focus:outline-none focus:border-emerald-500 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, currentValue: computedDepreciatedValue })}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[11px] font-semibold transition-colors border border-slate-700"
                        title="Reset to mathematically computed straight-line depreciation"
                      >
                        Reset to ${computedDepreciatedValue}
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-500">
                      {monthsElapsed > 0 ? (
                        <>Calculated via 36-month straight-line depreciation with a 10% residual scrap floor ($<strong>{(Number(formData.purchaseCost) * 0.1).toFixed(0)}</strong> minimum).</>
                      ) : (
                        <>Brand new asset: current book value equals original purchase cost.</>
                      )}
                    </p>
                  </div>

                  <div className="pt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setActiveStep(1)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <ArrowLeft className="w-4 h-4" /> Back
                    </button>

                    <button
                      type="submit"
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
                    >
                      <Check className="w-4 h-4" /> Save & Enroll
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* TECHNICAL MODE: All Fields */
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Asset Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Model Identifier</label>
                  <input
                    type="text"
                    value={formData.model || ''}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Asset Tag / Code <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.assetCode || ''}
                    onChange={(e) => setFormData({ ...formData, assetCode: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={formData.serialNumber || ''}
                    onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">MAC Address</label>
                  <input
                    type="text"
                    value={formData.macAddress || ''}
                    onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })}
                    placeholder="00:1A:2B:3C:4D:5E"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Branch Facility</label>
                  <select
                    value={formData.branchId}
                    onChange={(e) => {
                      const b = branches.find(br => br.id === e.target.value);
                      setFormData({ ...formData, branchId: e.target.value, branchName: b?.name || '' });
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="REPAIR">REPAIR</option>
                    <option value="DAMAGED">DAMAGED</option>
                    <option value="DEPRECATED">DEPRECATED</option>
                    <option value="SOLD">SOLD</option>
                    <option value="DISPOSED">DISPOSED</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Physical Condition</label>
                  <select
                    value={formData.condition || 'GOOD'}
                    onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="NEW">New (Brand New in Box)</option>
                    <option value="GOOD">Good (Pre-owned / Legacy)</option>
                    <option value="FAIR">Fair (Visible wear, operational)</option>
                    <option value="POOR">Poor (Degraded / Needs Attention)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Historical Acquisition Date</label>
                  <input
                    type="date"
                    value={formData.purchaseDate ? new Date(formData.purchaseDate).toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                      const d = e.target.value ? new Date(e.target.value).toISOString() : '';
                      const autoVal = AssetService.calculateCurrentValue(formData.purchaseCost || 0, d);
                      setFormData({ ...formData, purchaseDate: d, currentValue: autoVal });
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Original Cost ($)</label>
                  <input
                    type="number"
                    value={formData.purchaseCost || 0}
                    onChange={(e) => {
                      const cost = Number(e.target.value);
                      const autoVal = AssetService.calculateCurrentValue(cost, formData.purchaseDate);
                      setFormData({ ...formData, purchaseCost: cost, currentValue: autoVal });
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Current Depreciated Value ($)</label>
                  <input
                    type="number"
                    value={formData.currentValue ?? formData.purchaseCost ?? 0}
                    onChange={(e) => setFormData({ ...formData, currentValue: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Specifications & Hardware Telemetry
                </label>
                <textarea
                  rows={3}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-[11px] text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
                >
                  <Check className="w-4 h-4" /> Save to TiDB Ledger
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
