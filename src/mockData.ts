import {
  Organization,
  Branch,
  Department,
  User,
  AssetCategory,
  Asset,
  CheckoutRecord,
  MaintenanceRecord,
  BudgetAllocation,
  AuditLogItem,
  SystemNotification
} from './types';

// ============================================================================
// PRODUCTION ENTERPRISE ORGANIZATION
// ============================================================================
export const ORGANIZATIONS: Organization[] = [
  {
    id: 'org-mineazy',
    name: 'Mineazy Mining Solutions',
    type: 'Mining & Enterprise',
    logo: '⛏️',
    brandingColor: '#0f766e', // Teal 700
    branchesCount: 1
  },
  {
    id: 'org-omnitech',
    name: 'OmniTech Enterprise Systems',
    type: 'Enterprise',
    logo: '🌐',
    brandingColor: '#0ea5e9', // Sky/Cyan 500
    branchesCount: 1
  }
];

// ============================================================================
// PRODUCTION BRANCHES & HUBS
// ============================================================================
export const INITIAL_BRANCHES: Branch[] = [
  {
    id: 'branch-mineazy-hq',
    orgId: 'org-mineazy',
    name: 'Mineazy Operations HQ',
    code: 'MZ-HQ-01',
    location: 'Mineral Innovation Park, Wing A',
    city: 'Harare',
    country: 'Zimbabwe',
    managerName: 'Mineazy Admin'
  },
  {
    id: 'branch-main',
    orgId: 'org-omnitech',
    name: 'Global Headquarters',
    code: 'HQ-MAIN',
    location: 'Corporate HQ Tower, Floor 45',
    city: 'New York',
    country: 'United States',
    managerName: 'Ismael (Super Admin)'
  }
];

export const MINEAZY_BRANCHES: Branch[] = [];
export const EBS_BRANCHES: Branch[] = [];

// ============================================================================
// PRODUCTION DEPARTMENTS
// ============================================================================
export const DEPARTMENTS: Department[] = [
  { id: 'dept-it-mineazy', orgId: 'org-mineazy', name: 'IT Infrastructure & Telemetry', headCount: 5, budgetAllocated: 150000 },
  { id: 'dept-it', orgId: 'org-omnitech', name: 'Information Technology & Cloud Ops', headCount: 1, budgetAllocated: 200000 },
  { id: 'dept-eng', orgId: 'org-omnitech', name: 'Software Engineering & AI', headCount: 0, budgetAllocated: 350000 },
  { id: 'dept-sec', orgId: 'org-omnitech', name: 'Cybersecurity & InfoSec', headCount: 1, budgetAllocated: 150000 },
  { id: 'dept-ops', orgId: 'org-omnitech', name: 'Corporate Operations & Facilities', headCount: 0, budgetAllocated: 100000 },
  { id: 'dept-fin', orgId: 'org-omnitech', name: 'Finance & Asset Compliance', headCount: 0, budgetAllocated: 80000 }
];

// ============================================================================
// PRODUCTION ACTIVE SUPER ADMIN & DEMO USERS
// ============================================================================
export const USERS: User[] = [
  {
    id: 'usr-admin-mineazy',
    orgId: 'org-mineazy',
    email: 'admin@mineazy.com',
    fullName: 'Mineazy Admin',
    role: 'ADMIN',
    departmentId: 'dept-it-mineazy',
    departmentName: 'IT Infrastructure & Telemetry',
    branchId: 'branch-mineazy-hq',
    branchName: 'Mineazy Operations HQ',
    twoFactorEnabled: false,
    password: 'Mineazy123!',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    status: 'ACTIVE'
  },
  {
    id: 'usr-super-admin-ishmael',
    orgId: 'org-omnitech',
    email: 'ishmaelt42@gmail.com',
    fullName: 'Ishmael (Super Admin)',
    role: 'ADMIN',
    departmentId: 'dept-sec',
    departmentName: 'Cybersecurity & InfoSec',
    branchId: 'branch-main',
    branchName: 'Global Headquarters',
    twoFactorEnabled: false,
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    status: 'ACTIVE'
  }
];

// ============================================================================
// STANDARD ASSET CATEGORIES TAXONOMY
// ============================================================================
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

// ============================================================================
// CLEAN PRODUCTION DATASETS (EMPTY SLATE READY FOR REAL FLEET INTAKE)
// ============================================================================
export const INITIAL_ASSETS: Asset[] = [];
export const INITIAL_CHECKOUTS: CheckoutRecord[] = [];
export const INITIAL_MAINTENANCE: MaintenanceRecord[] = [];
export const INITIAL_BUDGETS: BudgetAllocation[] = [];
export const INITIAL_AUDIT_LOGS: AuditLogItem[] = [];
export const INITIAL_NOTIFICATIONS: SystemNotification[] = [];
