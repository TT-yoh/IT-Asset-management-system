import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Asset, Branch, MaintenanceRecord, Budget } from '../../types';
import { createScene, createCamera, createRenderer, addSceneLighting, setupInteractiveControls, createTextSprite } from '../../lib/three-utils';
import { ThreeDControls, View3DType, ColorSchemeType } from './ThreeDControls';
import { BranchVisualization } from './BranchVisualization';
import { AssetCategoryVisualization } from './AssetCategoryVisualization';
import { DeprecationVisualization } from './DeprecationVisualization';
import { MaintenanceVisualization } from './MaintenanceVisualization';
import { AnimatedStatistics } from './AnimatedStatistics';
import { Building2, Info, X } from 'lucide-react';

interface ThreeDDashboardProps {
  branches: Branch[];
  assets: Asset[];
  maintenances: MaintenanceRecord[];
  budgets?: Budget[];
  onSelectBranch?: (branch: Branch) => void;
  onSelectAsset?: (asset: Asset) => void;
}

export const ThreeDDashboard: React.FC<ThreeDDashboardProps> = ({
  branches,
  assets,
  maintenances,
  budgets = [],
  onSelectBranch,
  onSelectAsset
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  
  // Controls state
  const [currentView, setCurrentView] = useState<View3DType>('BRANCH_FLOOR');
  const [rotationSpeed, setRotationSpeed] = useState<number>(0.2);
  const [showLabels, setShowLabels] = useState<boolean>(true);
  const [colorScheme, setColorScheme] = useState<ColorSchemeType>('STATUS');

  // Tooltip & Selection
  const [hoveredNode, setHoveredNode] = useState<any | null>(null);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  const [showLegendModal, setShowLegendModal] = useState<boolean>(false);

  // Three.js scene refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const targetGroupRef = useRef<THREE.Group>(new THREE.Group());

  // Initialize WebGL Scene
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = createScene();
    const camera = createCamera(width, height);
    const renderer = createRenderer(width, height);
    
    container.appendChild(renderer.domElement);
    addSceneLighting(scene);

    const group = targetGroupRef.current;
    scene.add(group);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const cleanupControls = setupInteractiveControls(
      container,
      camera,
      group,
      (node) => setHoveredNode(node),
      (node) => {
        setSelectedNode(node);
        if (node.asset && onSelectAsset) onSelectAsset(node.asset);
        if (node.branch && onSelectBranch) onSelectBranch(node.branch);
      }
    );

    // Animation Loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      if (group && rotationSpeed > 0) {
        group.rotation.y += 0.003 * rotationSpeed;
      }
      renderer.render(scene, camera);
    };
    animate();

    // Resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      cleanupControls();
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.remove();
      }
    };
  }, []);

  // Render Default Branch Spheres when in BRANCH_FLOOR view
  useEffect(() => {
    if (currentView !== 'BRANCH_FLOOR' || branches.length === 0) return;
    const group = targetGroupRef.current;
    
    // If we haven't selected a specific branch floor, show overview spheres
    while (group.children.length > 0) {
      group.remove(group.children[0]!);
    }

    const count = branches.length;
    const radius = 12;

    branches.forEach((br, idx) => {
      const angle = (idx / count) * Math.PI * 2;
      const posX = Math.cos(angle) * radius;
      const posZ = Math.sin(angle) * radius;
      const brAssets = assets.filter(a => a.branchId === br.id);
      const repairCount = brAssets.filter(a => a.status === 'REPAIR').length;

      const sphereSize = Math.max(1.2, Math.min(3.5, brAssets.length * 0.3));
      const geo = new THREE.SphereGeometry(sphereSize, 32, 32);

      let color = 0x10b981; // Green
      if (repairCount > 0) color = 0xf43f5e; // Red repair
      if (brAssets.length === 0) color = 0x64748b; // Slate

      const mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.2,
        metalness: 0.6,
        emissive: color,
        emissiveIntensity: repairCount > 0 ? 0.4 : 0.1
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(posX, 2, posZ);
      mesh.castShadow = true;
      mesh.userData = { id: br.id, title: br.name, code: br.code, branch: br, count: brAssets.length, repair: repairCount };
      group.add(mesh);

      if (showLabels) {
        const sprite = createTextSprite(br.name, `${brAssets.length} Assets (${repairCount} Repair)`, repairCount > 0 ? '#881337' : '#0f172a');
        sprite.position.set(posX, 2 + sphereSize + 1.5, posZ);
        group.add(sprite);
      }
    });

    // Central Globe Wireframe
    const globeGeo = new THREE.SphereGeometry(4, 16, 16);
    const globeMat = new THREE.MeshBasicMaterial({ color: 0x14b8a6, wireframe: true, transparent: true, opacity: 0.25 });
    const globe = new THREE.Mesh(globeGeo, globeMat);
    globe.position.set(0, 2, 0);
    group.add(globe);

  }, [branches, assets, currentView, showLabels]);

  const handleResetCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 5, 25);
      cameraRef.current.lookAt(0, 0, 0);
    }
    if (targetGroupRef.current) {
      targetGroupRef.current.rotation.set(0, 0, 0);
    }
  };

  const handleExport = () => {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      const dataURL = rendererRef.current.domElement.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `MinEazy_3D_Bench_${currentView}_${new Date().toISOString().slice(0,10)}.png`;
      a.href = dataURL;
      a.click();
    }
  };

  return (
    <div className="relative w-full h-[720px] bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col lg:flex-row">
      
      {/* Three.js Main Canvas Viewport */}
      <div ref={mountRef} className="relative flex-1 h-full min-h-[480px] cursor-grab active:cursor-grabbing">
        
        {/* Sub-view Overlays */}
        {currentView === 'CATEGORY_CLUSTER' && (
          <AssetCategoryVisualization assets={assets} sceneGroup={targetGroupRef.current} onSelectCategory={() => {}} />
        )}
        {currentView === 'DEPRECIATION_LANDSCAPE' && (
          <DeprecationVisualization assets={assets} sceneGroup={targetGroupRef.current} />
        )}
        {currentView === 'MAINTENANCE_TIMELINE' && (
          <MaintenanceVisualization maintenances={maintenances} sceneGroup={targetGroupRef.current} />
        )}

        {/* Floating Tooltip */}
        {hoveredNode && (
          <div className="absolute top-6 right-6 z-20 bg-slate-900/95 border border-emerald-500/50 p-3.5 rounded-2xl shadow-2xl text-xs max-w-xs pointer-events-none animate-in fade-in duration-150 backdrop-blur-md">
            <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider block">Telemetry Hover Node</span>
            <span className="text-white font-bold text-sm mt-0.5 block">{hoveredNode.title}</span>
            {hoveredNode.code && <span className="text-slate-400 font-mono text-[11px] block mt-0.5">ID Code: {hoveredNode.code}</span>}
            {hoveredNode.count !== undefined && <span className="text-emerald-300 font-bold block mt-1">📦 {hoveredNode.count} Active Units</span>}
            {hoveredNode.cost && <span className="text-rose-400 font-mono font-bold block mt-1">💰 Cost: {hoveredNode.cost}</span>}
            {hoveredNode.depr && <span className="text-amber-400 font-mono font-bold block mt-1">📉 {hoveredNode.depr}</span>}
          </div>
        )}

        {/* Animated KPIs Footer overlay */}
        <AnimatedStatistics assets={assets} maintenances={maintenances} budgets={budgets} />
      </div>

      {/* Side Controls Panel */}
      <div className="w-full lg:w-80 p-4 shrink-0 overflow-y-auto bg-slate-900/80 border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col gap-4">
        <ThreeDControls
          currentView={currentView}
          onSelectView={setCurrentView}
          rotationSpeed={rotationSpeed}
          onRotationSpeedChange={setRotationSpeed}
          showLabels={showLabels}
          onToggleLabels={() => setShowLabels(!showLabels)}
          colorScheme={colorScheme}
          onColorSchemeChange={setColorScheme}
          onResetView={handleResetCamera}
          onExportScreenshot={handleExport}
          onToggleHelp={() => setShowLegendModal(true)}
        />
      </div>

      {/* Legend Modal */}
      {showLegendModal && (
        <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-xs text-slate-300 space-y-4">
            <button onClick={() => setShowLegendModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Info className="w-5 h-5 text-emerald-400 shrink-0" />
              <span>3D Projection Matrix Legend</span>
            </h3>

            <div className="space-y-3 font-mono">
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 rounded-full bg-emerald-500 inline-block shrink-0 shadow-lg shadow-emerald-500/40"></span>
                <span>Active Hardware / Normal Operations (0 Repair)</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 rounded-full bg-rose-500 inline-block shrink-0 shadow-lg shadow-rose-500/40 animate-pulse"></span>
                <span>Bench Outage / Damaged / Overdue Work Order</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 rounded-full bg-amber-500 inline-block shrink-0 shadow-lg shadow-amber-500/40"></span>
                <span>In Progress Diagnostics / Storage Reserve</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-4 h-4 rounded-full bg-indigo-500 inline-block shrink-0 shadow-lg shadow-indigo-500/40"></span>
                <span>Category Cluster Catalog Node</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">
              💡 <b>Mouse Navigation:</b> Left-Click + Drag to Orbit view. Mouse Wheel to Zoom in/out. Right-Click + Drag to Pan camera across spatial plane.
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
