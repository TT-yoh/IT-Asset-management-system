import React, { useState } from 'react';
import { User, Organization, Branch, Asset, Department } from '../types';
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
  Sparkles,
  QrCode,
  Copy,
  Check,
  AlertTriangle
} from 'lucide-react';
import { generateQrDataUrl } from '../lib/qr-generator';
import { validatePasswordPolicy } from '../../shared/password-policy';


interface UserSettingsModalProps {
  currentUser: User;
  currentOrg: Organization;
  branches: Branch[];
  assets: Asset[];
  departments?: Department[];
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
  departments = [],
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

  // 2FA State (Addendum 4 Section A: Real End-to-End TOTP)
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(Boolean(currentUser.twoFactorEnabled));
  const [step2FA, setStep2FA] = useState<'idle' | 'enrolling' | 'recovery' | 'disabling'>('idle');
  const [enrolSecret, setEnrolSecret] = useState('');
  const [enrolQrDataUrl, setEnrolQrDataUrl] = useState('');
  const [enrolCode, setEnrolCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [disableRecoveryCode, setDisableRecoveryCode] = useState('');
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [twoFactorError, setTwoFactorError] = useState('');
  const [twoFactorSuccess, setTwoFactorSuccess] = useState('');

  if (!isOpen) return null;

  // Filter hardware assigned to this user
  const userHardware = assets.filter(
    a => a.assignedToUserId === currentUser.id ||
         (a.assignedToUserName && a.assignedToUserName.toLowerCase() === currentUser.fullName.toLowerCase())
  );

  const deptList = departments.length > 0 ? departments : [
    {
      id: currentUser.departmentId || 'dept-ops',
      name: currentUser.departmentName || 'Operations',
      orgId: currentOrg.id,
      headCount: 1,
      budgetAllocated: 0
    }
  ];

  const selectedDept = deptList.find(d => d.id === departmentId) || {
    id: departmentId,
    name: currentUser.departmentName || 'Operations',
    orgId: currentOrg.id,
    headCount: 1,
    budgetAllocated: 0
  };

  /**
   * Addendum 4 Section A2: Self-Service Profile Update
   * Calls PUT /api/auth/profile directly, displays server validation error on failure.
   */
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
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({
          fullName: fullName.trim(),
          avatar: finalAvatar,
          departmentId: selectedDept.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update profile.');
      }

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

  /**
   * Addendum 4 Section A3: Shared Corporate Password Policy
   */
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwSuccessMsg('');
    setPwErrorMsg('');

    if (!currentPassword) {
      setPwErrorMsg('Please provide your current password.');
      return;
    }

    const policy = validatePasswordPolicy(newPassword, {
      email: currentUser.email,
      fullName: currentUser.fullName
    });
    if (!policy.valid) {
      setPwErrorMsg(policy.error || policy.message || 'New password does not meet corporate security policy.');
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
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
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

  /**
   * Addendum 4 Section A1: Real 2FA Enrolment & Verification
   */
  const handleStart2FA = async () => {
    setTwoFactorError('');
    setTwoFactorSuccess('');
    setTwoFactorLoading(true);

    try {
      const res = await fetch('/api/auth/2fa/setup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include'
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate 2FA setup.');
      }

      const qrUrl = await generateQrDataUrl(data.otpAuthUri);
      setEnrolSecret(data.secret);
      setEnrolQrDataUrl(qrUrl);
      setStep2FA('enrolling');
    } catch (err: any) {
      setTwoFactorError(err.message || 'Could not reach authorization server for 2FA setup.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorError('');
    setTwoFactorLoading(true);

    if (!enrolCode.trim() || enrolCode.trim().length !== 6) {
      setTwoFactorError('Please enter a valid 6-digit code from your authenticator app.');
      setTwoFactorLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({ code: enrolCode.trim() })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Verification code failed. Please check your app and try again.');
      }

      setRecoveryCodes(data.recoveryCodes || []);
      setTwoFactorEnabled(true);
      onUpdateUser({ ...currentUser, twoFactorEnabled: true });
      setStep2FA('recovery');
      setTwoFactorSuccess('Two-factor authentication successfully activated!');
    } catch (err: any) {
      setTwoFactorError(err.message || 'Invalid 2FA code.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  const handleDisable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorError('');
    setTwoFactorLoading(true);

    if (!disablePassword) {
      setTwoFactorError('Current password is required to disable 2FA.');
      setTwoFactorLoading(false);
      return;
    }
    if (!disableCode.trim() && !disableRecoveryCode.trim()) {
      setTwoFactorError('Please provide either an active authenticator code or a backup recovery code.');
      setTwoFactorLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/auth/2fa/disable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'include',
        body: JSON.stringify({
          password: disablePassword,
          code: disableCode.trim() || undefined,
          recoveryCode: disableRecoveryCode.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to disable two-factor authentication.');
      }

      setTwoFactorEnabled(false);
      onUpdateUser({ ...currentUser, twoFactorEnabled: false });
      setStep2FA('idle');
      setDisablePassword('');
      setDisableCode('');
      setDisableRecoveryCode('');
      setTwoFactorSuccess('Two-factor authentication has been disabled.');
      setTimeout(() => setTwoFactorSuccess(''), 4000);
    } catch (err: any) {
      setTwoFactorError(err.message || 'Failed to disable 2FA.');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  return (
    <div data-modal-overlay className="fixed inset-0 z-50 overflow-y-auto flex justify-center items-start sm:items-center py-6 sm:py-10 px-3 sm:px-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
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
                    {deptList.map(dept => (
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
                    value={currentUser.branchName || 'Unassigned'}
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
                    <div className={`flex items-center gap-1.5 ${newPassword.length >= 12 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      <CheckCircle2 className="w-3 h-3" />
                      <span>At least 12 characters in length</span>
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

              {/* Two-Factor Authentication Card (Addendum 4 Section A1) */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Two-Factor Authentication (2FA)</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          twoFactorEnabled
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}>
                          {twoFactorEnabled ? 'PROTECTED' : 'DISABLED'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Industry standard RFC 6238 TOTP authenticator protection.
                      </div>
                    </div>
                  </div>

                  {step2FA === 'idle' && (
                    twoFactorEnabled ? (
                      <button
                        type="button"
                        onClick={() => {
                          setTwoFactorError('');
                          setTwoFactorSuccess('');
                          setStep2FA('disabling');
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                      >
                        Disable 2FA
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleStart2FA}
                        disabled={twoFactorLoading}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {twoFactorLoading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Generating Secret...</span>
                          </>
                        ) : (
                          <>
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Configure 2FA</span>
                          </>
                        )}
                      </button>
                    )
                  )}
                </div>

                {twoFactorSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{twoFactorSuccess}</span>
                  </div>
                )}

                {twoFactorError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{twoFactorError}</span>
                  </div>
                )}

                {/* STEP 2FA: ENROLLING */}
                {step2FA === 'enrolling' && (
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-4 animate-in fade-in duration-200">
                    <div className="text-xs font-semibold text-slate-200">
                      Step 1: Scan QR Code with Authenticator App
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Open Google Authenticator, Authy, or 1Password, and scan the QR code below.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                      {enrolQrDataUrl ? (
                        <div className="p-2 bg-white rounded-lg shadow shrink-0">
                          <img src={enrolQrDataUrl} alt="2FA QR Code" className="w-32 h-32" />
                        </div>
                      ) : (
                        <div className="w-32 h-32 bg-slate-800 animate-pulse rounded-lg flex items-center justify-center text-slate-500 text-xs">
                          Generating QR...
                        </div>
                      )}

                      <div className="space-y-2 flex-1 w-full text-left">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Manual Setup Key
                        </div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-emerald-400 bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800 select-all break-all">
                            {enrolSecret}
                          </code>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(enrolSecret);
                              setCopiedCodes(true);
                              setTimeout(() => setCopiedCodes(false), 2000);
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            title="Copy Secret"
                          >
                            {copiedCodes ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleVerify2FA} className="space-y-3 pt-2">
                      <div className="text-xs font-semibold text-slate-200">
                        Step 2: Enter 6-digit Code to Confirm
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          required
                          value={enrolCode}
                          onChange={(e) => setEnrolCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="123456"
                          className="w-36 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono tracking-widest text-center text-emerald-400 focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="submit"
                          disabled={twoFactorLoading || enrolCode.length !== 6}
                          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 transition cursor-pointer"
                        >
                          {twoFactorLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                          <span>Verify &amp; Activate</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStep2FA('idle');
                            setTwoFactorError('');
                          }}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* STEP 2FA: RECOVERY CODES */}
                {step2FA === 'recovery' && (
                  <div className="p-4 bg-slate-900 border border-amber-500/30 rounded-xl space-y-4 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2 text-amber-400">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <div className="text-xs font-bold">Important: Save Your One-Time Backup Recovery Codes</div>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      If you lose access to your authenticator device, you can use these 8 one-time codes to regain account access.
                      These codes will not be shown again.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-950 p-3 rounded-xl border border-slate-800">
                      {recoveryCodes.map((rc, idx) => (
                        <div key={idx} className="font-mono text-xs text-center py-1.5 px-2 bg-slate-900 rounded border border-slate-800 text-emerald-400 select-all">
                          {rc}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(recoveryCodes.join('\n'));
                          setCopiedCodes(true);
                          setTimeout(() => setCopiedCodes(false), 2000);
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                      >
                        {copiedCodes ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCodes ? 'Copied Codes!' : 'Copy All Codes'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setStep2FA('idle')}
                        className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition"
                      >
                        I Have Saved These Codes
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 2FA: DISABLING */}
                {step2FA === 'disabling' && (
                  <form onSubmit={handleDisable2FA} className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 animate-in fade-in duration-200">
                    <div className="text-xs font-bold text-rose-400">
                      Security Verification: Disable 2FA
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Disabling 2FA lowers account security. Please confirm your current password and supply a verification code or recovery code.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          Current Account Password *
                        </label>
                        <input
                          type="password"
                          required
                          value={disablePassword}
                          onChange={(e) => setDisablePassword(e.target.value)}
                          placeholder="Current password"
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                          6-Digit Code or Recovery Code *
                        </label>
                        <input
                          type="text"
                          value={disableCode || disableRecoveryCode}
                          onChange={(e) => {
                            const val = e.target.value.trim();
                            if (val.length <= 6 && /^\d*$/.test(val)) {
                              setDisableCode(val);
                              setDisableRecoveryCode('');
                            } else {
                              setDisableRecoveryCode(val);
                              setDisableCode('');
                            }
                          }}
                          placeholder="e.g. 123456 or a1b2c3d4"
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStep2FA('idle');
                          setTwoFactorError('');
                        }}
                        className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-700 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={twoFactorLoading || !disablePassword}
                        className="px-4 py-1.5 bg-rose-500 hover:bg-rose-400 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        {twoFactorLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>Confirm Disable 2FA</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Active Session & Compliance */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs space-y-2">
                <div className="text-xs font-bold text-white">Session & Compliance Specs</div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400">
                  <div>Session Storage: <span className="text-emerald-400">HTTP-Only Signed Cookie</span></div>
                  <div>Idle Timeout: <span className="text-slate-300">60 Minutes (Sliding)</span></div>
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
