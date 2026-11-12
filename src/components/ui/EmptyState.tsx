import React from 'react';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  /** 'primary' is the main call to action; 'secondary' is a quieter alternative. */
  variant?: 'primary' | 'secondary';
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: EmptyStateAction[];
}

/** Friendly placeholder for an empty list, with optional next-step buttons. */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, actions = [] }) => (
  <div className="flex flex-col items-center text-center px-6 py-14 bg-slate-900/40 rounded-2xl border border-dashed border-slate-700">
    {icon && (
      <div
        className="w-12 h-12 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center mb-4"
        aria-hidden="true"
      >
        {icon}
      </div>
    )}
    <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
    {description && <p className="mt-1 text-xs text-slate-400 max-w-sm">{description}</p>}
    {actions.length > 0 && (
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className={
              action.variant === 'secondary'
                ? 'px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer'
                : 'px-4 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition cursor-pointer'
            }
          >
            {action.label}
          </button>
        ))}
      </div>
    )}
  </div>
);

/** Pulsing placeholder rows shown while a list's first page of data is loading. */
export const ListSkeleton: React.FC<{ rows?: number; label?: string }> = ({ rows = 8, label = 'Loading' }) => (
  <div
    role="status"
    aria-live="polite"
    aria-busy="true"
    className="rounded-xl border border-slate-800 bg-slate-900/60 divide-y divide-slate-800/60 overflow-hidden"
  >
    <span className="sr-only">{label}…</span>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-4 p-3.5 animate-pulse" aria-hidden="true">
        <div className="w-4 h-4 rounded bg-slate-800 shrink-0" />
        <div className="h-3 w-20 rounded bg-slate-800 shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-3 rounded bg-slate-800" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
          <div className="h-2.5 w-1/3 rounded bg-slate-800/70" />
        </div>
        <div className="hidden sm:block h-3 w-24 rounded bg-slate-800 shrink-0" />
        <div className="hidden md:block h-5 w-16 rounded-full bg-slate-800 shrink-0" />
        <div className="h-3 w-14 rounded bg-slate-800 shrink-0" />
      </div>
    ))}
  </div>
);
