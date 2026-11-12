import React, { useId, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, KeyRound, Loader2, Lock, Mail } from 'lucide-react';
import { validatePasswordPolicy } from '../../../shared/password-policy';

interface PasswordResetPanelProps {
  /** Reset token taken from a `#/reset?token=` link, when present. */
  initialToken?: string;
  initialEmail?: string;
  onBackToSignIn: () => void;
}

const INPUT_CLASS =
  'w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition';
const LABEL_CLASS = 'block text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1.5';
const SUBMIT_CLASS =
  'w-full bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center justify-center gap-2 mt-5 text-xs uppercase tracking-wider cursor-pointer';

type Step = 'REQUEST' | 'REQUESTED' | 'RESET' | 'DONE';

/**
 * Self-service password reset: request a reset for an email address, then set
 * a new password with the reset token. Talks to /api/auth/forgot-password and
 * /api/auth/reset-password.
 */
export const PasswordResetPanel: React.FC<PasswordResetPanelProps> = ({
  initialToken = '',
  initialEmail = '',
  onBackToSignIn
}) => {
  const [step, setStep] = useState<Step>(initialToken ? 'RESET' : 'REQUEST');
  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailId = useId();
  const tokenId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const errorId = useId();

  const post = async (path: string, body: Record<string, string>) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || (res.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : 'Request failed. Please try again.'));
    }
    return data;
  };

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await post('/api/auth/forgot-password', { email: email.trim() });
      setStep('REQUESTED');
    } catch (err: any) {
      setError(err?.message || 'Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    const policy = validatePasswordPolicy(newPassword, { email });
    if (!policy.valid) {
      setError(policy.error || policy.message || 'Password does not meet the security policy.');
      return;
    }

    setIsSubmitting(true);
    try {
      await post('/api/auth/reset-password', { resetToken: token.trim(), newPassword });
      setNewPassword('');
      setConfirmPassword('');
      setStep('DONE');
    } catch (err: any) {
      setError(err?.message || 'Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const backButton = (
    <button
      type="button"
      onClick={onBackToSignIn}
      className="w-full text-center text-xs text-slate-400 hover:text-white pt-3 cursor-pointer transition"
    >
      ← Back to sign-in
    </button>
  );

  const errorBanner = error && (
    <div
      id={errorId}
      role="alert"
      className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center gap-2.5"
    >
      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
      <span>{error}</span>
    </div>
  );

  const header = (title: string, subtitle: string) => (
    <div className="mb-6">
      <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-emerald-400" aria-hidden="true" />
        <span>{title}</span>
      </h2>
      <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>
    </div>
  );

  if (step === 'REQUESTED') {
    return (
      <div>
        {header('Check your email', 'Reset instructions are on their way if the account exists.')}
        <div role="status" className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-200 flex gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            If <strong className="font-semibold">{email.trim()}</strong> matches an active account, a password reset
            link has been issued. It expires shortly, so use it soon. If nothing arrives, contact your organization
            administrator.
          </span>
        </div>
        <button type="button" onClick={() => { setError(null); setStep('RESET'); }} className={SUBMIT_CLASS}>
          <span>I have a reset code</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
        {backButton}
      </div>
    );
  }

  if (step === 'DONE') {
    return (
      <div>
        {header('Password updated', 'You can now sign in with your new password.')}
        <div role="status" className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-200 flex gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
          <span>Your password has been changed.</span>
        </div>
        <button type="button" onClick={onBackToSignIn} className={SUBMIT_CLASS}>
          <span>Back to sign-in</span>
          <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (step === 'RESET') {
    return (
      <div>
        {header('Set a new password', 'Enter the reset code from your email and choose a new password.')}
        {errorBanner}
        <form onSubmit={handleReset} className="space-y-4" aria-describedby={error ? errorId : undefined}>
          <div>
            <label htmlFor={tokenId} className={LABEL_CLASS}>Reset code</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id={tokenId}
                type="text"
                autoFocus={!token}
                autoComplete="one-time-code"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste the code from your reset email"
                required
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
          </div>
          <div>
            <label htmlFor={passwordId} className={LABEL_CLASS}>New password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id={passwordId}
                type="password"
                autoFocus={!!token}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 12 characters"
                required
                minLength={12}
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
          </div>
          <div>
            <label htmlFor={confirmId} className={LABEL_CLASS}>Confirm new password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id={confirmId}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat the new password"
                required
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
          </div>
          <button type="submit" disabled={isSubmitting} className={SUBMIT_CLASS}>
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Updating password...</span>
              </>
            ) : (
              <>
                <span>Update password</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </>
            )}
          </button>
          {backButton}
        </form>
      </div>
    );
  }

  return (
    <div>
      {header('Reset your password', 'Enter your work email and we will issue a password reset link.')}
      {errorBanner}
      <form onSubmit={handleRequest} className="space-y-4" aria-describedby={error ? errorId : undefined}>
        <div>
          <label htmlFor={emailId} className={LABEL_CLASS}>Work email address</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
            <input
              id={emailId}
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. user@company.com"
              required
              className={`${INPUT_CLASS} font-medium`}
            />
          </div>
        </div>
        <button type="submit" disabled={isSubmitting} className={SUBMIT_CLASS}>
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              <span>Sending...</span>
            </>
          ) : (
            <>
              <span>Send reset link</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => { setError(null); setStep('RESET'); }}
          className="w-full text-center text-xs text-emerald-400 hover:text-emerald-300 pt-3 cursor-pointer transition"
        >
          I already have a reset code
        </button>
        {backButton}
      </form>
    </div>
  );
};
