import React, { useState, useEffect } from 'react';
import { Organization, User } from '../../types';
import { 
  Mail, 
  Lock, 
  ArrowRight, 
  AlertCircle, 
  Loader2, 
  Eye, 
  EyeOff, 
  Sparkles, 
  ShieldCheck,
  Building,
  KeyRound,
  CheckCircle2,
  Plus,
  Send,
  Building2
} from 'lucide-react';
import { RegisterCompanyModal, RegisterCompanyData } from '../RegisterCompanyModal';

interface LoginPortalProps {
  organizations: Organization[];
  users: User[];
  onLoginSuccess: (user: User, org: Organization) => void;
  onRegisterOrganization?: (data: RegisterCompanyData) => void;
  onActivateUser?: (inviteToken: string, newPassword: string, twoFactorEnabled: boolean) => void;
}

export const LoginPortal: React.FC<LoginPortalProps> = ({
  organizations,
  users,
  onLoginSuccess,
  onRegisterOrganization,
  onActivateUser
}) => {
  // Mode: 'SIGNIN' | 'ACTIVATE'
  const [authMode, setAuthMode] = useState<'SIGNIN' | 'ACTIVATE'>('SIGNIN');
  const [showRegisterCompanyModal, setShowRegisterCompanyModal] = useState(false);

  // Standard Sign-In Form State (User must input their own credentials)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Option A: Invite Activation Form State
  const [activationTokenInput, setActivationTokenInput] = useState('');
  const [activationPassword, setActivationPassword] = useState('');
  const [confirmActivationPassword, setConfirmActivationPassword] = useState('');
  const [showActivationPassword, setShowActivationPassword] = useState(false);
  const [twoFactorActivation, setTwoFactorActivation] = useState(false);
  const [matchedInvitedUser, setMatchedInvitedUser] = useState<User | null>(null);
  const [matchedInvitedOrg, setMatchedInvitedOrg] = useState<Organization | null>(null);

  // Auto-detect ?invite= token from URL on mount
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlToken = urlParams.get('invite');
      if (urlToken) {
        setActivationTokenInput(urlToken);
        setAuthMode('ACTIVATE');
      }
    } catch (e) {
      // URL parsing fallback
    }
  }, []);

  // When activationTokenInput changes, find matching user
  useEffect(() => {
    if (!activationTokenInput.trim()) {
      setMatchedInvitedUser(null);
      setMatchedInvitedOrg(null);
      return;
    }
    const cleanToken = activationTokenInput.trim();
    // Match on inviteToken ONLY (never on u.id)
    const foundUser = users.find(u => u.inviteToken === cleanToken);
    if (foundUser) {
      if (foundUser.status !== 'INVITED') {
        setMatchedInvitedUser(null);
        setMatchedInvitedOrg(null);
        setError('This invitation token has already been activated.');
        return;
      }
      if (foundUser.invitedAt) {
        const inviteTime = new Date(foundUser.invitedAt).getTime();
        const maxAgeMs = 48 * 60 * 60 * 1000;
        if (!isNaN(inviteTime) && Date.now() - inviteTime > maxAgeMs) {
          setMatchedInvitedUser(null);
          setMatchedInvitedOrg(null);
          setError('This invitation token has expired (48 hour validity limit).');
          return;
        }
      }
      setMatchedInvitedUser(foundUser);
      const foundOrg = organizations.find(o => o.id === foundUser.orgId) || organizations[0]!;
      setMatchedInvitedOrg(foundOrg);
      setError(null);
    } else {
      setMatchedInvitedUser(null);
      setMatchedInvitedOrg(null);
    }
  }, [activationTokenInput, users, organizations]);

  const handleQuickFill = (emailVal: string, passVal: string) => {
    setAuthMode('SIGNIN');
    setEmail(emailVal);
    setPassword(passVal);
    setError(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password })
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.user) {
        setIsLoading(false);
        const userOrg = organizations.find(o => o.id === data.user.org_id || o.id === data.user.orgId) || organizations[0]!;
        const mappedUser: User = {
          id: data.user.id,
          orgId: data.user.org_id || data.user.orgId,
          email: data.user.email,
          fullName: data.user.full_name || data.user.fullName,
          role: data.user.role,
          status: data.user.status || 'ACTIVE',
          departmentId: data.user.department_id || data.user.departmentId,
          departmentName: data.user.department_name || data.user.departmentName,
          branchId: data.user.branch_id || data.user.branchId,
          branchName: data.user.branch_name || data.user.branchName,
          twoFactorEnabled: Boolean(data.user.two_factor_enabled || data.user.twoFactorEnabled),
          avatar: data.user.avatar
        };
        onLoginSuccess(mappedUser, userOrg);
        return;
      } else if (res.status === 401 || res.status === 429) {
        setIsLoading(false);
        setError(data?.error || 'Invalid credentials or account locked.');
        return;
      }
    } catch {
      // Server not reachable (offline / air-gapped dev environment fallback)
    }

    setTimeout(() => {
      setIsLoading(false);
      
      const normalizedInput = email.trim().toLowerCase();
      const isSuperAdmin = normalizedInput === 'ishmaelt42@gmail.com';

      // Look up user across company tenants strictly by matching corporate email / identity
      const targetUser = users.find(
        u => u.email.toLowerCase() === normalizedInput || 
             u.email.toLowerCase().split('@')[0] === normalizedInput ||
             (isSuperAdmin && (u.id === 'usr-super-admin-ishmael' || u.email.toLowerCase() === 'ishmaelt42@gmail.com'))
      );
      
      if (!targetUser) {
        setError(`No corporate account found matching "${email}". Please verify your work email address.`);
        return;
      }

      if (targetUser.status === 'INVITED') {
        setError(`Your account has been invited but not yet activated. Please click "Activate with Invite Token" below.`);
        return;
      }

      // Automatically determine user's isolated company tenant
      const userOrg = organizations.find(o => o.id === targetUser.orgId) || organizations[0]!;

      if (targetUser.password && password !== targetUser.password) {
        setError(`Invalid credentials for ${targetUser.fullName}. Please check your password.`);
        return;
      }

      // Log in directly into their dedicated company workspace
      onLoginSuccess(targetUser, userOrg);
    }, 400);
  };

  const handleActivateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationTokenInput.trim()) {
      setError('Please enter your invitation activation token.');
      return;
    }
    if (!matchedInvitedUser) {
      setError('Invalid or expired invitation token. Please request a new invite from your administrator.');
      return;
    }
    if (activationPassword.length < 8 || !/[a-zA-Z]/.test(activationPassword) || !/[0-9]/.test(activationPassword)) {
      setError('Password must be at least 8 characters long and contain both letters and numbers.');
      return;
    }
    if (activationPassword !== confirmActivationPassword) {
      setError('Passwords do not match. Please verify your inputs.');
      return;
    }

    setIsLoading(true);
    setError(null);

    setTimeout(() => {
      setIsLoading(false);
      if (onActivateUser) {
        onActivateUser(activationTokenInput.trim(), activationPassword, twoFactorActivation);
      } else {
        // Fallback local activation
        const updatedUser: User = {
          ...matchedInvitedUser,
          password: activationPassword,
          status: 'ACTIVE',
          twoFactorEnabled: twoFactorActivation,
          inviteToken: undefined
        };
        const org = matchedInvitedOrg || organizations[0]!;
        onLoginSuccess(updatedUser, org);
      }
    }, 400);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 md:p-8 relative overflow-y-auto selection:bg-emerald-500 selection:text-slate-950">
      {/* Decorative ambient lighting */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-12 left-1/3 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 my-auto">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-semibold text-emerald-400 mb-3 shadow-inner">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Universal IT Asset Intelligence</span>
          </div>

          <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-emerald-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent tracking-tight">
            OmniAsset
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Enterprise hardware custody, telemetry monitoring, and multi-tenant cloud asset management.
          </p>
        </div>

        {/* Action Toggle Bar: Sign In vs Activate Account */}
        <div className="flex bg-slate-900/90 border border-slate-800 rounded-2xl p-1 mb-4 shadow-lg">
          <button
            type="button"
            onClick={() => { setAuthMode('SIGNIN'); setError(null); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 ${
              authMode === 'SIGNIN'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Enterprise Sign-In</span>
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('ACTIVATE'); setError(null); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 ${
              authMode === 'ACTIVATE'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Activate Invite (Option A)</span>
          </button>
        </div>

        {/* Secure Card Container */}
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 via-cyan-500 to-indigo-500" />
          
          {error && (
            <div className="mb-5 p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* VIEW 1: ENTERPRISE SIGN-IN */}
          {authMode === 'SIGNIN' && (
            <div className="animate-in fade-in duration-150">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Corporate Sign-In</span>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Enter your work email to access your company workspace.</p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Building className="w-4 h-4" />
                </div>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                {/* Work Email */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Work Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. user@company.com"
                      required
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition font-medium"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 mt-5 text-xs uppercase tracking-wider cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Enterprise Security Notice */}
              <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
                <p className="text-[11px] text-slate-500 font-medium">
                  Protected System &bull; Authorized Corporate Personnel Only
                </p>
              </div>
            </div>
          )}

          {/* VIEW 2: OPTION A INVITE ACTIVATION PORTAL */}
          {authMode === 'ACTIVATE' && (
            <div className="animate-in fade-in duration-150 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-emerald-400" />
                    <span>Staff Account Activation</span>
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">Activate your invited account and set your secure password.</p>
                </div>
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                  ✓
                </div>
              </div>

              {/* Matched Invitee Banner */}
              {matchedInvitedUser && matchedInvitedOrg ? (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Valid Invitation Verified</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-900 border border-slate-800 text-slate-300 rounded">
                      {matchedInvitedOrg.name}
                    </span>
                  </div>
                  <div className="text-xs text-white font-bold">
                    Welcome, {matchedInvitedUser.fullName}!
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Stationed as <strong className="text-emerald-300">{matchedInvitedUser.role}</strong> at <strong className="text-emerald-300">{matchedInvitedUser.branchName}</strong>.
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Invitation Activation Token *
                  </label>
                  <input
                    type="text"
                    value={activationTokenInput}
                    onChange={(e) => setActivationTokenInput(e.target.value)}
                    placeholder="e.g. inv-3k9x8a..."
                    required
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-emerald-300 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Paste the token from your email invitation link.</p>
                </div>
              )}

              <form onSubmit={handleActivateSubmit} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Establish Secure Password *
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showActivationPassword ? 'text' : 'password'}
                      value={activationPassword}
                      onChange={(e) => setActivationPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      required
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowActivationPassword(!showActivationPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {showActivationPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Confirm Password *
                  </label>
                  <input
                    type="password"
                    value={confirmActivationPassword}
                    onChange={(e) => setConfirmActivationPassword(e.target.value)}
                    placeholder="Re-type password"
                    required
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="activation-2fa"
                    checked={twoFactorActivation}
                    onChange={(e) => setTwoFactorActivation(e.target.checked)}
                    className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                  />
                  <label htmlFor="activation-2fa" className="text-xs text-slate-300 cursor-pointer select-none">
                    Enable Two-Factor Authentication (2FA)
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !activationTokenInput.trim() || !activationPassword}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-slate-950 font-black py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 mt-4 text-xs uppercase tracking-wider cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Activating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Activate &amp; Enter Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Company Registration Callout Button (SaaS Tenant Onboarding) */}
        {onRegisterOrganization && (
          <div className="mt-4 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between backdrop-blur-md">
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span>New Organization?</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Register company &amp; provision operating branches.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowRegisterCompanyModal(true)}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Register Company</span>
            </button>
          </div>
        )}

        <div className="mt-5 text-center text-[10px] text-slate-500">
          Strict Multi-Tenant Isolation • Automated SaaS Provisioning
        </div>
      </div>

      {/* Multi-Step Company Registration Modal */}
      {showRegisterCompanyModal && onRegisterOrganization && (
        <RegisterCompanyModal
          isOpen={showRegisterCompanyModal}
          onClose={() => setShowRegisterCompanyModal(false)}
          onRegister={(data) => {
            onRegisterOrganization(data);
            setShowRegisterCompanyModal(false);
          }}
        />
      )}
    </div>
  );
};
