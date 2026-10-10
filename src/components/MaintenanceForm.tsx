import React, { useState } from 'react';
import { MaintenanceRecord, MaintenanceType, Asset, User } from '../types';
import { Wrench, AlertTriangle, Calendar, DollarSign, UserCheck } from 'lucide-react';

interface MaintenanceFormProps {
  initialData?: MaintenanceRecord;
  assets: Asset[];
  technicians: User[];
  onSubmit: (formData: any) => void;
  onCancel: () => void;
}

export const MaintenanceForm: React.FC<MaintenanceFormProps> = ({
  initialData,
  assets,
  technicians,
  onSubmit,
  onCancel
}) => {
  const [assetId, setAssetId] = useState(initialData?.assetId || assets[0]?.id || '');
  const [type, setType] = useState<MaintenanceType>(initialData?.type || 'REPAIR');
  const [priority, setPriority] = useState<'HIGH' | 'MEDIUM' | 'LOW'>(initialData?.priority || 'MEDIUM');
  const [description, setDescription] = useState(initialData?.description || '');
  const [startDate, setStartDate] = useState(initialData?.startDate || new Date().toISOString().split('T')[0]!);
  const [expectedCompletion, setExpectedCompletion] = useState(
    initialData?.expectedCompletion || new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0]!
  );
  const [assignedTechnician, setAssignedTechnician] = useState(initialData?.assignedTechnician || technicians[0]?.fullName || 'IT Repair Pool');
  const [cost, setCost] = useState(initialData?.cost !== undefined ? initialData.cost.toString() : '150');
  const [partsReplaced, setPartsReplaced] = useState(initialData?.partsReplaced || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!assetId) {
      setError('Please select an asset requiring maintenance.');
      return;
    }
    if (!description.trim()) {
      setError('Description of the issue or task is required.');
      return;
    }
    if (new Date(expectedCompletion) < new Date(startDate)) {
      setError('Expected completion date cannot be earlier than start date.');
      return;
    }

    const ast = assets.find(a => a.id === assetId);
    if (!ast) {
      setError('Selected asset record could not be found.');
      return;
    }

    const payload = {
      assetId: ast.id,
      assetCode: ast.assetCode,
      assetName: ast.name,
      type,
      priority,
      description: description.trim(),
      startDate,
      expectedCompletion,
      assignedTechnician,
      cost: parseFloat(cost) || 0,
      partsReplaced: partsReplaced.trim(),
      notes: notes.trim()
    };

    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-xs animate-in fade-in duration-200">
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid Row 1: Asset & Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5 text-rose-400" />
            <span>Target Hardware Asset *</span>
          </label>
          <select
            disabled={!!initialData}
            value={assetId}
            onChange={e => setAssetId(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-rose-500 focus:outline-none disabled:opacity-60"
          >
            {assets.map(a => (
              <option key={a.id} value={a.id}>
                [{a.assetCode}] {a.name} ({a.status})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-300 font-semibold mb-1">Maintenance Type *</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as MaintenanceType)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-rose-500 focus:outline-none"
          >
            <option value="REPAIR">🚨 REPAIR (Out of Order / Breakdown)</option>
            <option value="PREVENTIVE">🛡️ PREVENTIVE (Scheduled Maintenance)</option>
            <option value="INSPECTION">🔍 INSPECTION (Audit / Health Check)</option>
            <option value="UPGRADE">⚡ UPGRADE (Memory / Storage / Firmware)</option>
          </select>
        </div>
      </div>

      {/* Grid Row 2: Priority & Assigned Tech */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-slate-300 font-semibold mb-1">Task Priority Level *</label>
          <div className="grid grid-cols-3 gap-2">
            {(['HIGH', 'MEDIUM', 'LOW'] as const).map(p => (
              <button
                type="button"
                key={p}
                onClick={() => setPriority(p)}
                className={`py-2 rounded-xl border text-center font-bold transition-all ${
                  priority === p ?
                  p === 'HIGH' ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-lg shadow-rose-500/10' :
                  p === 'MEDIUM' ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-lg shadow-amber-500/10' :
                  'bg-slate-700 border-slate-500 text-slate-200'
                  : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Assign Technician / Team</span>
          </label>
          <select
            value={assignedTechnician}
            onChange={e => setAssignedTechnician(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-rose-500 focus:outline-none"
          >
            <option value="IT Repair Pool">🏢 General IT Repair Pool (Unassigned)</option>
            {technicians.map(t => (
              <option key={t.id} value={`${t.fullName} (${t.role})`}>
                {t.fullName} • {t.role}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Description Textarea */}
      <div>
        <label className="block text-slate-300 font-semibold mb-1">Issue / Task Description *</label>
        <textarea
          required
          rows={3}
          placeholder="Describe hardware failure, error codes, diagnostic findings, or scheduled task steps..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white placeholder-slate-600 focus:border-rose-500 focus:outline-none"
        />
      </div>

      {/* Grid Row 3: Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Start Date *</span>
          </label>
          <input
            type="date"
            required
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
          >
          </input>
        </div>

        <div>
          <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1 text-amber-300">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Expected Completion Date (ETA) *</span>
          </label>
          <input
            type="date"
            required
            value={expectedCompletion}
            onChange={e => setExpectedCompletion(e.target.value)}
            className="w-full bg-slate-950 border border-amber-500/50 rounded-xl p-2.5 text-white font-mono focus:border-amber-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Grid Row 4: Parts Replaced & Est Cost */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-slate-300 font-semibold mb-1">Replacement Parts Logged</label>
          <input
            type="text"
            placeholder="e.g. 512GB NVMe SSD, 65W AC Adapter, LCD Display Panel"
            value={partsReplaced}
            onChange={e => setPartsReplaced(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white placeholder-slate-600"
          />
        </div>

        <div>
          <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span>Repair / Lab Cost Est. ($)</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={cost}
            onChange={e => setCost(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold"
          />
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-slate-300 font-semibold mb-1">Internal Support Notes</label>
        <input
          type="text"
          placeholder="Custody transfer notes, vendor RMAs, warranty authorization tracking..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white placeholder-slate-600"
        />
      </div>

      {/* Submit Buttons */}
      <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-all"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all shadow-lg shadow-rose-600/20 flex items-center gap-2"
        >
          <Wrench className="w-4 h-4" />
          <span>{initialData ? 'Save Changes' : 'Create Repair Ticket'}</span>
        </button>
      </div>
    </form>
  );
};
