import React, { useState } from 'react';
import { Organization } from '../../types';
import { Building2, Mail, Lock, ShieldCheck, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

interface LoginFormProps {
  organizations: Organization[];
  selectedOrgId: string;
  onSelectOrg: (orgId: string) => void;
  onLoginSubmit: (email: string, password: string) => void;
  isLoading?: boolean;
  error?: string | null;
  onRequestAccessClick: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  organizations,
  selectedOrgId,
  onSelectOrg,
  onLoginSubmit,
  isLoading = false,
  error = null,
  onRequestAccessClick
}) => {
  const [email, setEmail] = useState('jsmith@mineazy.com');
  const [password, setPassword] = useState('password123');
  const [rememberMe, setRememberMe] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    onLoginSubmit(email, password);
  };

  const currentOrg = organizations.find(o => o.id === selectedOrgId);

  return (
    <div className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
      {/* Background glow accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-emerald-500 rounded-full blur-sm" />

      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-4 text-emerald-400">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-100">Tenant Access Portal</h2>
        <p className="text-xs text-slate-400 mt-1">Select organization and verify credentials</p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-300 text-xs animate-shake">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Organization Tenant Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Organization Tenant
          </label>
          <div className="relative">
            <Building2 className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedOrgId}
              onChange={(e) => {
                onSelectOrg(e.target.value);
                // Switch default email helper
                if (e.target.value === 'org-mineazy') setEmail('jsmith@mineazy.com');
                else setEmail('adavis@ebs-power.com');
              }}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 transition font-medium appearance-none"
            >
              {organizations.map(org => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.domain})
                </option>
              ))}
            </select>
          </div>
          <p className="text-[10px] text-emerald-400/80 mt-1 pl-1">
            Active Tenant DB: <span className="font-mono">{currentOrg?.id}</span>
          </p>
        </div>

        {/* Email Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
            Work Email
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>
        </div>

        {/* Password Input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Password
            </label>
            <button
              type="button"
              onClick={() => alert('Password reset links require admin verification in Phase 2.')}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 transition"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition font-mono"
            />
          </div>
        </div>

        {/* Remember Me */}
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-emerald-500 focus:ring-emerald-500 w-4 h-4"
            />
            <span>Remember session on this device</span>
          </label>
        </div>

        {/* Login Submit Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 mt-6 text-sm"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying Tenant Auth...</span>
            </>
          ) : (
            <>
              <span>Sign In to Organization</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Footer link */}
      <div className="mt-6 pt-6 border-t border-slate-800/80 text-center">
        <p className="text-xs text-slate-400">
          Need an organization account?{' '}
          <button
            type="button"
            onClick={onRequestAccessClick}
            className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 transition"
          >
            Request IT Access
          </button>
        </p>
      </div>
    </div>
  );
};
