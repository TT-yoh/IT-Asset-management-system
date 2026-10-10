import React, { useState } from 'react';
import {
  Layers, RotateCw, Eye, EyeOff, Camera, Maximize2, Minimize2,
  RefreshCw, HelpCircle, Palette, Zap, Building2, Cpu, Wrench
} from 'lucide-react';

export type View3DType = 'BRANCH_FLOOR' | 'CATEGORY_CLUSTER' | 'DEPRECIATION_LANDSCAPE' | 'MAINTENANCE_TIMELINE';
export type ColorSchemeType = 'STATUS' | 'AGE' | 'COST';

interface ThreeDControlsProps {
  currentView: View3DType;
  onSelectView: (v: View3DType) => void;
  rotationSpeed: number;
  onRotationSpeedChange: (s: number) => void;
  showLabels: boolean;
  onToggleLabels: () => void;
  colorScheme: ColorSchemeType;
  onColorSchemeChange: (cs: ColorSchemeType) => void;
  onResetView: () => void;
  onExportScreenshot: () => void;
  onToggleHelp: () => void;
}

export const ThreeDControls: React.FC<ThreeDControlsProps> = ({
  currentView,
  onSelectView,
  rotationSpeed,
  onRotationSpeedChange,
  showLabels,
  onToggleLabels,
  colorScheme,
  onColorSchemeChange,
  onResetView,
  onExportScreenshot,
  onToggleHelp
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    const elem = document.documentElement;
    if (!document.fullscreenElement) {
      elem.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="bg-slate-900/95 border border-slate-800 p-4 rounded-2xl shadow-2xl text-xs space-y-4 text-slate-300 backdrop-blur-md">
      {/* View Matrix Selector */}
      <div>
        <label className="block text-[10px] font-mono uppercase text-slate-400 mb-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-emerald-400" />
          <span>3D Projection Matrix View</span>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onSelectView('BRANCH_FLOOR')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition-all border ${
              currentView === 'BRANCH_FLOOR'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-500/10'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Branch Spheres</span>
          </button>

          <button
            onClick={() => onSelectView('CATEGORY_CLUSTER')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition-all border ${
              currentView === 'CATEGORY_CLUSTER'
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50 shadow-md shadow-indigo-500/10'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Category Shapes</span>
          </button>

          <button
            onClick={() => onSelectView('DEPRECIATION_LANDSCAPE')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition-all border ${
              currentView === 'DEPRECIATION_LANDSCAPE'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md shadow-amber-500/10'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Depr. Landscape</span>
          </button>

          <button
            onClick={() => onSelectView('MAINTENANCE_TIMELINE')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold transition-all border ${
              currentView === 'MAINTENANCE_TIMELINE'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-md shadow-rose-500/10'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Repairs Timeline</span>
          </button>
        </div>
      </div>

      {/* Sliders & Color scheme */}
      <div className="space-y-3 pt-2 border-t border-slate-800">
        <div>
          <div className="flex justify-between items-center text-[11px] mb-1">
            <span className="text-slate-400">Orbit Rotation Velocity:</span>
            <span className="font-mono text-emerald-400 font-bold">{Math.round(rotationSpeed * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={rotationSpeed}
            onChange={e => onRotationSpeedChange(parseFloat(e.target.value))}
            className="w-full accent-emerald-400 bg-slate-950 rounded-lg h-1.5 cursor-pointer"
          />
        </div>

        <div>
          <label className="block text-[11px] text-slate-400 mb-1 flex items-center gap-1">
            <Palette className="w-3.5 h-3.5 text-indigo-400" />
            <span>Node Color Coding Scheme:</span>
          </label>
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['STATUS', 'AGE', 'COST'] as ColorSchemeType[]).map(cs => (
              <button
                key={cs}
                onClick={() => onColorSchemeChange(cs)}
                className={`flex-1 py-1 rounded-lg font-bold text-[10px] transition-all ${
                  colorScheme === cs ? 'bg-slate-800 text-white shadow' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {cs}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Utility Action Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800">
        <button
          onClick={onToggleLabels}
          className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold border transition-all ${
            showLabels ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-950 text-slate-500 border-slate-800'
          }`}
        >
          {showLabels ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{showLabels ? 'Labels ON' : 'Labels OFF'}</span>
        </button>

        <button
          onClick={onResetView}
          className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl font-bold border border-slate-700 transition-all"
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
          <span>Reset Orbit</span>
        </button>

        <button
          onClick={onExportScreenshot}
          className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl font-bold border border-slate-700 transition-all shadow-md"
        >
          <Camera className="w-3.5 h-3.5 text-amber-400" />
          <span>Capture 3D</span>
        </button>

        <button
          onClick={onToggleHelp}
          className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-2 rounded-xl font-bold transition-all shadow-md shadow-indigo-600/20"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Legend</span>
        </button>
      </div>
    </div>
  );
};
