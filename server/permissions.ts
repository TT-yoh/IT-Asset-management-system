/**
 * Role-Based Access Control (RBAC) & Separation of Duties (SoD) Rules
 */

export type UserRole = 'ADMIN' | 'DIRECTOR' | 'BRANCH_MANAGER' | 'IT_SUPPORT' | 'FINANCE' | 'USER';

export interface AuthContextPayload {
  userId: string;
  orgId: string;
  email: string;
  fullName: string;
  role: UserRole;
  branchId: string;
  branchName: string;
}

export type PermissionAction =
  | 'assets:read'
  | 'assets:create'
  | 'assets:update'
  | 'assets:delete'
  | 'checkouts:read'
  | 'checkouts:create'
  | 'checkouts:return'
  | 'checkouts:writeoff'
  | 'maintenance:read'
  | 'maintenance:create'
  | 'maintenance:update'
  | 'budgets:read'
  | 'budgets:manage'
  | 'users:read'
  | 'users:invite'
  | 'users:update'
  | 'users:delete'
  | 'branches:read'
  | 'branches:manage'
  | 'departments:read'
  | 'departments:manage'
  | 'audit:read';

export const ROLE_PERMISSIONS: Record<UserRole, readonly PermissionAction[]> = {
  ADMIN: [
    'assets:read',
    'assets:create',
    'assets:update',
    'assets:delete',
    'checkouts:read',
    'checkouts:create',
    'checkouts:return',
    'checkouts:writeoff',
    'maintenance:read',
    'maintenance:create',
    'maintenance:update',
    'budgets:read',
    'budgets:manage',
    'users:read',
    'users:invite',
    'users:update',
    'users:delete',
    'branches:read',
    'branches:manage',
    'departments:read',
    'departments:manage',
    'audit:read'
  ],
  DIRECTOR: [
    'assets:read',
    'checkouts:read',
    'maintenance:read',
    'budgets:read',
    'users:read',
    'branches:read',
    'departments:read',
    'audit:read'
  ],
  BRANCH_MANAGER: [
    'assets:read',
    'assets:create',
    'assets:update',
    'checkouts:read',
    'checkouts:create',
    'checkouts:return',
    'maintenance:read',
    'maintenance:create',
    'users:read',
    'branches:read',
    'departments:read',
    'departments:manage'
  ],
  IT_SUPPORT: [
    'assets:read',
    'assets:create',
    'assets:update',
    'assets:delete',
    'checkouts:read',
    'checkouts:create',
    'checkouts:return',
    'checkouts:writeoff',
    'maintenance:read',
    'maintenance:create',
    'maintenance:update',
    'users:read',
    'branches:read',
    'departments:read',
    'departments:manage',
    'audit:read'
  ],
  FINANCE: [
    'assets:read',
    'assets:delete', // Write-off asset
    'checkouts:read',
    'maintenance:read',
    'budgets:read',
    'budgets:manage',
    'users:read',
    'branches:read',
    'departments:read',
    'audit:read'
  ],
  USER: [
    'assets:read', // Branch equipment catalog only
    'checkouts:read',
    'checkouts:create', // Self checkout requests
    'maintenance:read',
    'maintenance:create', // Report hardware issue
    'branches:read',
    'departments:read'
  ]
} as const;

export function hasPermission(role: UserRole, action: PermissionAction): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? permissions.includes(action) : false;
}

/**
 * Enforces separation of duties:
 * The person holding custody of an asset cannot approve/certify a damage write-off or loss waiver.
 */
export function canApproveWriteOff(actorId: string, custodyUserId: string, role: UserRole): boolean {
  if (actorId === custodyUserId) {
    // Separation of duties violation: custody holder cannot self-certify write-off
    return false;
  }
  return role === 'ADMIN' || role === 'IT_SUPPORT' || role === 'FINANCE';
}
