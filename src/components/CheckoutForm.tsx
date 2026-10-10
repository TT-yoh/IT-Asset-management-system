import React, { useState } from 'react';
import { Asset, User, Branch } from '../types';
import { Calendar, Laptop, AlertCircle, CheckCircle2, ArrowRight, ShieldAlert, FileText, UserCheck, MapPin, ToggleLeft, UserX, UserPlus, Phone, Mail } from 'lucide-react';

interface CheckoutFormProps {
  asset: Asset;
  users: User[];
  branches: Branch[];
  adminUser?: User;
  onSubmitCheckout: (
    user: User | { id: string; fullName: string; email?: string; avatar?: string; role?: string },
    reason: string,
    expectedReturnDate: string,
    notes: string,
    targetBranchId?: string,
    targetBranchName?: string
  ) => void;
  onCancel: () => void;
}

export const CheckoutForm: React.FC<CheckoutFormProps> = ({
  asset,
  users,
  branches,
  adminUser,
  onSubmitCheckout,
  onCancel
}) => {
  const defaultReturn = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]!;
  
  const catName = asset?.categoryName?.toLowerCase() || '';
  const isLaptopOrPhone = Boolean(
    catName.includes('laptop') ||
    catName.includes('phone') ||
    catName.includes('mobile') ||
    catName.includes('cell') ||
    catName.includes('smartphone') ||
    asset?.categoryId === 'cat-lap' ||
    asset?.categoryId === 'cat-phone'
  );

  // Assignee Type
  const [assigneeType, setAssigneeType] = useState<'REGISTERED' | 'CUSTOM'>(
    isLaptopOrPhone ? 'CUSTOM' : 'REGISTERED'
  );
  const [selectedUserId, setSelectedUserId] = useState<string>(users[0]?.id || '');
  const [customName, setCustomName] = useState<string>('');
  
  // Location / Branch Allocation
  const [selectedBranchId, setSelectedBranchId] = useState<string>(asset?.branchId || branches[0]?.id || '');

  // Checkout Details
  const [reason, setReason] = useState('Daily use');
  const [customReason, setCustomReason] = useState('');
  const [returnDate, setReturnDate] = useState(defaultReturn);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!asset) {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative text-xs text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-white">No Asset Available to Check Out</h3>
          <p className="text-slate-400 mt-1">
            There are currently no hardware assets available in the active pool. Please register devices in the Assets tab first.
          </p>
        </div>
        <div className="pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const reasonsList = [
    'Daily use',
    'Event / Conference',
    'Client Meeting',
    'Diagnostic Repair Testing',
    'Employee Training',
    'Other'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate user assignment
    let targetUser: User | { id: string; fullName: string; email?: string; avatar?: string; role?: string };
    if (assigneeType === 'REGISTERED') {
      const found = users.find(u => u.id === selectedUserId);
      if (!found) {
        setError('Please select a valid registered employee account.');
        return;
      }
      targetUser = found;
    } else {
      if (!customName.trim()) {
        setError('Please enter the name of the person being assigned custody.');
        return;
      }
      targetUser = {
        id: `custom-${encodeURIComponent(customName.trim())}`,
        fullName: customName.trim(),
        email: 'Offline / External Person',
        role: 'USER',
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(customName.trim())}`
      };
    }

    // Validate Branch
    const targetBranch = branches.find(b => b.id === selectedBranchId);
    if (!targetBranch) {
      setError('Please select a valid location or branch registration.');
      return;
    }

    const finalReason = reason === 'Other' ? customReason.trim() : reason;
    if (!finalReason) {
      setError('Please provide a valid reason for hardware checkout.');
      return;
    }

    const today = new Date().toISOString().split('T')[0]!;
    if (returnDate < today) {
      setError('Expected return date cannot be in the past.');
      return;
    }

    if (confirm(`Confirm checkout of ${asset.name} (${asset.assetCode}) to ${targetUser.fullName} at location ${targetBranch.name}?`)) {
      onSubmitCheckout(targetUser, finalReason, returnDate, notes.trim(), targetBranch.id, targetBranch.name);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-xs text-slate-300 max-h-[92vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">
              {asset.assetCode}
            </span>
            <h3 className="text-base font-bold text-slate-100 mt-0.5">{asset.name}</h3>
          </div>
        </div>

        {(asset.phoneNumber || asset.registeredEmail) && (
          <div className="flex flex-col items-end gap-1 text-right">
            {asset.phoneNumber && (
              <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px] font-semibold">
                <Phone className="w-3 h-3 text-emerald-400" />
                <span>{asset.phoneNumber}</span>
              </span>
            )}
            {asset.registeredEmail && (
              <span className="flex items-center gap-1 text-sky-400 font-mono text-[10.5px]">
                <Mail className="w-3 h-3 text-sky-400" />
                <span>{asset.registeredEmail}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="my-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 mt-4">
        {isLaptopOrPhone && (
          <div className="p-3.5 bg-sky-500/10 border border-sky-500/30 rounded-2xl mb-4 text-sky-300">
            <p className="font-semibold text-slate-100 flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-sky-400 animate-pulse" />
              <span>Laptop / Cellphone Assignment</span>
            </p>
            <p className="text-[11px] mt-1 text-slate-400">
              Please make sure to write the exact name of the person this portable unit is being given to below.
            </p>
          </div>
        )}

        {/* Assignee Selection Type */}
        <div>
          <label className="block text-slate-300 font-semibold mb-2">
            Custody Assignment Option
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAssigneeType('REGISTERED')}
              className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 ${
                assigneeType === 'REGISTERED'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold shadow'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              <span>Registered Account</span>
            </button>
            <button
              type="button"
              onClick={() => setAssigneeType('CUSTOM')}
              className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 ${
                assigneeType === 'CUSTOM'
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold shadow'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>No Account Needed</span>
            </button>
          </div>
        </div>

        {/* Selected Assignee Field */}
        <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800">
          {assigneeType === 'REGISTERED' ? (
            <div className="space-y-2">
              <label className="block text-slate-400 font-semibold">Select Staff Account</label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.role} - {u.branchName})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-slate-400 font-semibold">
                {isLaptopOrPhone ? "Name of Person Given To *" : "Enter Assignee Full Name"}
              </label>
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder={isLaptopOrPhone ? "Write the name of the person given to..." : "Type assignee full name..."}
                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-2.5 focus:outline-none focus:border-emerald-500 font-semibold"
              />
              <p className="text-[10px] text-slate-500 font-mono">
                {isLaptopOrPhone 
                  ? "Assigns immediate laptop/phone custody with no login required." 
                  : "Assign custody instantly with no user credentials required."}
              </p>
            </div>
          )}
        </div>

        {/* Branch / Location Allocation */}
        <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2">
          <label className="block text-slate-300 font-semibold flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-sky-400" />
            <span>Target Branch or Site Location *</span>
          </label>
          <select
            value={selectedBranchId}
            onChange={e => setSelectedBranchId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl p-2.5 focus:outline-none focus:border-emerald-500"
          >
            {branches.length === 0 ? (
              <option value="">No Branches Configured - Register Under Secure Portal</option>
            ) : (
              branches.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.city}, {b.country})
                </option>
              ))
            )}
          </select>
          <p className="text-[10px] text-slate-500">Asset record location will update automatically to this branch.</p>
        </div>

        {/* Reason Dropdown */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>Checkout Purpose / Reason *</span>
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-emerald-500 transition"
          >
            {reasonsList.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {reason === 'Other' && (
          <div>
            <label className="block text-slate-400 mb-1">Specify Custom Reason *</label>
            <input
              type="text"
              required
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="e.g. Field engineering test project..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        )}

        {/* Return Date Picker */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-sky-400" />
            <span>Expected Return Date *</span>
          </label>
          <input
            type="date"
            required
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
          />
          <p className="text-[10px] text-amber-400/80 mt-1 flex items-center gap-1 font-mono">
            <ShieldAlert className="w-3 h-3" />
            <span>Overdue tracking active. Standard custody alerts trigger past return date.</span>
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1">Accessories Included / Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Original MagSafe 140W charger and padded Targus sleeve included..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 h-20 focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
          />
        </div>

        {/* Actions */}
        <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-2"
          >
            <span>Complete Checkout</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
