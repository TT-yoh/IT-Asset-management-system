import React, { useEffect, useState } from 'react';
import { Asset, MaintenanceRecord } from '../../types';
import { Radio, PlusCircle, CheckCircle2, AlertTriangle, ArrowRightLeft, Clock } from 'lucide-react';

export interface TickerEvent {
  id: string;
  type: 'ASSET_ADDED' | 'CHECKED_OUT' | 'REPAIR_COMPLETED' | 'STATUS_CHANGED';
  title: string;
  subtitle: string;
  timestamp: string;
  assetId?: string;
}

interface ThreeDDataFeedProps {
  assets: Asset[];
  maintenances: MaintenanceRecord[];
  onHighlightAsset: (assetId: string | null) => void;
  onSelectEvent: (event: TickerEvent) => void;
}

export const ThreeDDataFeed: React.FC<ThreeDDataFeedProps> = ({
  assets,
  maintenances,
  onHighlightAsset,
  onSelectEvent
}) => {
  const [events, setEvents] = useState<TickerEvent[]>([]);

  // Seed & simulate real-time live events
  useEffect(() => {
    if (assets.length === 0) return;

    const initialEvents: TickerEvent[] = [
      {
        id: 'ev-1',
        type: 'ASSET_ADDED',
        title: 'New Hardware Enrolled',
        subtitle: `${assets[0]?.name || 'MacBook Pro M3'} registered to ${assets[0]?.branchName || 'London HQ'}`,
        timestamp: 'Just now',
        assetId: assets[0]?.id
      },
      {
        id: 'ev-2',
        type: 'CHECKED_OUT',
        title: 'Device Checked Out',
        subtitle: `${assets[1]?.name || 'Dell XPS 15'} assigned to Sarah Jenkins`,
        timestamp: '2m ago',
        assetId: assets[1]?.id
      },
      {
        id: 'ev-3',
        type: 'REPAIR_COMPLETED',
        title: 'Bench Repair Completed',
        subtitle: `Display Panel replaced for [${assets[2]?.assetCode || 'AST-104'}]`,
        timestamp: '14m ago',
        assetId: assets[2]?.id
      },
      {
        id: 'ev-4',
        type: 'STATUS_CHANGED',
        title: 'Outage Status Flag',
        subtitle: `Asset status shifted to REPAIR at Tokyo Branch`,
        timestamp: '29m ago',
        assetId: assets[3]?.id
      }
    ];

    setEvents(initialEvents);

    // Live ticker simulated pulse
    const timer = setInterval(() => {
      const randomAsset = assets[Math.floor(Math.random() * assets.length)];
      if (!randomAsset) return;

      const types: TickerEvent['type'][] = ['ASSET_ADDED', 'CHECKED_OUT', 'REPAIR_COMPLETED', 'STATUS_CHANGED'];
      const pickType = types[Math.floor(Math.random() * types.length)]!;

      const newEv: TickerEvent = {
        id: `ev-${Date.now()}`,
        type: pickType,
        title: pickType === 'ASSET_ADDED' ? 'Hardware Auto-Enrolled' :
               pickType === 'CHECKED_OUT' ? 'Assigned Field Device' :
               pickType === 'REPAIR_COMPLETED' ? 'Maintenance Ticket Closed' : 'Status Flag Transition',
        subtitle: `${randomAsset.name} (${randomAsset.assetCode}) @ ${randomAsset.branchName}`,
        timestamp: 'Just now',
        assetId: randomAsset.id
      };

      setEvents(prev => [newEv, ...prev.slice(0, 7)]);
    }, 12000);

    return () => clearInterval(timer);
  }, [assets]);

  const getIcon = (type: TickerEvent['type']) => {
    switch (type) {
      case 'ASSET_ADDED': return <PlusCircle className="w-4 h-4 text-emerald-400" />;
      case 'CHECKED_OUT': return <ArrowRightLeft className="w-4 h-4 text-blue-400" />;
      case 'REPAIR_COMPLETED': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'STATUS_CHANGED': return <AlertTriangle className="w-4 h-4 text-rose-400" />;
    }
  };

  return (
    <div className="bg-slate-900/95 border border-slate-800 p-4 rounded-2xl shadow-2xl space-y-3 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-rose-500 animate-pulse" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Live WebSocket Event Ticker</h4>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          ● STREAM ACTIVE
        </span>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1 text-xs divide-y divide-slate-800/60">
        {events.map((ev) => (
          <div
            key={ev.id}
            onMouseEnter={() => onHighlightAsset(ev.assetId || null)}
            onMouseLeave={() => onHighlightAsset(null)}
            onClick={() => onSelectEvent(ev)}
            className="pt-2 flex items-start justify-between gap-2.5 hover:bg-slate-800/50 p-2 rounded-xl transition-all cursor-pointer group"
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 shrink-0 group-hover:scale-110 transition-transform">
                {getIcon(ev.type)}
              </div>
              <div className="min-w-0">
                <span className="font-bold text-slate-200 text-xs block group-hover:text-emerald-300 transition-colors">{ev.title}</span>
                <span className="text-[11px] text-slate-400 truncate block">{ev.subtitle}</span>
              </div>
            </div>
            <span className="text-[10px] font-mono text-slate-500 shrink-0 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{ev.timestamp}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
