import React, { useState } from 'react';
import { User, Organization, Branch, Asset } from '../types';
import { DEPARTMENTS } from '../mockData';
import {
  User as UserIcon,
  Shield,
  KeyRound,
  Laptop,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Building2,
  MapPin,
  Mail,
  Camera,
  Save,
  X,
  Lock,
  Smartphone,
  RefreshCw,
  ExternalLink,
  Sparkles
} from 'lucide-react';

interface UserSettingsModalProps {
  currentUser: User;
  currentOrg: Organization;
  branches: Branch[];
  assets: Asset[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateUser: (updatedUser: User) => void;
}

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80',
];

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  currentUser,
  currentOrg,
  branches,
  assets,
  isOpen,
  onClose,
  onUpdateUser,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'hardware'>('profile');
  const modalBodyRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      if (modalBodyRef.current) {
        modalBodyRef.current.scrollTop = 0;
      }
      const timer = setTimeout(() => {
        const firstField = modalBodyRef.current?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
        );
        firstField?.focus();
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [activeTab, isOpen]);

  // Profile Form State
  const [fullName, setFullName] = useState(currentUser.fullName);
  const [departmentId, setDepartmentId] = useState(currentUser.departmentId || 'dept-ops');
  const [avatar, setAvatar] = useState(currentUser.avatar || PRESET_AVATARS[0]!);
  const [customAvatarUrl, setCustomAvatarUrl] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('');
  const [profileErrorMsg, setProfileErrorMsg] = useState('');

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [pwSuccessMsg, setPwSuccessMsg] = useState('');
  const [pwErrorMsg, setPwErrorMsg] = useState('');

  // 2FA State
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(currentUser.twoFactorEnabled);
  const [twoFactorMsg, setTwoFactorMsg] = useState('');

  if (!isOpen) return null;

  // Filter hardware assigned to this user
  const userHardware = assets.filter(
    a => a.assignedToUserId === currentUser.id ||
         (a.assignedToUserName && a.assignedToUserName.toLowerCase() === currentUser.fullName.toLowerCase())
  );

  const selectedDept = DEPARTMENTS.find(d => d.id === departmentId) || {
    id: departmentId,
    name: currentUser.departmentName || 'Operations',
    orgId: currentOrg.id,
    headCount: 1,
    budgetAllocated: 0
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccessMsg('');
    setProfileErrorMsg('');

    if (!fullName.trim()) {
      setProfileErrorMsg('Full Name cannot be empty.');
      return;
    }

    setIsSavingProfile(true);
    try {
      const finalAvatar = customAvatarUrl.trim() || avatar;
      const updatedUser: User = {
        ...currentUser,
        fullName: fullName.trim(),
        avatar: finalAvatar,
        departmentId: selectedDept.id,
        departmentName: selectedDept.name,
      };

      onUpdateUser(updatedUser);
      setProfileSuccessMsg('Profile settings successfully updated!');
      setTimeout(() => setProfileSuccessMsg(''), 4000);
    } catch (err: any) {
      setProfileErrorMsg(err.message || 'Failed to save profile settings.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwSuccessMsg('');
    setPwErrorMsg('');

    if (!currentPassword) {
      setPwErrorMsg('Please provide your current password.');
      return;
    }

    if (newPassword.length < 8) {
      setPwErrorMsg('New password must be at least 8 characters long.');
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPwErrorMsg('New password must contain at least one letter and one number.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwErrorMsg('New password and confirmation do not match.');
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update password.');
      }

      setPwSuccessMsg('Password successfully changed! Use your new password on your next login.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwSuccessMsg(''), 5000);
    } catch (err: any) {
      setPwErrorMsg(err.message || 'Error occurred while changing password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleToggle2FA = async () => {
    setTwoFactorMsg('');
    try {
      const newStatus = !twoFactorEnabled;
      setTwoFactorEnabled(newStatus);
      const updatedUser: User = {
        ...currentUser,
        twoFactorEnabled: newStatus
      };
      onUpdateUser(updatedUser);
      setTwoFactorMsg(`Two-factor authentication is now ${newStatus ? 'enabled' : 'disabled'}.`);
      setTimeout(() => setTwoFactorMsg(''), 4000);
    } catch (err: any) {
      setTwoFactorMsg('Failed to update 2FA status.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>Account Settings & Profile</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {currentUser.role}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Manage your personal information, security credentials, and view equipment in your custody.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 px-6 bg-slate-950/40">
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>General Profile</span>
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'security'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Security & Password</span>
          </button>
          <button
            onClick={() => setActiveTab('hardware')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'hardware'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            <span>My Hardware ({userHardware.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div ref={modalBodyRef} className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {/* TAB 1: GENERAL PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              {profileSuccessMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{profileSuccessMsg}</span>
                </div>
              )}
              {profileErrorMsg && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{profileErrorMsg}</span>
                </div>
              )}

              {/* Avatar Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Profile Photo & Avatar
                </label>
                <div className="flex items-center gap-4">
                  <img
                    src={customAvatarUrl.trim() || avatar}
                    alt={fullName}
                    className="w-16 h-16 rounded-full object-cover border-2 border-emerald-500 shadow-md shrink-0"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = PRESET_AVATARS[0]!;
                    }}
                  />
                  <div className="space-y-2 flex-1">
                    <div className="text-[11px] text-slate-400">Choose a default executive avatar:</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {PRESET_AVATARS.map((url, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setAvatar(url);
                            setCustomAvatarUrl('');
                          }}
                          className={`w-8 h-8 rounded-full overflow-hidden border-2 transition-transform cursor-pointer ${
                            avatar === url && !customAvatarUrl
                              ? 'border-emerald-400 scale-110 shadow-sm'
                              : 'border-slate-700 hover:border-slate-500 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img src={url} alt="Preset" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <input
                    type="url"
                    placeholder="Or enter custom image URL (https://...)"
                    value={customAvatarUrl}
                    onChange={(e) => setCustomAvatarUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Name & Corporate Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Corporate Email (Identity)
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      disabled
                      value={currentUser.email}
                      className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-400 cursor-not-allowed"
                    />
                    <span className="absolute right-2.5 top-2.5 text-[10px] text-emerald-400 font-mono font-semibold">
                      VERIFIED
                    </span>
                  </div>
                </div>
              </div>

              {/* Organization & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Department
                  </label>
                  <select
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    {DEPARTMENTS.map(dept => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Assigned Branch / Campus
                  </label>
                  <input
                    type="text"
                    disabled
                    value={currentUser.branchName || 'Main Campus'}
                    className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Readonly Organization and Access Role */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-800 text-slate-400">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">{currentOrg.name}</div>
                    <div className="text-[11px] text-slate-400">
                      Tenant ID: <span className="font-mono text-slate-300">{currentOrg.id}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Authorization Level</div>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {currentUser.role}
                  </span>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
                >
                  {isSavingProfile ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Profile Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: SECURITY & PASSWORD */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* Change Password Card */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 text-white font-bold text-xs">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Update Account Password</span>
                </div>

                {pwSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>{pwSuccessMsg}</span>
                  </div>
                )}
                {pwErrorMsg && (
                  <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{pwErrorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleChangePassword} className="space-y-3.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPw ? 'text' : 'password'}
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        {showCurrentPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        New Password
                      </label>
                      <div className="relative">
                        <input
                          type={showNewPw ? 'text' : 'password'}
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Min. 8 characters"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPw(!showNewPw)}
                          className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                        >
                          {showNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-type new password"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Password Requirements Checklist */}
                  <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[10px] space-y-1">
                    <div className="font-semibold text-slate-400">Password Requirements:</div>
                    <div className={`flex items-center gap-1.5 ${newPassword.length >= 8 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <CheckCircle2 className="w-3 h-3" />
                      <span>At least 8 characters in length</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${/[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword) ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Contains both letters and numbers</span>
                    </div>
                    <div className={`flex items-center gap-1.5 ${newPassword && newPassword === confirmPassword ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Passwords match</span>
                    </div>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isChangingPassword}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center gap-2 transition-colors border border-slate-700 cursor-pointer disabled:opacity-50"
                    >
                      {isChangingPassword ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                          <span>Updating...</span>
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Update Password</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Two-Factor Authentication Card */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-xs font-bold text-white">Two-Factor Authentication (2FA)</div>
                      <div className="text-[11px] text-slate-400">
                        Require an authenticator app code during sign-in.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggle2FA}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                      twoFactorEnabled
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'
                    }`}
                  >
                    {twoFactorEnabled ? '2FA Enabled' : 'Enable 2FA'}
                  </button>
                </div>
                {twoFactorMsg && (
                  <div className="text-[11px] text-emerald-400 font-mono">
                    {twoFactorMsg}
                  </div>
                )}
              </div>

              {/* Active Session & Compliance */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                <div className="text-xs font-bold text-white">Session & Compliance Specs</div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400">
                  <div>Session Storage: <span className="text-emerald-400">HTTP-Only Signed Cookie</span></div>
                  <div>Idle Timeout: <span className="text-slate-300">2 Hours</span></div>
                  <div>Database Encryption: <span className="text-emerald-400">TLS 1.3 / bcrypt-12</span></div>
                  <div>Access Governance: <span className="text-slate-300">Role-Based Access Control</span></div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: HARDWARE IN CUSTODY */}
          {activeTab === 'hardware' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-white">
                  Hardware Issued to {currentUser.fullName}
                </div>
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {userHardware.length} Active Item{userHardware.length === 1 ? '' : 's'}
                </span>
              </div>

              {userHardware.length === 0 ? (
                <div className="p-8 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-center space-y-2">
                  <Laptop className="w-8 h-8 text-slate-600 mx-auto" />
                  <div className="text-xs font-semibold text-slate-300">No Hardware Assigned</div>
                  <div className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    There are currently no IT hardware devices or workstations checked out to your profile.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {userHardware.map(asset => (
                    <div
                      key={asset.id}
                      className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
                          <Laptop className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{asset.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {asset.assetCode} • {asset.model || 'Standard Edition'}
                          </div>
                          {asset.serialNumber && (
                            <div className="text-[10px] text-slate-500 font-mono">
                              S/N: {asset.serialNumber}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right space-y-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                          asset.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {asset.status}
                        </span>
                        <div className="text-[10px] text-slate-500">
                          Condition: {asset.condition}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-slate-800 bg-slate-900/90 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
