import React, { useState, useEffect, useMemo } from 'react';
import { Asset, Branch, AssetCategory, Organization, User, Department } from '../../types';
import { AssetExtendedFields } from './AssetExtendedFields';
import { isSerialRequired, sanitizeSpecs, specFieldsForCategory } from '../../../shared/asset-fields';
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

/**
 * Ask the server for the next sequential asset tag (ORG-CAT-00001).
 * reserve=false previews the next tag; reserve=true consumes the number.
 * Resolves null when offline or the server cannot answer, so callers can fall back.
 */
async function requestAssetTag(reserve: boolean, categoryId?: string, categoryName?: string): Promise<string | null> {
  const controller = new AbortController();
  // Reserving a tag is a multi-step transaction; allow for a slow or distant database.
  const timer = setTimeout(() => controller.abort(), reserve ? 15000 : 8000);
  try {
    const query = new URLSearchParams({ categoryId: categoryId || '', categoryName: categoryName || '' });
    const res = await fetch(reserve ? '/api/assets/next-tag' : `/api/assets/next-tag?${query.toString()}`, {
      method: reserve ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: reserve ? JSON.stringify({ categoryId, categoryName }) : undefined,
      signal: controller.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.tag === 'string' && data.tag ? data.tag : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Shown in place of the branch picker while the asset is checked out to someone. */
const AssignedLocationNote: React.FC<{ userName: string }> = ({ userName }) => (
  <div className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-300 text-xs">
    With <strong className="text-slate-100">{userName}</strong>. Located where they are based.
  </div>
);

interface AssetUpsertModalProps {
  isOpen: boolean;
  editingAsset: Asset | null;
  prefilledTag?: string;
  existingAssets?: Asset[];
  branches: Branch[];
  categories: AssetCategory[];
  departments?: Department[];
  currentOrg: Organization;
  currentUser?: User;
  /** People the asset can be assigned to from the form. */
  users?: User[];
  onClose: () => void;
  /** `assignTo` is set when the asset should be checked out to that person once saved. */
  onSave: (asset: Asset, assignTo?: User) => void;
}

export const AssetUpsertModal: React.FC<AssetUpsertModalProps> = ({
  isOpen,
  editingAsset,
  prefilledTag,
  existingAssets,
  branches,
  categories,
  departments = [],
  currentOrg,
  currentUser,
  users = [],
  onClose,
  onSave
}) => {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [assigneeId, setAssigneeId] = useState<string>('');

  // Admins and managers can assign; branch managers only to people in their own branch.
  const canAssign = Boolean(currentUser && currentUser.role !== 'USER');
  const assignableUsers = useMemo(() => users
    .filter(u => (u.status || 'ACTIVE') === 'ACTIVE')
    .filter(u => currentUser?.role !== 'BRANCH_MANAGER' || u.branchId === currentUser.branchId)
    .sort((a, b) => a.fullName.localeCompare(b.fullName)), [users, currentUser]);
  const selectedAssignee = assignableUsers.find(u => u.id === assigneeId) || null;
  const lockedAssigneeName = editingAsset?.assignedToUserId
    ? (editingAsset.assignedToUserName || 'a user')
    : null;
  // The person the asset is with (being assigned now, or already). Their department is the asset's.
  const departmentOwner: User | null = selectedAssignee
    || (editingAsset?.assignedToUserId ? users.find(u => u.id === editingAsset.assignedToUserId) : undefined)
    || null;

  // An asset that is with a person is wherever that person is based, so its own
  // branch and location are only asked for while it is unassigned.
  const assignedUserName = lockedAssigneeName || selectedAssignee?.fullName || null;
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
    costSource: 'MANUAL',
    warrantyExpiry: '',
    notes: '',
    imageUrl: ''
  });

  const [suggestedCost, setSuggestedCost] = useState<number | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuccessMessage, setAiSuccessMessage] = useState('');
  const [formError, setFormError] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isTagLoading, setIsTagLoading] = useState(false);
  // The tag most recently filled in automatically. While the field still holds
  // this value the tag is "ours" to replace (category change) and to reserve on save.
  const autoTagRef = React.useRef<string | null>(null);
  const assetCodeRef = React.useRef<string>('');
  assetCodeRef.current = (formData.assetCode || '').trim();

  const formBodyRef = React.useRef<HTMLFormElement>(null);
  const modalContainerRef = React.useRef<HTMLDivElement>(null);
  const firstInputRef = React.useRef<HTMLInputElement>(null);

  // Auto-scroll to top and auto-focus when modal opens or step/mode toggles
  useEffect(() => {
    if (isOpen) {
      if (formBodyRef.current) formBodyRef.current.scrollTop = 0;
      if (modalContainerRef.current) modalContainerRef.current.scrollTop = 0;
      const timer = setTimeout(() => {
        if (firstInputRef.current && document.contains(firstInputRef.current)) {
          firstInputRef.current.focus();
        } else {
          const firstField = formBodyRef.current?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
          );
          firstField?.focus();
        }
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [isOpen, activeStep, showAdvancedFields]);

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

  const generateUniqueTag = async () => {
    // Preferred: the server's next sequential tag for this category.
    setIsTagLoading(true);
    const serverTag = await requestAssetTag(false, formData.categoryId, formData.categoryName);
    setIsTagLoading(false);
    if (serverTag) {
      autoTagRef.current = serverTag;
      setFormData(prev => ({ ...prev, assetCode: serverTag }));
      return;
    }

    // Offline fallback: a random tag checked against the assets loaded in this browser.
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
    autoTagRef.current = null;
    setFormData(prev => ({ ...prev, assetCode: newTag }));
  };

  useEffect(() => {
    if (editingAsset) {
      setFormData(editingAsset);
    } else {
      const generatedCode = prefilledTag || `AST-${Math.floor(1000 + Math.random() * 9000)}`;
      // A scanned/prefilled tag is the user's choice; a placeholder is replaced by the server's next tag.
      autoTagRef.current = prefilledTag ? null : generatedCode;
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
        costSource: 'MANUAL',
        warrantyExpiry: '',
        notes: '',
        imageUrl: ''
      });
    }
    setActiveStep(1);
    setAssigneeId('');
    setSuggestedCost(null);
    setAiSuccessMessage('');
    setFormError('');
    setIsSaving(false);
    // Reset only when the modal opens or the asset being edited changes. `branches` and
    // `categories` get a new array identity on every background data refresh; depending on
    // them here wiped the form (and anything the user had typed) every 30 seconds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingAsset, prefilledTag, isOpen]);

  // New assets: show the server's next sequential tag for the selected category,
  // as long as the user has not typed a tag of their own.
  useEffect(() => {
    if (!isOpen || editingAsset || !autoTagRef.current) return;
    let cancelled = false;
    requestAssetTag(false, formData.categoryId, formData.categoryName).then((tag) => {
      if (cancelled || !tag) return;
      if (!autoTagRef.current || assetCodeRef.current !== autoTagRef.current) return;
      autoTagRef.current = tag;
      setFormData(prev => ({ ...prev, assetCode: tag }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingAsset, formData.categoryId]);

  if (!isOpen) return null;

  const handleApplySuggestedCost = () => {
    if (suggestedCost !== null && suggestedCost > 0) {
      const autoVal = AssetService.calculateCurrentValue(suggestedCost, formData.purchaseDate || new Date().toISOString().split('T')[0]!);
      setFormData(prev => ({
        ...prev,
        purchaseCost: suggestedCost,
        currentValue: autoVal,
        costSource: 'ESTIMATED'
      }));
      setSuggestedCost(null);
      setAiSuccessMessage(`Applied suggested MSRP ($${suggestedCost.toLocaleString()}) with source: ESTIMATED.`);
    }
  };

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

      if (specs.estimatedCostUSD > 0) {
        setSuggestedCost(specs.estimatedCostUSD);
      }

      // "16GB DDR5" -> 16, "1TB SSD" -> 1024; anything unreadable is left blank.
      const toGb = (text?: string): number | undefined => {
        const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*(TB|GB)/i);
        if (!m) return undefined;
        const n = Number(m[1]);
        return m[2]!.toUpperCase() === 'TB' ? Math.round(n * 1024) : Math.round(n);
      };

      setFormData(prev => {
        const categoryId = matchedCat ? matchedCat.id : prev.categoryId;
        const categoryName = matchedCat ? matchedCat.name : prev.categoryName;
        // Fill the structured device details too (only fields this category has, and only
        // where the user has not typed a value already).
        const suggested: Record<string, string | number | undefined> = {
          cpu: specs.cpu || undefined,
          ramGb: toGb(specs.ram),
          storageGb: toGb(specs.storage)
        };
        const allowed = new Set(specFieldsForCategory(categoryId, categoryName).map(f => f.key));
        const specsNext = { ...(prev.specs || {}) };
        for (const [key, value] of Object.entries(suggested)) {
          if (value !== undefined && allowed.has(key) && (specsNext[key] === undefined || specsNext[key] === '')) {
            specsNext[key] = value;
          }
        }
        return {
          ...prev,
          name: prev.name || `${specs.manufacturer} ${specs.model}`,
          model: specs.model,
          manufacturer: prev.manufacturer || specs.manufacturer || '',
          categoryId,
          categoryName,
          specs: specsNext,
          notes: `${specs.cpu} | ${specs.ram} | ${specs.storage}${specs.ports ? ` | Ports: ${specs.ports}` : ''}\n${specs.notes}`
        };
      });

      setAiSuccessMessage(`Catalog specs populated for ${specs.model}!${specs.estimatedCostUSD > 0 ? ` Suggested MSRP: $${specs.estimatedCostUSD.toLocaleString()} (Click "Apply to Cost" to accept).` : ''}`);
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
        setSuggestedCost(specs.estimatedCostUSD);
        setAiSuccessMessage(`Suggested MSRP: $${specs.estimatedCostUSD.toLocaleString()} (Unverified Estimate). Click "Apply to Cost" to accept.`);
      } else {
        setFormError('No standard MSRP found for this model. You can enter an estimated current value or $0.');
      }
    } catch {
      setFormError('Could not estimate pricing for this model.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

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

    if (selectedAssignee && (formData.status || 'ACTIVE') !== 'ACTIVE') {
      setFormError(`Only an asset with status ACTIVE can be assigned to ${selectedAssignee.fullName}. Change the status, or set "Assigned to" back to Nobody.`);
      return;
    }

    // An assigned asset belongs to the branch its person is based at (branch managers stay in their own).
    const assigneeBranch = selectedAssignee && currentUser?.role !== 'BRANCH_MANAGER'
      ? branches.find(b => b.id === selectedAssignee.branchId)
      : undefined;
    const branch = assigneeBranch || branches.find(b => b.id === formData.branchId) || branches[0];
    const category = categories.find(c => c.id === formData.categoryId) || categories[0];
    // Branches arrive with the first data load, which can take a few seconds on a slow
    // connection. Without this check, saving before then crashed the form.
    if (!branch) {
      setFormError('No branch is available yet. Wait a moment for your data to finish loading, or add a branch under Facilities & Departments first.');
      return;
    }
    if (!category) {
      setFormError('Choose a category for this asset.');
      return;
    }

    // New computers, servers and network gear must carry the manufacturer's serial number.
    if (!editingAsset && isSerialRequired(category.id, category.name) && !formData.serialNumber?.trim()) {
      setFormError(`A manufacturer serial number is required for ${category.name}. It is printed on the device or its box.`);
      return;
    }

    if (formData.ownershipType === 'LEASED' && formData.leaseEndDate && formData.purchaseDate && formData.leaseEndDate < formData.purchaseDate) {
      setFormError('Lease end date cannot be before the acquisition date.');
      return;
    }

    // An untouched automatic tag is only a preview. Reserve the real number now so two
    // people enrolling at the same time can never end up with the same tag.
    let finalAssetCode = formData.assetCode.trim();
    if (!editingAsset && autoTagRef.current && finalAssetCode === autoTagRef.current) {
      setIsSaving(true);
      const reservedTag = await requestAssetTag(true, category.id, category.name);
      setIsSaving(false);
      if (reservedTag) finalAssetCode = reservedTag;
    }

    const payload: Asset = {
      // A new asset that is assigned straight away needs its id now, so the checkout can point at it.
      id: editingAsset?.id || (selectedAssignee ? crypto.randomUUID() : ''),
      orgId: currentOrg.id,
      name: formData.name.trim(),
      model: formData.model?.trim() || formData.name.trim(),
      assetCode: finalAssetCode,
      serialNumber: formData.serialNumber?.trim() || (formData.imeiNumber ? `IMEI-${formData.imeiNumber.trim()}` : ''),
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
      costSource: formData.costSource || 'MANUAL',
      warrantyExpiry: formData.warrantyExpiry || '',
      assignedToUserId: editingAsset?.assignedToUserId,
      assignedToUserName: editingAsset?.assignedToUserName,
      assignedAt: editingAsset?.assignedAt,
      imageUrl: formData.imageUrl || '',
      notes: formData.notes || '',
      manufacturer: formData.manufacturer?.trim() || '',
      supplier: formData.supplier?.trim() || '',
      invoiceNumber: formData.invoiceNumber?.trim() || '',
      locationDetail: formData.locationDetail?.trim() || '',
      // The owning department is only ever the assigned user's; an unassigned asset has none.
      departmentId: departmentOwner?.departmentId || '',
      departmentName: departmentOwner?.departmentName || '',
      ownershipType: formData.ownershipType || 'OWNED',
      leaseEndDate: formData.ownershipType === 'LEASED' ? (formData.leaseEndDate || '') : '',
      specs: sanitizeSpecs(category.id, category.name, formData.specs) || {}
    };

    onSave(payload, selectedAssignee || undefined);
    onClose();
  };

  return (
    <div
      ref={modalContainerRef}
      data-modal-overlay className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/85 backdrop-blur-sm flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4"
    >
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
        <form ref={formBodyRef} onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
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
                      ref={!showAdvancedFields ? firstInputRef : undefined}
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
                          onClick={generateUniqueTag} disabled={isTagLoading}
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
                            onClick={generateUniqueTag} disabled={isTagLoading}
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
                        // Check the serial here, where its field is: if this waited until Save on
                        // step 2, the user would be told to fill a field that is no longer shown.
                        if (!editingAsset && isSerialRequired(formData.categoryId, formData.categoryName) && !formData.serialNumber?.trim()) {
                          setFormError(`A manufacturer serial number is required for ${formData.categoryName || 'this category'}. It is printed on the device or its box.`);
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
                      {assignedUserName ? (
                        <AssignedLocationNote userName={assignedUserName} />
                      ) : currentUser?.role === 'BRANCH_MANAGER' ? (
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
                          setFormData({ ...formData, purchaseCost: cost, currentValue: calcVal, costSource: 'MANUAL' });
                        }}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                      {suggestedCost !== null && suggestedCost > 0 && (
                        <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300">
                          <span className="flex items-center gap-1.5 font-medium">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            Suggested MSRP: <strong>${suggestedCost.toLocaleString()}</strong> (Unverified Estimate)
                          </span>
                          <button
                            type="button"
                            onClick={handleApplySuggestedCost}
                            className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[11px] transition cursor-pointer"
                          >
                            Apply to Cost
                          </button>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Leave at $0 if original invoice is unknown; you can enter an estimated current value below.{formData.costSource === 'ESTIMATED' ? ' (Currently set to AI Estimated MSRP)' : ''}
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
                          aria-label="Current depreciated value ($)"
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
                      disabled={isSaving}
                      aria-busy={isSaving}
                      className="disabled:opacity-60 disabled:cursor-not-allowed px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
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
                      ref={showAdvancedFields ? firstInputRef : undefined}
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
                        onClick={generateUniqueTag} disabled={isTagLoading}
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
                          onClick={generateUniqueTag} disabled={isTagLoading}
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
                    {assignedUserName ? (
                      <AssignedLocationNote userName={assignedUserName} />
                    ) : currentUser?.role === 'BRANCH_MANAGER' ? (
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
                        setFormData({ ...formData, purchaseCost: cost, currentValue: autoVal, costSource: 'MANUAL' });
                      }}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                    {suggestedCost !== null && suggestedCost > 0 && (
                      <div className="mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between text-xs text-amber-300">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                          Suggested MSRP: <strong>${suggestedCost.toLocaleString()}</strong> (Unverified Estimate)
                        </span>
                        <button
                          type="button"
                          onClick={handleApplySuggestedCost}
                          className="px-2 py-0.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[11px] transition cursor-pointer"
                        >
                          Apply to Cost
                        </button>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Enter $0 if initial invoice is missing; you can set an estimated present value below.{formData.costSource === 'ESTIMATED' ? ' (Cost Source: ESTIMATED)' : ''}
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
                  <span>4. Notes &amp; Specifications</span>
                </div>

                {/* MAC address and IMEI live in section 1, shown only for the device types that have them. */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Notes &amp; specifications
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

              {/* 5. Sourcing, ownership & device-specific details */}
              <AssetExtendedFields
                formData={formData}
                departments={departments}
                assignment={canAssign ? {
                  users: assignableUsers,
                  selectedUserId: assigneeId,
                  onChange: setAssigneeId,
                  lockedToName: lockedAssigneeName ? `With ${lockedAssigneeName}` : null
                } : undefined}
                departmentFromUser={departmentOwner
                  ? { userName: departmentOwner.fullName, departmentName: departmentOwner.departmentName || '' }
                  : null}
                onChange={(patch) => setFormData(prev => ({ ...prev, ...patch }))}
              />

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
                  disabled={isSaving}
                  aria-busy={isSaving}
                  className="disabled:opacity-60 disabled:cursor-not-allowed px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
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
