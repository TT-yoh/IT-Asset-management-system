import React, { useState } from 'react';
import { Asset, User, Branch, CheckoutRecord } from '../../types';
import { X, ArrowRightLeft, UserCheck, Calendar, FileText, Check } from 'lucide-react';

interface AssetCheckOutModalProps {
  isOpen: boolean;
  asset: Asset | null;
  users: User[];
  currentUser: User;
  onClose: () => void;
  onCheckout: (record: CheckoutRecord, updatedAsset?: Asset) => void;
}

export const AssetCheckOutModal: React.FC<AssetCheckOutModalProps> = ({
  isOpen,
  asset,
  users,
  currentUser,
  onClose,
  onCheckout
}) => {
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || '');
  const [expectedReturn, setExpectedReturn] = useState(
    new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');

  if (!isOpen || !asset) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const targetUser = users.find(u => u.id === selectedUserId) || users[0] || currentUser;
    const nowIso = new Date().toISOString().split('T')[0]!;

    const checkoutRecord: CheckoutRecord = {
      id: `chk-${Date.now()}`,
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.name,
      checkedOutBy: currentUser.fullName,
      checkedOutToUserId: targetUser.id,
      checkedOutToUserName: targetUser.fullName,
      checkedOutAt: nowIso,
      expectedReturnDate: expectedReturn || nowIso,
      reason: 'Standard Equipment Assignment',
      status: 'ACTIVE',
      returnCondition: asset.condition,
      notes: notes || `Direct custody assignment at ${asset.branchName}`
    };

    const updatedAsset: Asset = {
      ...asset,
      assignedToUserId: targetUser.id,
      assignedToUserName: targetUser.fullName,
      assignedAt: nowIso
    };

    onCheckout(checkoutRecord, updatedAsset);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Assign Asset Custody</h2>
              <p className="text-xs text-slate-400 font-mono">
                {asset.assetCode} • {asset.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {/* Target Custodian */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Select Custodian / Staff Member
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} ({u.role} - {u.branchName || 'HQ'})
                </option>
              ))}
            </select>
          </div>

          {/* Expected Return Date */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Expected Return Date
            </label>
            <input
              type="date"
              required
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Checkout Notes */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              Assignment Notes / Project Scope
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Assigned for Q3 engineering project..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" /> Confirm Assignment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
