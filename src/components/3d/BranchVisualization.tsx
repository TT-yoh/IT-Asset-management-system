import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Asset, Branch } from '../../types';
import { createAssetShape, createTextSprite } from '../../lib/three-utils';
import { Building2, Laptop, Monitor, Smartphone, Printer, ShieldCheck } from 'lucide-react';

interface BranchVisualizationProps {
  branch: Branch;
  assets: Asset[];
  sceneGroup: THREE.Group;
  onSelectAsset: (asset: Asset) => void;
}

export const BranchVisualization: React.FC<BranchVisualizationProps> = ({
  branch,
  assets,
  sceneGroup,
  onSelectAsset
}) => {
  const branchAssets = assets.filter(a => a.branchId === branch.id);

  // Populate 3D Floor Plan & Devices inside Three.js Group
  useEffect(() => {
    // Clear previous view
    while (sceneGroup.children.length > 0) {
      sceneGroup.remove(sceneGroup.children[0]!);
    }

    // 1. Floor Tile
    const floorGeo = new THREE.BoxGeometry(22, 0.4, 22);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -0.2, 0);
    floor.receiveShadow = true;
    sceneGroup.add(floor);

    // Grid helper on floor
    const grid = new THREE.GridHelper(22, 11, 0x334155, 0x1e293b);
    grid.position.set(0, 0.01, 0);
    sceneGroup.add(grid);

    // Title Sprite
    const titleSprite = createTextSprite(branch.name, `${branchAssets.length} Enrolled Devices`);
    titleSprite.position.set(0, 8, -10);
    sceneGroup.add(titleSprite);

    // 2. Place Assets in grid layout on floor
    const cols = 5;
    const spacing = 3.5;
    const startX = -((cols - 1) * spacing) / 2;
    const startZ = -7;

    branchAssets.forEach((ast, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;

      const posX = startX + col * spacing;
      const posZ = startZ + row * spacing;

      // Create shape
      const assetMesh = createAssetShape(ast.category, ast.status);
      assetMesh.position.set(posX, 1.2, posZ);
      assetMesh.castShadow = true;
      assetMesh.userData = { id: ast.id, title: ast.name, code: ast.assetCode, category: ast.category, status: ast.status, asset: ast };
      sceneGroup.add(assetMesh);

      // Pedestal
      const pedGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.3, 16);
      const pedMat = new THREE.MeshStandardMaterial({
        color: ast.status === 'REPAIR' ? 0x881337 : 0x0f172a,
        roughness: 0.5
      });
      const ped = new THREE.Mesh(pedGeo, pedMat);
      ped.position.set(posX, 0.15, posZ);
      sceneGroup.add(ped);

      // Label sprite above item
      const lbl = createTextSprite(ast.assetCode, ast.category, ast.status === 'REPAIR' ? '#881337' : '#0f172a');
      lbl.scale.set(2, 1, 1);
      lbl.position.set(posX, 3.0, posZ);
      sceneGroup.add(lbl);
    });

  }, [branch, branchAssets, sceneGroup]);

  return (
    <div className="absolute top-4 left-4 z-10 bg-slate-900/90 border border-slate-800 p-4 rounded-2xl text-xs backdrop-blur-md shadow-2xl max-w-sm space-y-3">
      <div className="flex items-center gap-2 text-emerald-400 border-b border-slate-800 pb-2">
        <Building2 className="w-4 h-4" />
        <h4 className="font-bold text-white text-sm">3D Floor Plan: {branch.name}</h4>
      </div>
      <p className="text-slate-400 text-[11px]">
        Inspecting interactive spatial device arrangement. Click any 3D node mesh or label to inspect telemetry specs.
      </p>

      <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
        <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
          <span className="text-slate-500 block text-[9px]">ACTIVE NODES</span>
          <span className="text-emerald-400 font-bold text-sm">{branchAssets.filter(a => a.status === 'ACTIVE').length}</span>
        </div>
        <div className="bg-slate-950 p-2 rounded-xl border border-slate-800/80">
          <span className="text-slate-500 block text-[9px]">BENCH REPAIR</span>
          <span className="text-rose-400 font-bold text-sm">{branchAssets.filter(a => a.status === 'REPAIR').length}</span>
        </div>
      </div>
    </div>
  );
};
