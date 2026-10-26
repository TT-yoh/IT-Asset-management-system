import React, { useEffect, useRef, useState } from 'react';
import { Organization, Asset, MaintenanceRecord, BudgetAllocation, User } from '../types';
import * as THREE from 'three';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart as RPieChart, Pie, Cell, AreaChart, Area, CartesianGrid } from 'recharts';
import { DollarSign, Cpu, AlertCircle, TrendingDown, Layers, CheckCircle2, RotateCw, Briefcase, Hammer, ShieldAlert, Terminal, Sparkles, ArrowRight, ClipboardList, KeyRound, Wrench } from 'lucide-react';

interface DashboardProps {
  currentOrg: Organization;
  assets: Asset[];
  maintenances: MaintenanceRecord[];
  budgets: BudgetAllocation[];
  currentUser: User | null;
  onNavigateToAssets?: (status: string) => void;
}

export const Dashboard3D: React.FC<DashboardProps> = ({
  currentOrg,
  assets,
  maintenances,
  budgets,
  currentUser,
  onNavigateToAssets
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeTab3D, setActiveTab3D] = useState<'network' | 'server'>('network');
  const [viewMode, setViewMode] = useState<'overview' | '3d'>('overview');

  // KPI calculations
  const orgAssets = assets.filter(a => a.orgId === currentOrg.id);
  const totalValue = orgAssets.reduce((acc, a) => acc + (a.currentValue ?? a.purchaseCost ?? 0), 0);
  const totalPurchase = orgAssets.reduce((acc, a) => acc + (a.purchaseCost ?? 0), 0);
  const totalDepreciation = Math.max(0, totalPurchase - totalValue);
  const activeCount = orgAssets.filter(a => a.status === 'ACTIVE').length;
  const nonWorkingCount = orgAssets.length - activeCount;

  // Chart data: Category breakdown
  const categoryMap: { [k: string]: number } = {};
  orgAssets.forEach(a => {
    const cat = a.categoryName || 'General';
    categoryMap[cat] = (categoryMap[cat] || 0) + 1;
  });
  const pieData = Object.keys(categoryMap).map(k => ({ name: k, value: categoryMap[k] }));
  const COLORS = ['#10b981', '#34d399', '#059669', '#6ee7b7', '#047857', '#a7f3d0'];

  // Chart data: Depreciation timeline forecast
  const areaData = [
    { year: '2024 (Base)', bookValue: totalPurchase },
    { year: '2025', bookValue: Math.round(totalPurchase * 0.82) },
    { year: '2026 (Now)', bookValue: Math.round(totalValue) },
    { year: '2027 (Est)', bookValue: Math.round(totalValue * 0.75) },
    { year: '2028 (Est)', bookValue: Math.round(totalValue * 0.55) },
  ];

  // Branch asset distribution
  const branchMap: { [k: string]: number } = {};
  orgAssets.forEach(a => {
    const rawBranch = a.branchName || 'Unassigned';
    const parts = rawBranch.split(' ');
    const bName = (parts[0] || 'Facility') + ' ' + (parts[1] || '');
    branchMap[bName] = (branchMap[bName] || 0) + (a.currentValue ?? a.purchaseCost ?? 0);
  });
  const barData = Object.keys(branchMap).map(k => ({ branch: k, value: Math.round(branchMap[k]) }));

  // Three.js Animated 3D Scene
  useEffect(() => {
    if (!mountRef.current || viewMode !== '3d') return;
    const currentMount = mountRef.current;
    const width = currentMount.clientWidth;
    const height = currentMount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 22;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    currentMount.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0x10b981, 4, 50); // Emerald point light
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);
    const pointLight2 = new THREE.PointLight(0x34d399, 4, 50); // Mint light
    pointLight2.position.set(-10, -10, 10);
    scene.add(pointLight2);

    const group = new THREE.Group();
    scene.add(group);

    // Create 3D Server Hub Center
    const centerGeo = new THREE.IcosahedronGeometry(2.2, 1);
    const centerMat = new THREE.MeshStandardMaterial({
      color: 0x065f46,
      wireframe: activeTab3D === 'network',
      roughness: 0.2,
      metalness: 0.8
    });
    const centerMesh = new THREE.Mesh(centerGeo, centerMat);
    group.add(centerMesh);

    // Orbiting Asset Nodes representing actual Working vs Non-Working Assets
    const nodes: THREE.Mesh[] = [];
    const linesGroup = new THREE.Group();
    group.add(linesGroup);

    const nodeGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const nodeMatWorking = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.5 }); // Emerald for working
    const nodeMatNonWorking = new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xe11d48, emissiveIntensity: 0.6 }); // Rose for non-working

    const totalAssets = orgAssets.length;
    orgAssets.forEach((asset, i) => {
      const phi = Math.acos(-1 + (2 * i) / (totalAssets || 1));
      const theta = Math.sqrt((totalAssets || 1) * Math.PI) * phi;
      const radius = 7 + (i % 3);

      const x = radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi);
      const z = radius * Math.cos(phi);

      const isWorking = asset.status === 'ACTIVE';
      const mesh = new THREE.Mesh(nodeGeo, isWorking ? nodeMatWorking : nodeMatNonWorking);
      mesh.position.set(x, y, z);
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      group.add(mesh);
      nodes.push(mesh);

      // Connecting line to center
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(x, y, z)
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: isWorking ? 0x10b981 : 0xf43f5e, transparent: true, opacity: 0.25 });
      const line = new THREE.Line(lineGeo, lineMat);
      linesGroup.add(line);
    });

    // Animation Loop
    let animationFrameId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      group.rotation.y += 0.005;
      group.rotation.x += 0.002;

      centerMesh.rotation.y -= 0.01;
      nodes.forEach((n, idx) => {
        n.rotation.x += 0.02;
        n.rotation.y += 0.02;
        n.position.y += Math.sin(clock.getElapsedTime() * 2 + idx) * 0.005;
      });

      renderer.render(scene, camera);
    };
    animate();

    // Mouse interactive drag rotation
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onMouseDown = (e: MouseEvent) => { isDragging = true; previousMousePosition = { x: e.clientX, y: e.clientY }; };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;
      group.rotation.y += deltaX * 0.008;
      group.rotation.x += deltaY * 0.008;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => { isDragging = false; };

    currentMount.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    const handleResize = () => {
      if (!currentMount) return;
      const newW = currentMount.clientWidth;
      const newH = currentMount.clientHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (currentMount && renderer.domElement && currentMount.contains(renderer.domElement)) {
        currentMount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [orgAssets.length, activeTab3D, viewMode]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      {/* Simple Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span>IT Asset Dashboard</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time inventory overview and operational health for <strong className="text-emerald-400 font-semibold">{currentOrg.name}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {onNavigateToAssets && (
            <button
              onClick={() => onNavigateToAssets('ALL')}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center gap-1.5"
            >
              <span>View Full Inventory</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total Fleet Value</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><DollarSign className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div className="flex items-center space-x-1 mt-2 text-[11px] text-emerald-400">
            <span>Original Cost: ${totalPurchase.toLocaleString()}</span>
          </div>
        </div>

        <div 
          onClick={() => onNavigateToAssets && onNavigateToAssets('ACTIVE')}
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl relative overflow-hidden group hover:border-emerald-500/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Active & In Use</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400"><CheckCircle2 className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">{activeCount} <span className="text-sm font-normal text-slate-400">/ {orgAssets.length} units</span></div>
          <div className="text-[11px] text-emerald-400 mt-2">● Healthy, operational equipment</div>
        </div>

        <div 
          onClick={() => onNavigateToAssets && onNavigateToAssets('NON_WORKING')}
          className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl relative overflow-hidden group hover:border-rose-500/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>In Repair / Offline</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400"><AlertCircle className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">{nonWorkingCount} <span className="text-sm font-normal text-slate-400">units</span></div>
          <div className="text-[11px] text-rose-400 mt-2">● Pending diagnostics or repair</div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl relative overflow-hidden group hover:border-indigo-500/40 transition-colors">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Staff Custody Allocation</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400"><Layers className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {Math.round((orgAssets.filter(a => a.assignedToUserName).length / (orgAssets.length || 1)) * 100)}%
          </div>
          <div className="text-[11px] text-indigo-400 mt-2">● Handover checkouts logged</div>
        </div>
      </div>

      {/* Main Grid: Overview Charts OR 3D Topology */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between min-h-[400px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 border-b border-slate-800 pb-3">
            <div>
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                {viewMode === 'overview' ? 'Hardware Distribution by Branch' : '3D Real-Time Asset Topology'}
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {viewMode === 'overview' ? 'Physical assets allocated across operational facilities' : 'Interactive spatial representation of active devices'}
              </p>
            </div>

            {/* Simple View Switcher */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shrink-0 self-start sm:self-auto">
              <button
                onClick={() => setViewMode('overview')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  viewMode === 'overview' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setViewMode('3d')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  viewMode === '3d' ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                3D View
              </button>
            </div>
          </div>

          {viewMode === 'overview' ? (
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="branch" stroke="#64748b" fontSize={10} interval={0} tickFormatter={(val: string) => val.length > 10 ? val.split(' ')[0] : val} />
                  <YAxis stroke="#64748b" fontSize={10} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                    formatter={(value: any) => [`$${value.toLocaleString()}`, 'Total Value']}
                  />
                  <Bar dataKey="value" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="relative flex-1 w-full min-h-[340px]">
              <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing min-h-[340px]" />
              <div className="absolute top-2 right-2 z-10">
                <button
                  onClick={() => setActiveTab3D(activeTab3D === 'network' ? 'server' : 'network')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-[10px] font-mono border border-slate-700 flex items-center gap-1.5"
                >
                  <RotateCw className="w-3 h-3 text-emerald-400" />
                  <span>Wireframe</span>
                </button>
              </div>
              <div className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-md border border-slate-800 p-2.5 rounded-xl text-[11px] text-slate-300 space-y-1 pointer-events-none">
                <div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-sm bg-emerald-400 block" /><span>Working Assets ({activeCount})</span></div>
                <div className="flex items-center space-x-2"><span className="w-2 h-2 rounded-sm bg-rose-500 block" /><span>Non-Working Assets ({nonWorkingCount})</span></div>
              </div>
            </div>
          )}
        </div>

        {/* Category Breakdown Pie Chart */}
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-4">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Device Categories</span>
            </div>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RPieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                  />
                </RPieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-1.5 mt-4 pt-4 border-t border-slate-800">
            {pieData.map((item, idx) => (
              <div key={item.name} className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-slate-800/40 transition">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <span className="truncate text-slate-300 font-medium text-[11px]" title={item.name}>{item.name}</span>
                </div>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 shrink-0 ml-2">
                  {item.value} units
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Depreciation Forecast Chart */}
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Device Valuation Lifecycle Forecast</span>
            <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">Datalink Live</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={areaData}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="year" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                  formatter={(value: any) => [`$${Math.round(value).toLocaleString()}`, 'Book Value']}
                />
                <Area type="monotone" dataKey="bookValue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Branch Valuation Distribution */}
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-white uppercase tracking-wider">Valuation by Branch Location</span>
            <span className="text-[10px] text-slate-400">Top Branches</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="branch" stroke="#64748b" fontSize={10} interval={0} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                  formatter={(value: any) => [`$${value.toLocaleString()}`, 'Total Value']}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
