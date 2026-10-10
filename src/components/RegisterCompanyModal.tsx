import React, { useState } from 'react';
import { Building2, X, Plus, Sparkles, MapPin, Briefcase, Mail, Lock, User, Trash2, ArrowRight, CheckCircle2 } from 'lucide-react';
import { OrgType } from '../types';

export interface InitialBranchInput {
  id?: string;
  name: string;
  code: string;
  city: string;
  country: string;
  location?: string;
  managerName?: string;
}

export interface RegisterCompanyData {
  name: string;
  type: OrgType;
  logo: string;
  adminEmail: string;
  adminName: string;
  adminPassword?: string;
  branches: InitialBranchInput[];
}

interface RegisterCompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegister: (data: RegisterCompanyData) => void;
}

const INDUSTRY_OPTIONS: OrgType[] = [
  'Enterprise',
  'Technology',
  'Healthcare',
  'Finance',
  'Education',
  'Manufacturing',
  'Retail',
  'Mining',
  'Logistics',
  'General'
];

const EMOJI_OPTIONS = ['🏢', '🚀', '💻', '🏥', '💼', '⚡', '🏭', '🎓', '🌐', '🛡️', '📦', '🔬', '⛏️', '🚛'];

export const RegisterCompanyModal: React.FC<RegisterCompanyModalProps> = ({
  isOpen,
  onClose,
  onRegister
}) => {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  // Step 1: Company Profile
  const [name, setName] = useState('');
  const [type, setType] = useState<OrgType>('Technology');
  const [logo, setLogo] = useState('🏢');
  
  // Step 2: Administrator Account
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // Step 3: Operating Branches / Facilities (Supports Primary HQ + Multiple Regional Branches)
  const [primaryBranchName, setPrimaryBranchName] = useState('');
  const [primaryBranchCity, setPrimaryBranchCity] = useState('');
  const [primaryBranchCountry, setPrimaryBranchCountry] = useState('Australia');
  const [primaryBranchLocation, setPrimaryBranchLocation] = useState('');

  // Additional branches
  const [additionalBranches, setAdditionalBranches] = useState<InitialBranchInput[]>([]);
  const [showAddSecondaryForm, setShowAddSecondaryForm] = useState(false);
  const [secName, setSecName] = useState('');
  const [secCode, setSecCode] = useState('');
  const [secCity, setSecCity] = useState('');
  const [secLocation, setSecLocation] = useState('');
  const [secCountry, setSecCountry] = useState('Australia');

  if (!isOpen) return null;

  const handleAddSecondaryBranch = () => {
    if (!secName.trim() || !secCity.trim()) return;
    const cleanCode = secCode.trim() || secName.slice(0, 3).toUpperCase() + '-' + (additionalBranches.length + 2);
    setAdditionalBranches(prev => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        name: secName.trim(),
        code: cleanCode.toUpperCase(),
        city: secCity.trim(),
        location: secLocation.trim() || 'Regional Site',
        country: secCountry.trim() || 'Australia',
        managerName: 'Unassigned'
      }
    ]);
    setSecName('');
    setSecCode('');
    setSecCity('');
    setSecLocation('');
    setShowAddSecondaryForm(false);
  };

  const handleRemoveSecondaryBranch = (index: number) => {
    setAdditionalBranches(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setActiveStep(1);
      return;
    }
    if (!adminEmail.trim() || !adminPassword.trim() || adminPassword.length < 8 || !/[a-zA-Z]/.test(adminPassword) || !/[0-9]/.test(adminPassword)) {
      setActiveStep(2);
      return;
    }

    const cleanDomain = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'company';
    const finalEmail = adminEmail.trim() || `admin@${cleanDomain}.com`;

    const primaryHqBranch: InitialBranchInput = {
      name: primaryBranchName.trim() || `${name.trim()} Global HQ`,
      code: `HQ-${name.trim().slice(0, 3).toUpperCase()}`,
      city: primaryBranchCity.trim() || 'Headquarters City',
      location: primaryBranchLocation.trim() || 'Main Campus',
      country: primaryBranchCountry.trim() || 'Global',
      managerName: adminName.trim() || 'Primary Admin'
    };

    const allBranches = [primaryHqBranch, ...additionalBranches];

    onRegister({
      name: name.trim(),
      type,
      logo,
      adminEmail: finalEmail,
      adminName: adminName.trim() || `${name.trim()} Admin`,
      adminPassword: adminPassword.trim() || 'Admin123!',
      branches: allBranches
    });

    // Reset
    setName('');
    setAdminEmail('');
    setAdminName('');
    setAdminPassword('');
    setPrimaryBranchName('');
    setPrimaryBranchCity('');
    setPrimaryBranchLocation('');
    setAdditionalBranches([]);
    setActiveStep(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden relative max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Stripe */}
        <div className="h-1 bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-500 shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 md:p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                Register New Enterprise Tenant
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Onboard your company with dedicated operational branches, users, and asset ledger.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicator Bar */}
        <div className="bg-slate-950/70 border-b border-slate-800/80 px-6 py-2.5 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setActiveStep(1)}
            className={`flex items-center gap-2 font-bold transition ${
              activeStep === 1 ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              activeStep === 1 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
            }`}>1</span>
            <span>Company Profile</span>
          </button>

          <span className="text-slate-700">──</span>

          <button
            type="button"
            onClick={() => { if (name.trim()) setActiveStep(2); }}
            className={`flex items-center gap-2 font-bold transition ${
              activeStep === 2 ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              activeStep === 2 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
            }`}>2</span>
            <span>Admin Account</span>
          </button>

          <span className="text-slate-700">──</span>

          <button
            type="button"
            onClick={() => { if (name.trim() && adminEmail.trim()) setActiveStep(3); }}
            className={`flex items-center gap-2 font-bold transition ${
              activeStep === 3 ? 'text-emerald-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              activeStep === 3 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
            }`}>3</span>
            <span>Branches & Facilities</span>
          </button>
        </div>

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* STEP 1: COMPANY PROFILE */}
          {activeStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Company / Organization Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apex Global Logistics, Nova Biotech..."
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                    Industry Sector
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as OrgType)}
                    className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500 transition"
                  >
                    {INDUSTRY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Workspace Brand Icon
                  </label>
                  <div className="flex items-center gap-1.5 bg-slate-950/80 border border-slate-800 rounded-xl p-1.5 overflow-x-auto">
                    {EMOJI_OPTIONS.slice(0, 6).map((emoji) => (
                      <button
                        type="button"
                        key={emoji}
                        onClick={() => setLogo(emoji)}
                        className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center transition shrink-0 ${
                          logo === emoji
                            ? 'bg-emerald-500/20 border border-emerald-500/50 shadow-sm'
                            : 'hover:bg-slate-800'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <button
                  type="button"
                  disabled={!name.trim()}
                  onClick={() => setActiveStep(2)}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <span>Continue to Admin Setup</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: ADMINISTRATOR ACCOUNT */}
          {activeStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-2xl">
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-400" />
                  <span>Primary Organization Administrator</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  This user will hold full system administrator rights, manage branches, and invite staff.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Administrator Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g. Marcus Vance"
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition font-medium"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    Work Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="e.g. admin@apexlogistics.com"
                    className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-300 mb-1.5 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    Security Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Must be at least 8 characters with at least one letter and one number.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveStep(1)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!adminEmail.trim() || adminPassword.length < 8 || !/[a-zA-Z]/.test(adminPassword) || !/[0-9]/.test(adminPassword)}
                  onClick={() => setActiveStep(3)}
                  className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-500/20 cursor-pointer"
                >
                  <span>Configure Operating Branches</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: OPERATING BRANCHES & FACILITIES */}
          {activeStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-2xl flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span>Operating Locations &amp; Facilities</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Define the branches where hardware products and IT assets will be stationed.
                  </p>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  {1 + additionalBranches.length} {1 + additionalBranches.length === 1 ? 'Branch' : 'Branches'} Ready
                </span>
              </div>

              {/* Primary Headquarters */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>Primary Headquarters (HQ) *</span>
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">Main Facility</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">
                      HQ Facility Name
                    </label>
                    <input
                      type="text"
                      value={primaryBranchName}
                      onChange={(e) => setPrimaryBranchName(e.target.value)}
                      placeholder={`${name || 'Company'} Global HQ`}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">
                      City / Metropolis
                    </label>
                    <input
                      type="text"
                      value={primaryBranchCity}
                      onChange={(e) => setPrimaryBranchCity(e.target.value)}
                      placeholder="e.g. Sydney, London, New York"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">
                      Physical Street Address
                    </label>
                    <input
                      type="text"
                      value={primaryBranchLocation}
                      onChange={(e) => setPrimaryBranchLocation(e.target.value)}
                      placeholder="e.g. 100 George Street"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 uppercase font-semibold mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      value={primaryBranchCountry}
                      onChange={(e) => setPrimaryBranchCountry(e.target.value)}
                      placeholder="e.g. Australia"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Branches List */}
              {additionalBranches.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-400">
                    Additional Provisioned Branches
                  </label>
                  {additionalBranches.map((b, idx) => (
                    <div key={b.id || idx} className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5">
                          <span>{b.name}</span>
                          <span className="font-mono text-[9px] px-1 py-0.2 bg-slate-800 text-slate-400 rounded">
                            {b.code}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{b.location}, {b.city}, {b.country}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSecondaryBranch(idx)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg transition cursor-pointer"
                        title="Remove branch"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Secondary Branch Addition Form */}
              {showAddSecondaryForm ? (
                <div className="p-3.5 bg-slate-950 border border-indigo-500/30 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-indigo-300">New Regional Branch</span>
                    <button
                      type="button"
                      onClick={() => setShowAddSecondaryForm(false)}
                      className="text-slate-500 hover:text-slate-300 text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input
                        type="text"
                        placeholder="Branch Name (e.g. Melbourne Hub)"
                        value={secName}
                        onChange={(e) => setSecName(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Code (e.g. MEL-01)"
                        value={secCode}
                        onChange={(e) => setSecCode(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono uppercase"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input
                        type="text"
                        placeholder="City (e.g. Melbourne)"
                        value={secCity}
                        onChange={(e) => setSecCity(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Address / Location"
                        value={secLocation}
                        onChange={(e) => setSecLocation(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddSecondaryForm(false)}
                      className="px-3 py-1 bg-slate-800 text-slate-300 rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAddSecondaryBranch}
                      disabled={!secName.trim() || !secCity.trim()}
                      className="px-3 py-1 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-slate-950 font-bold rounded-lg text-xs transition"
                    >
                      Add to Workspace
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAddSecondaryForm(true)}
                  className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/40 text-slate-400 hover:text-emerald-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Another Branch Facility</span>
                </button>
              )}

              <div className="pt-4 border-t border-slate-800 flex justify-between">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 transition"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 transition shadow-xl shadow-emerald-500/20 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-slate-950" />
                  <span>Complete Registration &amp; Launch Workspace</span>
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
