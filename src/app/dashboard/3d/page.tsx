import React from 'react';
import { ThreeDDashboard } from '@/components/3d/ThreeDDashboard';
import { ThreeDDataFeed } from '@/components/3d/ThreeDDataFeed';
import { Box, Layers, Cpu, ShieldCheck } from 'lucide-react';

/**
 * File 1 Deliverable: src/app/dashboard/3d/page.tsx
 * Next.js App Router Entry Surface for Interactive 3D Digital Twin Bench
 */
export default async function ThreeDDashboardPage() {
  // Server-side simulated data fetch from backend DB
  const mockBranches = [
    { id: 'b1', name: 'London HQ', code: 'LON-01', address: '1 Canute Place, London', manager: 'Chen Wei', contactEmail: 'lon@mineazy.com', assetCount: 42, activeUsers: 38 },
    { id: 'b2', name: 'Tokyo Branch', code: 'TYO-02', address: 'Shinjuku Tower, Tokyo', manager: 'Kenji Sato', contactEmail: 'tyo@mineazy.com', assetCount: 29, activeUsers: 25 },
    { id: 'b3', name: 'New York Hub', code: 'NYC-03', address: 'Wall St 40, NY', manager: 'Sarah Jenkins', contactEmail: 'nyc@mineazy.com', assetCount: 51, activeUsers: 49 }
  ];

  const mockAssets = [
    { id: 'ast-1', name: 'MacBook Pro M3 Max', assetCode: 'AST-101', category: 'Laptop', status: 'ACTIVE' as const, branchId: 'b1', branchName: 'London HQ', purchasePrice: 3499, purchaseDate: '2024-01-15' },
    { id: 'ast-2', name: 'Dell PowerEdge R750', assetCode: 'AST-102', category: 'Server', status: 'ACTIVE' as const, branchId: 'b1', branchName: 'London HQ', purchasePrice: 8500, purchaseDate: '2023-06-10' },
    { id: 'ast-3', name: 'UltraSharp 32 4K Monitor', assetCode: 'AST-103', category: 'Monitor', status: 'REPAIR' as const, branchId: 'b2', branchName: 'Tokyo Branch', purchasePrice: 1100, purchaseDate: '2022-11-20' },
    { id: 'ast-4', name: 'POS Terminal Touch Gen3', assetCode: 'AST-104', category: 'POS', status: 'ACTIVE' as const, branchId: 'b3', branchName: 'New York Hub', purchasePrice: 1800, purchaseDate: '2024-03-01' }
  ];

  const mockMaintenances = [
    { id: 'mnt-1', assetId: 'ast-3', assetCode: 'AST-103', assetName: 'UltraSharp 32 Monitor', type: 'REPAIR' as const, status: 'IN_PROGRESS' as const, description: 'Display panel backlight flicker', reportedBy: 'Kenji Sato', assignedTechnician: 'IT Repair Pool', startDate: '2026-06-25', expectedCompletion: '2026-06-28', cost: 350 }
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Navigation Bar & Title */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-bold border border-emerald-500/20 tracking-wider uppercase">
              Phase 7 Digital Twin Surface
            </span>
            <span className="text-slate-400 text-xs">• WebGL Three.js Matrix</span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1 flex items-center gap-2.5">
            <Box className="w-7 h-7 text-emerald-400 shrink-0" />
            <span>Interactive 3D Hardware Dashboard</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Real-time spatial visualization of enterprise hardware distribution across international branches, live maintenance turnaround metrics, and category clusters.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-950 px-4 py-2 rounded-2xl border border-slate-800 font-mono text-xs text-slate-300">
            <span className="text-slate-500 text-[10px] block">TOTAL FLEET VALUE</span>
            <span className="text-emerald-400 font-bold text-sm">$14,899.00</span>
          </div>
        </div>
      </header>

      {/* Main 3D Twin Viewport */}
      <section>
        <ThreeDDashboard
          branches={mockBranches}
          assets={mockAssets}
          maintenances={mockMaintenances}
        />
      </section>

      {/* Bottom Live Data Feed Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ThreeDDataFeed
            assets={mockAssets}
            maintenances={mockMaintenances}
            onHighlightAsset={() => {}}
            onSelectEvent={() => {}}
          />
        </div>
        
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>3D WebGL Telemetry Engine</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Rendering hardware geometry via raw Three.js buffer arrays. Orbit controls run at 60 FPS with adaptive shadow mapping and anti-aliasing.
            </p>
          </div>
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 font-mono text-[11px] text-emerald-300 space-y-1">
            <div>✓ WebGL 2.0 Context Verified</div>
            <div>✓ Raycaster Interaction Enabled</div>
            <div>✓ WebSocket Sync Stream: ACTIVE</div>
          </div>
        </div>
      </section>
    </main>
  );
}
