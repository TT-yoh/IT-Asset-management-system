import React, { useId } from 'react';
import { Building2, ClipboardList } from 'lucide-react';
import { Asset, Department, User } from '../../types';
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
  /** "Assigned to" picker. Omitted for people who cannot assign equipment. */
  assignment?: {
    users: User[];
    selectedUserId: string;
    onChange: (userId: string) => void;
    /** Set when the asset is already checked out: shown as text, changed via the Checkouts page. */
    lockedToName?: string | null;
  };
  /** Set while the asset is with a person: its department is theirs and is shown read-only. */
  departmentFromUser?: { userName: string; departmentName: string } | null;
}

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
export const AssetExtendedFields: React.FC<AssetExtendedFieldsProps> = ({ formData, departments, onChange, assignment, departmentFromUser }) => {
  const assigneeId = useId();
  const departmentId = useId();
  const specFields = specFieldsForCategory(formData.categoryId, formData.categoryName);
  const specs: AssetSpecs = formData.specs || {};

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
          <span>Assignment &amp; Department</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* "Assigned to" takes the place of the old free-text "Location within Branch":
              a device is either with one of the system's users or kept at its branch. */}
          {assignment && (
            <div>
              <label htmlFor={assigneeId} className={LABEL_CLASS}>Assigned to</label>
              {assignment.lockedToName ? (
                <div className={`${INPUT_CLASS} text-slate-300 text-xs`}>
                  {assignment.lockedToName}. To give it to someone else, return it on the Checkouts page first.
                </div>
              ) : (
                <>
                  <select
                    id={assigneeId}
                    value={assignment.selectedUserId}
                    onChange={(e) => assignment.onChange(e.target.value)}
                    className={`${INPUT_CLASS} cursor-pointer`}
                  >
                    <option value="">Nobody (kept at the branch)</option>
                    {assignment.users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}{u.branchName ? ` (${u.branchName})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {assignment.selectedUserId
                      ? 'It will be checked out to this person when you save.'
                      : assignment.users.length === 0
                        ? 'No active users yet. Add people under Users to assign devices to them.'
                        : 'Pick one of your users, or leave it at the branch.'}
                  </p>
                </>
              )}
            </div>
          )}

          <div>
            <label htmlFor={departmentId} className={LABEL_CLASS}>Owning Department</label>
            {/* Read-only: the department always comes from the user the asset is assigned to. */}
            <div id={departmentId} className={`${INPUT_CLASS} text-slate-200`}>
              {departmentFromUser?.departmentName || 'No department'}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {!departmentFromUser
                ? 'Comes from the user it is assigned to.'
                : departmentFromUser.departmentName
                  ? `Taken from ${departmentFromUser.userName}.`
                  : `${departmentFromUser.userName} has no department. Set one for them under Users.`}
            </p>
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
