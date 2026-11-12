import { AssetCategory } from '../types';

/**
 * Standard asset taxonomy categories used across enterprise hardware management.
 */
export const CATEGORIES: AssetCategory[] = [
  { id: 'cat-lap', name: 'Laptops & Ultrabooks', icon: '💻', description: 'Enterprise laptops (MacBook Pro, ThinkPad, Dell XPS)', depreciationYears: 3 },
  { id: 'cat-desk', name: 'Desktops & Workstations', icon: '🖥️', description: 'CAD, engineering & creative workstations (Mac Studio, HP Z)', depreciationYears: 4 },
  { id: 'cat-servers', name: 'Enterprise Servers & Compute', icon: '🗄️', description: 'Rackmount compute nodes, SAN/NAS arrays & server blades', depreciationYears: 5 },
  { id: 'cat-phone', name: 'Smartphones & Mobile Fleet', icon: '📱', description: 'Corporate smartphones, tablets, iPads & cellular terminals', depreciationYears: 2 },
  { id: 'cat-net', name: 'Networking & Security Gear', icon: '🌐', description: 'Enterprise routers, L3 switches, firewalls & wireless APs', depreciationYears: 5 },
  { id: 'cat-mon', name: 'Monitors & AV Conferencing', icon: '📺', description: '4K/5K color-calibrated displays & boardroom telepresence bars', depreciationYears: 4 },
  { id: 'cat-print', name: 'Printers & Fleet Scanners', icon: '🖨️', description: 'Network laser printers, multifunction scanners & thermal taggers', depreciationYears: 4 },
  { id: 'cat-periph', name: 'Docks, Keyboards & Accessories', icon: '⌨️', description: 'Thunderbolt 4 docks, mechanical keyboards & precision gear', depreciationYears: 2 }
];

