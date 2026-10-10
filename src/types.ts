export type OrgType = 'Enterprise' | 'Technology' | 'Healthcare' | 'Finance' | 'Education' | 'Manufacturing' | 'Retail' | 'Mining' | 'General' | string;

export type UserRole = 'ADMIN' | 'DIRECTOR' | 'BRANCH_MANAGER' | 'IT_SUPPORT' | 'FINANCE' | 'USER';

export type AssetStatus = 'ACTIVE' | 'DAMAGED' | 'REPAIR' | 'DEPRECATED' | 'SOLD' | 'DISPOSED';

export type AssetCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR';

export type MaintenanceType = 'REPAIR' | 'PREVENTIVE' | 'INSPECTION' | 'UPGRADE';

export type MaintenanceStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type CheckoutStatus = 'ACTIVE' | 'RETURNED' | 'LOST' | 'DAMAGED_DURING_CHECKOUT';

export interface Organization {
  id: string;
  name: string;
  type: OrgType;
  logo: string;
  brandingColor: string;
  branchesCount: number;
}

export interface Branch {
  id: string;
  orgId: string;
  name: string;
  code: string;
  location: string;
  city: string;
  country: string;
  managerName: string;
}

export interface Department {
  id: string;
  orgId: string;
  name: string;
  headCount: number;
  budgetAllocated: number;
}

export interface User {
  id: string;
  orgId: string;
  email: string;
  fullName: string;
  role: UserRole;
  departmentId: string;
  departmentName: string;
  branchId: string;
  branchName: string;
  twoFactorEnabled: boolean;
  avatar: string;
  twoFactorSecret?: string;
  password?: string;
  status?: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
  inviteToken?: string;
  invitedAt?: string;
  version?: number;
}

export interface AssetCategory {
  id: string;
  name: string;
  icon: string;
  description: string;
  depreciationYears: number;
}

export interface Asset {
  id: string;
  orgId: string;
  branchId: string;
  branchName: string;
  categoryId: string;
  categoryName: string;
  category?: string;
  assetCode: string;
  name: string;
  model: string;
  serialNumber: string;
  macAddress?: string;
  phoneNumber?: string;
  registeredEmail?: string;
  imeiNumber?: string;
  status: AssetStatus;
  condition: AssetCondition;
  purchaseDate: string;
  purchaseCost: number;
  purchasePrice?: number;
  warrantyExpiry: string;
  currentValue: number;
  assignedToUserId?: string;
  assignedToUserName?: string;
  assignedToUserAvatar?: string;
  assignedAt?: string;
  imageUrl: string;
  notes?: string;
  version?: number;
}

export interface CheckoutRecord {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  checkedOutBy: string;
  checkedOutToUserId: string;
  checkedOutToUserName: string;
  checkedOutAt: string;
  expectedReturnDate?: string;
  checkedInAt?: string;
  returnCondition?: AssetCondition;
  damageReported?: boolean;
  damageDescription?: string;
  reason: string;
  status: CheckoutStatus;
  notes?: string;
  version?: number;
}

export interface MaintenanceRecord {
  id: string;
  assetId: string;
  assetCode: string;
  assetName: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  reportedBy: string;
  assignedTechnician: string;
  startDate: string;
  expectedCompletion: string;
  actualCompletion?: string;
  cost: number;
  partsReplaced?: string;
  notes?: string;
  version?: number;
  auditLogs?: Array<{
    id: string;
    timestamp: string;
    action: string;
    user: string;
    details: string;
  }>;
}

export interface BudgetAllocation {
  id: string;
  orgId: string;
  departmentName: string;
  branchName: string;
  fiscalYear: number;
  allocated: number;
  spent: number;
}

export interface AuditLogItem {
  id: string;
  orgId: string;
  seq?: number;
  actorId?: string;
  userName: string;
  userRole: UserRole;
  action: string;
  entityType: 'Asset' | 'User' | 'Maintenance' | 'Checkout' | 'Budget' | 'Organization';
  entityId?: string;
  entityName: string;
  changes: string;
  timestamp: string;
  prevHash?: string;
  hash?: string;
  ipAddress: string;
}

export interface SystemNotification {
  id: string;
  orgId: string;
  type: 'WARRANTY' | 'MAINTENANCE' | 'ALERT' | 'ASSIGNMENT';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface PendingRegistration {
  id: string;
  orgId: string;
  orgName: string;
  email: string;
  fullName: string;
  phone: string;
  departmentId: string;
  departmentName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expires: string;
  requires2FA: boolean;
  is2FAVerified: boolean;
}

export type Budget = BudgetAllocation;
