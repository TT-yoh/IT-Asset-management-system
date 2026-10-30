import React, { useState, useEffect, useMemo } from 'react';
import { Asset, Branch, AssetCategory, Organization, User } from '../../types';
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
  SlidersHorizontal,
  Info,
  AlertTriangle,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';
import { fetchHardwareSpecs } from '../../lib/ai/specs';
import { AssetService } from '../../lib/asset-service';

interface AssetUpsertModalProps {
  isOpen: boolean;
  editingAsset: Asset | null;
  prefilledTag?: string;
  existingAssets?: Asset[];
  branches: Branch[];
  categories: AssetCategory[];
  currentOrg: Organization;
  currentUser?: User;
  onClose: () => void;
  onSave: (asset: Asset) => void;
}

export const AssetUpsertModal: React.FC<AssetUpsertModalProps> = ({
  isOpen,
  editingAsset,
  prefilledTag,
  existingAssets,
  branches,
  categories,
  currentOrg,
  currentUser,
  onClose,
  onSave
}) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [showAdvancedFields, setShowAdvancedFields] = useState<boolean>(true);

  const [formData, setFormData] = useState<Partial<Asset>>({
    name: '',
    model: '',
    assetCode: '',
    serialNumber: '',
    macAddress: '',
    imeiNumber: '',
    phoneNumber: '',
    categoryId: categories[0]?.id || 'cat-1',
    categoryName: categories[0]?.name || 'Laptop',
    branchId: branches[0]?.id || '',
    branchName: branches[0]?.name || '',
    status: 'ACTIVE',
    condition: 'NEW',
    purchaseDate: new Date().toISOString().split('T')[0],
    purchaseCost: 0,
    currentValue: 0,
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

  // Category-specific hardware identifier context
  const isPhoneOrTablet = Boolean(
    formData.categoryName?.toLowerCase().includes('phone') ||
    formData.categoryName?.toLowerCase().includes('mobile') ||
    formData.categoryName?.toLowerCase().includes('tablet') ||
    formData.categoryName?.toLowerCase().includes('satcom')
  );

  const isNetworking = Boolean(
    formData.categoryName?.toLowerCase().includes('network') ||
    formData.categoryName?.toLowerCase().includes('switch') ||
    formData.categoryName?.toLowerCase().includes('router') ||
    formData.categoryName?.toLowerCase().includes('printer') ||
    formData.categoryName?.toLowerCase().includes('firewall')
  );

  const isPeripheral = Boolean(
    formData.categoryName?.toLowerCase().includes('keyboard') ||
    formData.categoryName?.toLowerCase().includes('mouse') ||
    formData.categoryName?.toLowerCase().includes('dock') ||
    formData.categoryName?.toLowerCase().includes('periph') ||
    formData.categoryName?.toLowerCase().includes('cable') ||
    formData.categoryName?.toLowerCase().includes('accessory')
  );

  // Live Redundant Data & Duplicate Detection
  const redundancyCheck = useMemo(() => {
    if (!existingAssets || existingAssets.length === 0) {
      return {
        tagConflict: null as Asset | null,
        serialConflict: null as Asset | null,
        macConflict: null as Asset | null,
        imeiConflict: null as Asset | null,
        identicalModelCount: 0,
        hasBlockingConflict: false
      };
    }

    const currentId = editingAsset?.id;
    const cleanCode = (formData.assetCode || '').trim().toLowerCase();
    const cleanSerial = (formData.serialNumber || '').trim().toLowerCase();
    const cleanMac = (formData.macAddress || '').trim().toLowerCase();
    const cleanImei = (formData.imeiNumber || '').trim().toLowerCase();
    const cleanModel = (formData.model || formData.name || '').trim().toLowerCase();

    // 1. Asset Tag Conflict
    const tagConflict = cleanCode ? existingAssets.find(
      a => a.id !== currentId && a.assetCode?.trim().toLowerCase() === cleanCode
    ) || null : null;

    // 2. Chassis Serial Conflict (ignore auto-generated placeholder serials like SN-AST or SN-bulk)
    const isAutoSerial = cleanSerial.startsWith('sn-ast') || cleanSerial.startsWith('sn-bulk') || cleanSerial.length <= 4;
    const serialConflict = (cleanSerial && !isAutoSerial) ? existingAssets.find(
      a => a.id !== currentId && a.serialNumber?.trim().toLowerCase() === cleanSerial
    ) || null : null;

    // 3. MAC Address Conflict
    const macConflict = cleanMac ? existingAssets.find(
      a => a.id !== currentId && a.macAddress?.trim().toLowerCase() === cleanMac
    ) || null : null;

    // 4. IMEI Conflict
    const imeiConflict = cleanImei ? existingAssets.find(
      a => a.id !== currentId && a.imeiNumber?.trim().toLowerCase() === cleanImei
    ) || null : null;

    // 5. Identical models in inventory count
    const identicalModelCount = cleanModel ? existingAssets.filter(
      a => a.id !== currentId && (
        (a.model && a.model.trim().toLowerCase() === cleanModel) ||
        (a.name && a.name.trim().toLowerCase() === cleanModel)
      )
    ).length : 0;

    const hasBlockingConflict = Boolean(tagConflict || serialConflict || macConflict || imeiConflict);

    return {
      tagConflict,
      serialConflict,
      macConflict,
      imeiConflict,
      identicalModelCount,
      hasBlockingConflict
    };
  }, [formData.assetCode, formData.serialNumber, formData.macAddress, formData.imeiNumber, formData.model, formData.name, existingAssets, editingAsset]);

  const generateUniqueTag = () => {
    let newTag = '';
    let isUnique = false;
    let attempts = 0;
    const cat = formData.categoryName || '';
    let prefix = 'AST';
    if (cat.toLowerCase().includes('laptop')) prefix = 'AST-LPT';
    else if (cat.toLowerCase().includes('phone') || cat.toLowerCase().includes('mobile') || cat.toLowerCase().includes('tablet')) prefix = 'AST-PHN';
    else if (cat.toLowerCase().includes('server')) prefix = 'AST-SRV';
    else if (cat.toLowerCase().includes('network') || cat.toLowerCase().includes('switch') || cat.toLowerCase().includes('router')) prefix = 'AST-NET';
    else if (cat.toLowerCase().includes('monitor') || cat.toLowerCase().includes('display')) prefix = 'AST-MON';

    while (!isUnique && attempts < 100) {
      attempts++;
      newTag = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
      if (!existingAssets || !existingAssets.some(a => a.assetCode?.toLowerCase() === newTag.toLowerCase())) {
        isUnique = true;
      }
    }
    setFormData(prev => ({ ...prev, assetCode: newTag }));
  };

  useEffect(() => {
    if (editingAsset) {
      setFormData(editingAsset);
    } else {
      const generatedCode = prefilledTag || `AST-${Math.floor(1000 + Math.random() * 9000)}`;
      const defaultBranch = (currentUser?.role === 'BRANCH_MANAGER' && currentUser.branchId)
        ? (branches.find(b => b.id === currentUser.branchId) || { id: currentUser.branchId, name: currentUser.branchName || '' })
        : (branches[0] || { id: '', name: '' });

      setFormData({
        name: '',
        model: '',
        assetCode: generatedCode,
        serialNumber: '',
        macAddress: '',
        imeiNumber: '',
        phoneNumber: '',
        categoryId: categories[0]?.id || 'cat-1',
        categoryName: categories[0]?.name || 'Laptop',
        branchId: defaultBranch.id,
        branchName: defaultBranch.name,
        status: 'ACTIVE',
        condition: 'NEW',
        purchaseDate: new Date().toISOString().split('T')[0],
        purchaseCost: 0,
        currentValue: 0,
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

  const handleEstimateCost = async () => {
    const query = formData.model || formData.name;
    if (!query || query.trim().length === 0) {
      setFormError('Please enter a device model or name first to look up standard MSRP.');
      return;
    }

    setAiLoading(true);
    setFormError('');
    try {
      const specs = await fetchHardwareSpecs(query);
      if (specs.estimatedCostUSD > 0) {
        const autoVal = AssetService.calculateCurrentValue(specs.estimatedCostUSD, formData.purchaseDate || new Date().toISOString().split('T')[0]!);
        setFormData(prev => ({
          ...prev,
          purchaseCost: specs.estimatedCostUSD,
          currentValue: autoVal
        }));
        setAiSuccessMessage(`Estimated retail MSRP ($${specs.estimatedCostUSD.toLocaleString()}) applied for ${specs.model}!`);
      } else {
        setFormError('No standard MSRP found for this model. You can enter an estimated current value or $0.');
      }
    } catch {
      setFormError('Could not estimate pricing for this model.');
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

    if (redundancyCheck.tagConflict) {
      setFormError(`Redundant Asset Tag: "${formData.assetCode?.trim()}" is already assigned to "${redundancyCheck.tagConflict.name}" (${redundancyCheck.tagConflict.branchName}). Click "Auto-Tag" or enter a unique barcode.`);
      return;
    }

    if (redundancyCheck.serialConflict) {
      setFormError(`Redundant Serial Number: "${formData.serialNumber?.trim()}" is already registered to "${redundancyCheck.serialConflict.name}" (Tag: ${redundancyCheck.serialConflict.assetCode}). Factory chassis serial numbers must be unique.`);
      return;
    }

    if (redundancyCheck.macConflict) {
      setFormError(`Redundant MAC Address: "${formData.macAddress?.trim()}" is already assigned to "${redundancyCheck.macConflict.name}" (Tag: ${redundancyCheck.macConflict.assetCode}).`);
      return;
    }

    if (redundancyCheck.imeiConflict) {
      setFormError(`Redundant IMEI Number: "${formData.imeiNumber?.trim()}" is already assigned to "${redundancyCheck.imeiConflict.name}" (Tag: ${redundancyCheck.imeiConflict.assetCode}).`);
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
      serialNumber: formData.serialNumber?.trim() || (formData.imeiNumber ? `IMEI-${formData.imeiNumber.trim()}` : `SN-${formData.assetCode.trim()}`),
      macAddress: formData.macAddress?.trim(),
      imeiNumber: formData.imeiNumber?.trim(),
      phoneNumber: formData.phoneNumber?.trim(),
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
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
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
                  {showAdvancedFields ? 'Full Inventory View' : '2-Step Quick Intake'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {currentOrg.name} Primary TiDB Ledger
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* View Mode Segmented Switch */}
            <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setShowAdvancedFields(true)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  showAdvancedFields
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="View and edit all hardware, network, location, and financial fields"
              >
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">All Details</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAdvancedFields(false);
                  setActiveStep(1);
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  !showAdvancedFields
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Switch to 2-step simplified intake"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">2-Step Quick</span>
              </button>
            </div>

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
                      placeholder="e.g. MacBook Pro 16, Dell XPS 15, or Dell Latitude 5540"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Hardware model name. Multiple identical laptops share the same model.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-slate-300 font-semibold">
                          Asset Tag / Barcode <span className="text-rose-400">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={generateUniqueTag}
                          className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold transition cursor-pointer"
                          title="Generate a unique conflict-free asset tag"
                        >
                          <RefreshCw className="w-2.5 h-2.5" /> Auto-Generate
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={formData.assetCode || ''}
                        onChange={(e) => setFormData({ ...formData, assetCode: e.target.value })}
                        placeholder="e.g. CORP-042 or AST-1042"
                        className={`w-full px-3 py-2 bg-slate-950 border rounded-xl font-mono text-emerald-400 focus:outline-none transition ${
                          redundancyCheck.tagConflict
                            ? 'border-amber-500/80 bg-amber-950/20 focus:border-amber-400'
                            : 'border-slate-700 focus:border-emerald-500'
                        }`}
                      />
                      {redundancyCheck.tagConflict ? (
                        <div className="mt-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 truncate">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="truncate">
                              Tag in use by <strong>{redundancyCheck.tagConflict.name}</strong> ({redundancyCheck.tagConflict.branchName})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={generateUniqueTag}
                            className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-semibold shrink-0 cursor-pointer transition"
                          >
                            New Tag
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 mt-0.5">Type your own custom code, scan a physical sticker, or click Auto-Generate.</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Manufacturer Serial (S/N)
                      </label>
                      <input
                        type="text"
                        value={formData.serialNumber || ''}
                        onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                        placeholder="e.g. 7X9K2M3 or C02G8..."
                        className={`w-full px-3 py-2 bg-slate-950 border rounded-xl font-mono text-slate-100 focus:outline-none transition ${
                          redundancyCheck.serialConflict
                            ? 'border-rose-500/80 bg-rose-950/20 focus:border-rose-400'
                            : 'border-slate-700 focus:border-emerald-500'
                        }`}
                      />
                      {redundancyCheck.serialConflict ? (
                        <div className="mt-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <div>
                            <strong>Duplicate Serial:</strong> In use by <strong>{redundancyCheck.serialConflict.name}</strong> (Tag: {redundancyCheck.serialConflict.assetCode}). Factory serial numbers must be unique.
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 mt-0.5">Factory chassis S/N or Service Tag underneath.</p>
                      )}
                    </div>
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

                  {/* Differentiating Identical Units Guidance Callout */}
                  {redundancyCheck.identicalModelCount > 0 ? (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2.5 text-xs text-blue-200">
                      <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-blue-300">
                          Identical Model Fleet Notice ({redundancyCheck.identicalModelCount} existing in inventory)
                        </span>
                        <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                          You already have {redundancyCheck.identicalModelCount} other <strong>{formData.model || formData.name}</strong> unit(s) enrolled. The system distinguishes identical machines through their distinct <strong>Asset Tag</strong> and <strong>Chassis Serial Number</strong>.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2.5 text-xs text-blue-200">
                      <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-blue-300">Enrolling multiple identical laptops?</span>
                        <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                          Identical laptops can have the exact same Model and Name. The system distinguishes them using their unique <strong>Asset Tag</strong> (the barcode sticker you attach) and manufacturer <strong>Serial Number</strong> (from the chassis).
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (!formData.name?.trim()) {
                          setFormError('Please enter a device model or name.');
                          return;
                        }
                        if (redundancyCheck.tagConflict) {
                          setFormError(`Asset Tag "${formData.assetCode}" is already in use by "${redundancyCheck.tagConflict.name}". Please generate or enter a distinct tag.`);
                          return;
                        }
                        if (redundancyCheck.serialConflict) {
                          setFormError(`Serial Number "${formData.serialNumber}" is already in use by "${redundancyCheck.serialConflict.name}".`);
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
                      {currentUser?.role === 'BRANCH_MANAGER' ? (
                        <div className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-emerald-400 font-mono text-xs font-semibold">
                          {currentUser.branchName || formData.branchName || 'Assigned Branch'}
                        </div>
                      ) : (
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
                      )}
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
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-slate-300 font-semibold">
                          Original Purchase Cost ($)
                        </label>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                purchaseCost: 0,
                                notes: prev.notes ? `${prev.notes}\n[Acquisition cost unknown - legacy/inherited intake]` : '[Acquisition cost unknown - legacy/inherited intake]'
                              }));
                            }}
                            className="text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                            title="Set initial cost to $0 for legacy/inherited assets without invoices"
                          >
                            Cost Unknown ($0)?
                          </button>
                          <span className="text-slate-600">•</span>
                          <button
                            type="button"
                            onClick={handleEstimateCost}
                            disabled={aiLoading}
                            className="text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
                            title="Look up standard retail MSRP from the model name"
                          >
                            Estimate MSRP
                          </button>
                        </div>
                      </div>
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
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Leave at $0 if original invoice is unknown; you can enter an estimated current value below.
                      </p>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Operational Status
                      </label>
                      <select
                        value={formData.status || 'ACTIVE'}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="ACTIVE">ACTIVE (In Service)</option>
                        <option value="REPAIR">REPAIR (Maintenance)</option>
                        <option value="DAMAGED">DAMAGED</option>
                        <option value="DEPRECATED">DEPRECATED</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Warranty Expiry Date
                      </label>
                      <input
                        type="date"
                        value={formData.warrantyExpiry ? formData.warrantyExpiry.split('T')[0] : ''}
                        onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })}
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
            /* FULL INVENTORY VIEW: All Details Structured Cleanly */
            <div className="space-y-4">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2.5 text-xs text-blue-200">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Complete Inventory Ledger:</strong> Every field is captured for this asset. For identical laptops, keep <em>Model</em> the same, and differentiate using the unique <em>Asset Tag</em> and <em>Serial Number</em>.
                </span>
              </div>

              {/* 1. Hardware Identity & Tagging */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs border-b border-slate-800/60 pb-2">
                  <Tag className="w-4 h-4 text-emerald-400" />
                  <span>1. Hardware Identity &amp; Tagging</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Asset Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      placeholder="e.g. Dell Latitude 5540 - FIN01"
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Common display name or department device name.</p>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Model Identifier</label>
                    <input
                      type="text"
                      value={formData.model || ''}
                      placeholder="e.g. Latitude 5540"
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">Hardware model specification (shared across identical units).</p>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Category</label>
                    <select
                      value={formData.categoryId}
                      onChange={(e) => {
                        const c = categories.find(cat => cat.id === e.target.value);
                        setFormData({ ...formData, categoryId: e.target.value, categoryName: c?.name || 'Hardware' });
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-300 font-semibold">
                        Asset Tag / Barcode <span className="text-rose-400">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={generateUniqueTag}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold transition cursor-pointer"
                        title="Generate a unique conflict-free asset tag"
                      >
                        <RefreshCw className="w-2.5 h-2.5" /> Auto-Generate
                      </button>
                    </div>
                    <input
                      type="text"
                      required
                      value={formData.assetCode || ''}
                      placeholder="e.g. CORP-042 or AST-1042"
                      onChange={(e) => setFormData({ ...formData, assetCode: e.target.value })}
                      className={`w-full px-3 py-2 bg-slate-900 border rounded-xl font-mono text-emerald-400 focus:outline-none transition ${
                        redundancyCheck.tagConflict
                          ? 'border-amber-500/80 bg-amber-950/20 focus:border-amber-400'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                    {redundancyCheck.tagConflict ? (
                      <div className="mt-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">
                            Tag in use by <strong>{redundancyCheck.tagConflict.name}</strong> ({redundancyCheck.tagConflict.branchName})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={generateUniqueTag}
                          className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-[10px] font-semibold shrink-0 cursor-pointer transition"
                        >
                          New Tag
                        </button>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-0.5">Type your own custom code, scan a physical sticker, or click Auto-Generate.</p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 font-semibold mb-1">
                      {isPhoneOrTablet
                        ? 'Manufacturer Serial Number (Optional for mobile phones)'
                        : isNetworking
                          ? 'Chassis Serial Number (Optional)'
                          : isPeripheral
                            ? 'Manufacturer Serial # (Optional - tracked by Asset Tag)'
                            : 'Manufacturer Serial Number (S/N)'}
                    </label>
                    <input
                      type="text"
                      value={formData.serialNumber || ''}
                      placeholder={
                        isPhoneOrTablet
                          ? 'Optional for phones (Identified by IMEI below)'
                          : isPeripheral
                            ? 'Optional (Tracked primarily by Asset Tag barcode/QR)'
                            : 'e.g. 7X9K2M3 or C02G8...'
                      }
                      onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      className={`w-full px-3 py-2 bg-slate-900 border rounded-xl font-mono text-slate-100 focus:outline-none transition ${
                        redundancyCheck.serialConflict
                          ? 'border-rose-500/80 bg-rose-950/20 focus:border-rose-400'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                    {redundancyCheck.serialConflict ? (
                      <div className="mt-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Duplicate Serial:</strong> Already registered to <strong>{redundancyCheck.serialConflict.name}</strong> (Tag: {redundancyCheck.serialConflict.assetCode}). Factory serial numbers must be unique.
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {isPhoneOrTablet
                          ? 'Phones rarely feature external chassis serial numbers; the IMEI and cellular line below serve as primary identifiers.'
                          : isPeripheral
                            ? 'Keyboards, mice, and docks often share batch numbers or lack serials. The Asset Tag barcode / QR sticker serves as the primary identifier.'
                            : 'Factory hardware serial number or Dell Service Tag from chassis.'}
                      </p>
                    )}
                  </div>

                  {/* Promoted Primary Cellular Identifiers for Phones & Tablets */}
                  {isPhoneOrTablet && (
                    <>
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">
                          IMEI / Cellular ID <span className="text-emerald-400 font-mono text-[11px]">(Primary Phone Identifier)</span>
                        </label>
                        <input
                          type="text"
                          value={formData.imeiNumber || ''}
                          onChange={(e) => setFormData({ ...formData, imeiNumber: e.target.value })}
                          placeholder="e.g. 354892091234567"
                          className={`w-full px-3 py-2 bg-slate-900 border rounded-xl font-mono text-slate-100 focus:outline-none transition ${
                            redundancyCheck.imeiConflict
                              ? 'border-rose-500/80 bg-rose-950/20 focus:border-rose-400'
                              : 'border-slate-700 focus:border-emerald-500'
                          }`}
                        />
                        {redundancyCheck.imeiConflict ? (
                          <div className="mt-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                            <span>IMEI in use by <strong>{redundancyCheck.imeiConflict.name}</strong> ({redundancyCheck.imeiConflict.assetCode}).</span>
                          </div>
                        ) : (
                          <p className="text-[10px] text-emerald-400/90 mt-0.5">15-digit hardware IMEI. Dial *#06# on device or scan box barcode.</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">
                          Corporate SIM / Mobile Line
                        </label>
                        <input
                          type="text"
                          value={formData.phoneNumber || ''}
                          onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                          placeholder="e.g. +263 77 123 4567"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                        />
                        <p className="text-[10px] text-slate-400 mt-0.5">Corporate line number or SIM card assigned to handset.</p>
                      </div>
                    </>
                  )}

                  {/* Promoted MAC Address for Networking Gear */}
                  {isNetworking && (
                    <div className="sm:col-span-2">
                      <label className="block text-slate-300 font-semibold mb-1">
                        Network MAC Address <span className="text-emerald-400 font-mono text-[11px]">(Primary Hardware Identifier)</span>
                      </label>
                      <input
                        type="text"
                        value={formData.macAddress || ''}
                        onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })}
                        placeholder="e.g. 00:1A:2B:3C:4D:5E"
                        className={`w-full px-3 py-2 bg-slate-900 border rounded-xl font-mono text-slate-100 focus:outline-none transition ${
                          redundancyCheck.macConflict
                            ? 'border-rose-500/80 bg-rose-950/20 focus:border-rose-400'
                            : 'border-slate-700 focus:border-emerald-500'
                        }`}
                      />
                      {redundancyCheck.macConflict ? (
                        <div className="mt-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span>MAC in use by <strong>{redundancyCheck.macConflict.name}</strong> ({redundancyCheck.macConflict.assetCode}).</span>
                        </div>
                      ) : (
                        <p className="text-[10px] text-emerald-400/90 mt-0.5">Physical MAC address from hardware chassis backplate or switch port 1.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Facility & Operational Status */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs border-b border-slate-800/60 pb-2">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                  <span>2. Facility &amp; Operational Status</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Branch Facility</label>
                    {currentUser?.role === 'BRANCH_MANAGER' ? (
                      <div className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-emerald-400 font-mono text-xs font-semibold">
                        {currentUser.branchName || formData.branchName || 'Assigned Branch'}
                      </div>
                    ) : (
                      <select
                        value={formData.branchId}
                        onChange={(e) => {
                          const b = branches.find(br => br.id === e.target.value);
                          setFormData({ ...formData, branchId: e.target.value, branchName: b?.name || '' });
                        }}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        {branches.map(b => (
                          <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="ACTIVE">ACTIVE (In Service / Available)</option>
                      <option value="REPAIR">REPAIR (Under Maintenance)</option>
                      <option value="DAMAGED">DAMAGED (Out of Service)</option>
                      <option value="DEPRECATED">DEPRECATED (End of Life)</option>
                      <option value="SOLD">SOLD</option>
                      <option value="DISPOSED">DISPOSED</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Physical Condition</label>
                    <select
                      value={formData.condition || 'GOOD'}
                      onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="NEW">New (Brand New in Box)</option>
                      <option value="GOOD">Good (Pre-owned / Legacy)</option>
                      <option value="FAIR">Fair (Visible wear, operational)</option>
                      <option value="POOR">Poor (Degraded / Needs Attention)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 3. Acquisition, Valuation & Warranty */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs border-b border-slate-800/60 pb-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>3. Financials, Depreciation &amp; Warranty</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Acquisition Date</label>
                    <input
                      type="date"
                      value={formData.purchaseDate ? formData.purchaseDate.split('T')[0] : ''}
                      onChange={(e) => {
                        const newDate = e.target.value;
                        const autoVal = AssetService.calculateCurrentValue(Number(formData.purchaseCost) || 0, newDate);
                        setFormData({ ...formData, purchaseDate: newDate, currentValue: autoVal });
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-300 font-semibold">Original Purchase Cost ($)</label>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              purchaseCost: 0,
                              notes: prev.notes ? `${prev.notes}\n[Acquisition cost unknown - legacy/inherited intake]` : '[Acquisition cost unknown - legacy/inherited intake]'
                            }));
                          }}
                          className="text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
                          title="Set initial cost to $0 for legacy/inherited assets without invoices"
                        >
                          Cost Unknown ($0)?
                        </button>
                        <span className="text-slate-600">•</span>
                        <button
                          type="button"
                          onClick={handleEstimateCost}
                          disabled={aiLoading}
                          className="text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
                          title="Look up standard retail MSRP from the model name"
                        >
                          Estimate MSRP
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={formData.purchaseCost || 0}
                      onChange={(e) => {
                        const cost = Number(e.target.value);
                        const autoVal = AssetService.calculateCurrentValue(cost, formData.purchaseDate || new Date().toISOString().split('T')[0]!);
                        setFormData({ ...formData, purchaseCost: cost, currentValue: autoVal });
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Enter $0 if initial invoice is missing; you can set an estimated present value below.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-300 font-semibold">Current Book Value ($)</label>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, currentValue: computedDepreciatedValue })}
                        className="text-[10px] text-emerald-400 hover:underline font-mono"
                        title="Reset to 36-month straight-line depreciation formula"
                      >
                        Reset to ${computedDepreciatedValue}
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={formData.currentValue ?? computedDepreciatedValue}
                      onChange={(e) => setFormData({ ...formData, currentValue: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl font-mono text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-300 font-semibold">Warranty Expiry Date</label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setFullYear(d.getFullYear() + 1);
                            setFormData({ ...formData, warrantyExpiry: d.toISOString().split('T')[0]! });
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          +1 Yr
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setFullYear(d.getFullYear() + 3);
                            setFormData({ ...formData, warrantyExpiry: d.toISOString().split('T')[0]! });
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        >
                          +3 Yrs
                        </button>
                      </div>
                    </div>
                    <input
                      type="date"
                      value={formData.warrantyExpiry ? formData.warrantyExpiry.split('T')[0] : ''}
                      onChange={(e) => setFormData({ ...formData, warrantyExpiry: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Technical Specifications & Network */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3">
                <div className="flex items-center gap-2 text-slate-300 font-semibold text-xs border-b border-slate-800/60 pb-2">
                  <Cpu className="w-4 h-4 text-emerald-400" />
                  <span>4. Technical Specifications, Specs &amp; Network</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Network MAC Address</label>
                    <input
                      type="text"
                      value={formData.macAddress || ''}
                      onChange={(e) => setFormData({ ...formData, macAddress: e.target.value })}
                      placeholder="00:1A:2B:3C:4D:5E"
                      className={`w-full px-3 py-2 bg-slate-900 border rounded-xl font-mono text-slate-100 focus:outline-none transition ${
                        redundancyCheck.macConflict
                          ? 'border-rose-500/80 bg-rose-950/20 focus:border-rose-400'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                    {redundancyCheck.macConflict ? (
                      <div className="mt-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>
                          MAC in use by <strong>{redundancyCheck.macConflict.name}</strong> ({redundancyCheck.macConflict.assetCode}).
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-0.5">Physical Wi-Fi or Ethernet MAC address.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">IMEI / Cellular Identifier</label>
                    <input
                      type="text"
                      value={formData.imeiNumber || ''}
                      onChange={(e) => setFormData({ ...formData, imeiNumber: e.target.value })}
                      placeholder="e.g. 354892091234567"
                      className={`w-full px-3 py-2 bg-slate-900 border rounded-xl font-mono text-slate-100 focus:outline-none transition ${
                        redundancyCheck.imeiConflict
                          ? 'border-rose-500/80 bg-rose-950/20 focus:border-rose-400'
                          : 'border-slate-700 focus:border-emerald-500'
                      }`}
                    />
                    {redundancyCheck.imeiConflict ? (
                      <div className="mt-1.5 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>
                          IMEI in use by <strong>{redundancyCheck.imeiConflict.name}</strong> ({redundancyCheck.imeiConflict.assetCode}).
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 mt-0.5">For cellular LTE laptops, tablets, or phones.</p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 font-semibold mb-1">
                      Specifications &amp; Hardware Telemetry (CPU, RAM, SSD, Ports)
                    </label>
                    <textarea
                      rows={3}
                      value={formData.notes || ''}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder="Populated automatically when clicking 'Auto-fill from Catalog' above, or enter specs manually (e.g. Intel Core i7-1370P | 32GB RAM | 1TB SSD | 2x Thunderbolt 4)."
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl font-mono text-[11px] text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Submit / Cancel Actions */}
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
