import React, { useState } from 'react';
import { 
  Bell, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Wrench, 
  Clock, 
  CheckCheck, 
  Trash2,
  Filter
} from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { SystemNotification } from '../types';

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
  orgId: string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  orgId
}) => {
  const { notifications, markAllAsRead, markAsRead, removeNotification } = useNotifications();
  const [filterType, setFilterType] = useState<'ALL' | 'ALERT' | 'WARRANTY' | 'MAINTENANCE' | 'ASSIGNMENT'>('ALL');

  if (!isOpen) return null;

  const orgNotifications = notifications.filter(n => !n.orgId || n.orgId === orgId);
  const filteredList = orgNotifications.filter(n => {
    if (filterType === 'ALL') return true;
    return n.type === filterType;
  });

  const getIcon = (type: SystemNotification['type']) => {
    switch (type) {
      case 'ALERT':
        return <AlertCircle className="w-4 h-4 text-rose-400" />;
      case 'WARRANTY':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'MAINTENANCE':
        return <Wrench className="w-4 h-4 text-sky-400" />;
      case 'ASSIGNMENT':
      default:
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getBorderColor = (type: SystemNotification['type']) => {
    switch (type) {
      case 'ALERT':
        return 'border-rose-500/30 bg-rose-500/5';
      case 'WARRANTY':
        return 'border-amber-500/30 bg-amber-500/5';
      case 'MAINTENANCE':
        return 'border-sky-500/30 bg-sky-500/5';
      case 'ASSIGNMENT':
      default:
        return 'border-emerald-500/30 bg-emerald-500/5';
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-slate-900/95 backdrop-blur-xl border-l border-slate-800 shadow-2xl flex flex-col transition-all">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
            <Bell className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-sm">System Alerts & Notifications</h3>
            <p className="text-xs text-slate-400">
              {orgNotifications.filter(n => !n.read).length} unread alerts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => markAllAsRead(orgId)}
            title="Mark all as read"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 text-xs flex items-center gap-1 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" /> Mark read
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2 border-b border-slate-800 flex gap-1.5 bg-slate-950/30 overflow-x-auto">
        {(['ALL', 'ALERT', 'WARRANTY', 'MAINTENANCE', 'ASSIGNMENT'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilterType(tab)}
            className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-all whitespace-nowrap ${
              filterType === tab
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {filteredList.length === 0 ? (
          <div className="text-center py-12 text-slate-500 space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-slate-600 opacity-60" />
            <p className="text-xs">No notifications matching this filter</p>
          </div>
        ) : (
          filteredList.map((notif) => (
            <div
              key={notif.id}
              onClick={() => markAsRead(notif.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer relative group ${getBorderColor(
                notif.type
              )} ${notif.read ? 'opacity-70 bg-slate-950/20' : 'opacity-100'}`}
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex-shrink-0">{getIcon(notif.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-slate-200 truncate">
                      {notif.title}
                    </h4>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {notif.timestamp}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {notif.message}
                  </p>
                </div>
              </div>

              {/* Action buttons on hover */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeNotification(notif.id);
                  }}
                  className="p-1 rounded bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 text-[10px] transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
