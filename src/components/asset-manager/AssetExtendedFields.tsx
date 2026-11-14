import React, { useId } from 'react';
import { Building2, ClipboardList } from 'lucide-react';
import { Asset, Department } from '../../types';
import {
  AssetSpecs,
  AssetSpecValue,
  OWNERSHIP_LABELS,
  SpecFieldDef,
  formatSpecValue,
  specFieldsForCategory
} from '../../../shared/asset-fields';

const INPUT_CLASS =
  'w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500 transition';
const LABEL_CLASS = 'block text-slate-300 font-semibold mb-1';
const SECTION_CLASS = 'bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80 space-y-3';
const SECTION_TITLE_CLASS = 'flex items-center gap-2 text-slate-300 font-semibold text-xs border-b border-slate-800/60 pb-2';

interface AssetExtendedFieldsProps {
  formData: Partial<Asset>;
  departments: Department[];
  onChange: (patch: Partial<Asset>) => void;
  /** Hide "Location within Branch" while the asset is with a user (it is wherever they are based). */
  hideLocation?: boolean;
}

const TextField: React.FC<{
  label: string;
  value: string;
  placeholder?: string;
  maxLength: number;
  onChange: (value: string) => void;
}> = ({ label, value, placeholder, maxLength, onChange }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS}
      />
    </div>
  );
};

const SpecField: React.FC<{
  def: SpecFieldDef;
  value: AssetSpecValue | undefined;
  onChange: (value: AssetSpecValue | undefined) => void;
}> = ({ def, value, onChange }) => {
  const id = useId();

  if (def.type === 'boolean') {
    return (
      <div className="flex items-center gap-2 sm:pt-6">
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
        />
        <label htmlFor={id} className="text-slate-300 font-semibold cursor-pointer">{def.label}</label>
      </div>
    );
  }

  if (def.type === 'select') {
    return (
      <div>
        <label htmlFor={id} className={LABEL_CLASS}>{def.label}</label>
        <select
          id={id}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={`${INPUT_CLASS} cursor-pointer`}
        >
          <option value="">Not specified</option>
          {def.options?.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className={LABEL_CLASS}>
        {def.label}
        {def.unit && <span className="text-slate-500 font-normal"> ({def.unit})</span>}
      </label>
      <input
        id={id}
        type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
        min={def.type === 'number' ? 0 : undefined}
        step={def.type === 'number' ? 'any' : undefined}
        maxLength={def.type === 'text' ? 200 : undefined}
        value={value === undefined || typeof value === 'boolean' ? '' : String(value)}
        placeholder={def.placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') return onChange(undefined);
          onChange(def.type === 'number' ? Number(raw) : raw);
        }}
        className={`${INPUT_CLASS} ${def.type === 'text' ? '' : 'font-mono'}`}
      />
    </div>
  );
};

/**
 * Form sections for the fields added on top of the core asset record:
 * location and department (every device) and the device-specific details that
 * depend on the selected category.
 */
export const AssetExtendedFields: React.FC<AssetExtendedFieldsProps> = ({ formData, departments, onChange, hideLocation = false }) => {
  const departmentId = useId();
  const specFields = specFieldsForCategory(formData.categoryId, formData.categoryName);
  const specs: AssetSpecs = formData.specs || {};
  const activeDepartments = departments.filter((d) => !(d as any).archivedAt);

  const setSpec = (key: string, value: AssetSpecValue | undefined) => {
    const next: AssetSpecs = { ...specs };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onChange({ specs: next });
  };

  return (
    <>
      <div className={SECTION_CLASS}>
        <div className={SECTION_TITLE_CLASS}>
          <Building2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          <span>Location &amp; Department</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {!hideLocation && (
            <TextField
              label="Location within Branch"
              value={formData.locationDetail || ''}
              placeholder="e.g. 2nd floor, Finance, desk 14"
              maxLength={255}
              onChange={(locationDetail) => onChange({ locationDetail })}
            />
          )}

          <div>
            <label htmlFor={departmentId} className={LABEL_CLASS}>Owning Department</label>
            <select
              id={departmentId}
              value={formData.departmentId || ''}
              onChange={(e) => {
                const dept = activeDepartments.find((d) => d.id === e.target.value);
                onChange({ departmentId: dept?.id || '', departmentName: dept?.name || '' });
              }}
              className={`${INPUT_CLASS} cursor-pointer`}
            >
              <option value="">No department</option>
              {activeDepartments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
              {/* Keep showing a department that has since been archived or is not in the loaded list. */}
              {formData.departmentId && !activeDepartments.some((d) => d.id === formData.departmentId) && (
                <option value={formData.departmentId}>{formData.departmentName || 'Current department'}</option>
              )}
            </select>
          </div>
        </div>
      </div>

      {specFields.length > 0 && (
        <div className={SECTION_CLASS}>
          <div className={SECTION_TITLE_CLASS}>
            <ClipboardList className="w-4 h-4 text-emerald-400" aria-hidden="true" />
            <span>Device Details for {formData.categoryName || 'this category'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {specFields.map((def) => (
              <SpecField key={def.key} def={def} value={specs[def.key]} onChange={(value) => setSpec(def.key, value)} />
            ))}
          </div>
        </div>
      )}
    </>
  );
};

/** Read-only list of the extended fields that have a value, for the asset detail view. */
export const AssetExtendedDetails: React.FC<{ asset: Asset }> = ({ asset }) => {
  const specFields = specFieldsForCategory(asset.categoryId, asset.categoryName);
  const specs: AssetSpecs = asset.specs || {};

  const rows: Array<[string, string]> = [];
  const add = (label: string, value?: string | null) => {
    if (value && String(value).trim()) rows.push([label, String(value).trim()]);
  };

  add('Manufacturer', asset.manufacturer);
  add('Supplier', asset.supplier);
  add('Invoice / PO', asset.invoiceNumber);
  add('Department', asset.departmentName);
  add('Location in branch', asset.locationDetail);
  if (asset.ownershipType && asset.ownershipType !== 'OWNED') {
    add('Ownership', OWNERSHIP_LABELS[asset.ownershipType]);
    add('Lease ends', asset.leaseEndDate);
  }
  for (const def of specFields) {
    add(def.label, formatSpecValue(def, specs[def.key]));
  }

  if (rows.length === 0) return null;

  return (
    <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-2xl">
      <h3 className="text-slate-500 text-[10px] uppercase font-bold mb-2">Sourcing, Ownership &amp; Device Details</h3>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-slate-800/60 pb-1.5">
            <dt className="text-slate-400">{label}</dt>
            <dd className="text-slate-100 font-medium text-right break-words min-w-0">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};
