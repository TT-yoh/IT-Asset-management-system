import React, { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' styles the confirm button red and focuses Cancel by default. */
  tone?: 'default' | 'danger';
}

export interface PromptOptions extends ConfirmOptions {
  inputLabel: string;
  placeholder?: string;
  /** When true (default) the confirm button stays disabled until text is entered. */
  required?: boolean;
}

interface FeedbackContextValue {
  /** Non-blocking status message. Errors stay longer and are announced assertively. */
  toast: (text: string, type?: ToastType) => void;
  /** In-app replacement for window.confirm. Resolves true when confirmed. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** In-app replacement for window.prompt. Resolves the trimmed text, or null when cancelled. */
  promptText: (options: PromptOptions) => Promise<string | null>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
}

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-950/95 border-emerald-500/40 text-emerald-100',
  error: 'bg-rose-950/95 border-rose-500/40 text-rose-100',
  info: 'bg-slate-900/95 border-sky-500/40 text-sky-100'
};

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />,
  error: <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" aria-hidden="true" />,
  info: <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
};

const FeedbackDialog: React.FC<{ state: DialogState; onSettle: (value: boolean | string | null) => void }> = ({
  state,
  onSettle
}) => {
  const { options } = state;
  const isPrompt = state.kind === 'prompt';
  const required = isPrompt ? (state.options.required ?? true) : false;
  const [text, setText] = useState('');
  const titleId = useId();
  const descId = useId();
  const inputId = useId();

  const cancel = () => onSettle(isPrompt ? null : false);
  const danger = options.tone === 'danger';
  const canConfirm = !isPrompt || !required || text.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfirm) return;
    onSettle(isPrompt ? text.trim() : true);
  };

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
    >
      <form
        role={isPrompt ? 'dialog' : 'alertdialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? descId : undefined}
        onSubmit={submit}
        className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 outline-none"
      >
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              danger
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
            aria-hidden="true"
          >
            {danger ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-white">
              {options.title}
            </h2>
            {options.message && (
              <div id={descId} className="mt-1.5 text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {options.message}
              </div>
            )}
          </div>
        </div>

        {isPrompt && (
          <div className="mt-4">
            <label htmlFor={inputId} className="block text-xs font-semibold text-slate-300 mb-1.5">
              {state.options.inputLabel}
              {required && <span className="text-rose-400"> *</span>}
            </label>
            <textarea
              id={inputId}
              data-autofocus
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={state.options.placeholder}
              required={required}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            data-modal-close
            data-autofocus={danger && !isPrompt ? true : undefined}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            {options.cancelLabel || 'Cancel'}
          </button>
          <button
            type="submit"
            disabled={!canConfirm}
            data-autofocus={!danger && !isPrompt ? true : undefined}
            className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 ${
              danger
                ? 'bg-rose-600 hover:bg-rose-500 focus-visible:ring-rose-300'
                : 'bg-emerald-600 hover:bg-emerald-500 focus-visible:ring-emerald-300'
            }`}
          >
            {options.confirmLabel || 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
};

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const dialogRef = useRef<DialogState | null>(null);
  dialogRef.current = dialog;

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (text: string, type: ToastType = 'success') => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, text, type }]);
      timers.current.set(id, setTimeout(() => dismiss(id), type === 'error' ? 8000 : 5000));
    },
    [dismiss]
  );

  /** A second dialog request cancels any dialog that is still open. */
  const cancelOpenDialog = () => {
    const open = dialogRef.current;
    if (!open) return;
    if (open.kind === 'prompt') open.resolve(null);
    else open.resolve(false);
  };

  const confirm = useCallback((options: ConfirmOptions) => {
    cancelOpenDialog();
    return new Promise<boolean>((resolve) => setDialog({ kind: 'confirm', options, resolve }));
  }, []);

  const promptText = useCallback((options: PromptOptions) => {
    cancelOpenDialog();
    return new Promise<string | null>((resolve) => setDialog({ kind: 'prompt', options, resolve }));
  }, []);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const settle = (value: boolean | string | null) => {
    const open = dialogRef.current;
    if (!open) return;
    setDialog(null);
    if (open.kind === 'prompt') open.resolve(typeof value === 'string' ? value : null);
    else open.resolve(value === true);
  };

  const value = useMemo(() => ({ toast, confirm, promptText }), [toast, confirm, promptText]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div
        className="fixed z-[210] top-4 right-4 left-4 sm:left-auto sm:w-96 flex flex-col gap-2 pointer-events-none"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            aria-live={t.type === 'error' ? 'assertive' : 'polite'}
            className={`pointer-events-auto flex items-start gap-2.5 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur text-sm ${TOAST_STYLES[t.type]}`}
          >
            {TOAST_ICONS[t.type]}
            <span className="flex-1 min-w-0 break-words">{t.text}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="shrink-0 p-0.5 rounded text-current opacity-70 hover:opacity-100 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>

      {dialog && <FeedbackDialog key={dialog.options.title} state={dialog} onSettle={settle} />}
    </FeedbackContext.Provider>
  );
};

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within a FeedbackProvider');
  return ctx;
}
