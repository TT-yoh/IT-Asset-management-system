import React, { useState } from 'react';
import { Asset, CheckoutRecord, AssetCondition } from '../types';
import { CheckCircle2, AlertTriangle, Wrench, ShieldAlert, ArrowRight, Laptop, FileText } from 'lucide-react';

interface CheckinFormProps {
  asset: Asset;
  activeCheckout: CheckoutRecord;
  onSubmitCheckin: (condition: AssetCondition, damageReported: boolean, damageDescription: string, notes: string) => void;
  onCancel: () => void;
}

export const CheckinForm: React.FC<CheckinFormProps> = ({
  asset,
  activeCheckout,
  onSubmitCheckin,
  onCancel
}) => {
  const [condition, setCondition] = useState<AssetCondition>('GOOD');
  const [damageReported, setDamageReported] = useState(false);
  const [damageDesc, setDamageDesc] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const conditionOptions: { id: AssetCondition; label: string; desc: string; color: string }[] = [
    { id: 'GOOD', label: 'GOOD', desc: 'Fully operational, minor standard cosmetic wear', color: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' },
    { id: 'FAIR', label: 'FAIR', desc: 'Operational but sluggish or battery degraded', color: 'border-amber-500/50 bg-amber-500/10 text-amber-300' },
    { id: 'POOR', label: 'POOR', desc: 'Damaged screen, faulty ports, or hardware failure', color: 'border-rose-500/50 bg-rose-500/10 text-rose-300' }
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (damageReported && !damageDesc.trim()) {
      setError('Damage report description is mandatory when damage is flagged.');
      return;
    }

    if (confirm(`Confirm return check-in of ${asset?.name || 'Device'} (${asset?.assetCode || 'N/A'})? Checked in condition: ${condition}${damageReported ? ' [DAMAGE REPORTED]' : ''}.`)) {
      onSubmitCheckin(condition, damageReported, damageDesc.trim(), notes.trim());
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 text-xs max-h-[92vh] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Laptop className="w-5 h-5" />
          </div>
          <div>
            <span className="font-mono text-[10px] text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded">
              {asset?.assetCode || 'N/A'}
            </span>
            <h3 className="text-base font-bold text-slate-100 mt-0.5">Hardware Return Check-In</h3>
          </div>
        </div>
      </div>

      {/* Active Custody Context */}
      <div className="my-4 bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1 font-mono text-[11px]">
        <div className="flex justify-between text-slate-400">
          <span>Custody Return From:</span>
          <strong className="text-slate-200 font-sans">{activeCheckout.checkedOutToUserName}</strong>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Checked Out Date:</span>
          <strong className="text-emerald-400">{activeCheckout.checkedOutAt}</strong>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Checkout Purpose:</span>
          <strong className="text-slate-300 font-sans">{activeCheckout.reason || 'Daily use'}</strong>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Condition Selector */}
        <div>
          <label className="block text-slate-300 font-semibold mb-2">Physical Condition Upon Return *</label>
          <div className="grid grid-cols-3 gap-2.5">
            {conditionOptions.map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setCondition(opt.id);
                  if (opt.id === 'POOR') setDamageReported(true);
                }}
                className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between h-24 ${
                  condition === opt.id
                    ? `${opt.color} shadow-lg ring-1 ring-white/20`
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <span className="font-bold font-mono tracking-wider text-xs">{opt.label}</span>
                <span className="text-[9px] leading-tight opacity-80 mt-1 line-clamp-2">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Damage Checkbox */}
        <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-start gap-3">
          <input
            type="checkbox"
            id="dmgCheck"
            checked={damageReported}
            onChange={(e) => setDamageReported(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-slate-700 bg-slate-900 text-rose-500 focus:ring-rose-500 cursor-pointer"
          />
          <div className="flex-1">
            <label htmlFor="dmgCheck" className="font-bold text-slate-200 cursor-pointer text-xs flex items-center gap-1.5">
              <AlertTriangle className={`w-3.5 h-3.5 ${damageReported ? 'text-rose-400 animate-pulse' : 'text-slate-500'}`} />
              <span>Flag Hardware Damage / Malfunction</span>
            </label>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Automatically creates an urgent maintenance ticket in the IT repair queue and notifies system administrators.
            </p>
          </div>
        </div>

        {/* Conditional Damage Description */}
        {damageReported && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="block text-rose-400 font-semibold mb-1 flex items-center gap-1">
              <Wrench className="w-3.5 h-3.5" />
              <span>Detailed Damage Report Description *</span>
            </label>
            <textarea
              required
              value={damageDesc}
              onChange={(e) => setDamageDesc(e.target.value)}
              placeholder="Describe physical damage (e.g. cracked LCD bezel, liquid damage near keyboard, USB-C port failure)..."
              className="w-full bg-slate-950 border border-rose-500/40 rounded-xl p-3 text-rose-200 h-20 focus:outline-none focus:border-rose-400 placeholder:text-rose-900/60"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-slate-300 font-semibold mb-1">Return Notes / Missing Items</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Employee returned laptop only, MagSafe charger still at field office..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-200 h-16 focus:outline-none focus:border-sky-500 placeholder:text-slate-600"
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
            className={`px-6 py-2.5 font-bold rounded-xl shadow-lg transition flex items-center gap-2 ${
              damageReported
                ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/20'
                : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20'
            }`}
          >
            <span>Confirm Return Check-In</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
};
