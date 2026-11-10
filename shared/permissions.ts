/**
 * Role-Based Access Control (RBAC) & Separation of Duties (SoD) Rules
 * Authoritative shared permissions matrix between backend and frontend.
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
  isSuperAdmin: boolean;
}

export type PermissionAction =
  | 'assets:read'
  | 'assets:create'
  | 'assets:update'
  | 'assets:delete'
  | 'assets:writeoff'
  | 'assets:valuation'
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
    'assets:writeoff',
    'assets:valuation',
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
    'departments:read'
  ],
  IT_SUPPORT: [
    'assets:read',
    'assets:create',
    'assets:update',
    'assets:writeoff',
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
    'audit:read'
  ],
  FINANCE: [
    'assets:read',
    'assets:writeoff',
    'assets:valuation',
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

export function hasPermission(role: UserRole | string | undefined | null, action: PermissionAction): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role as UserRole];
  return permissions ? (permissions as readonly string[]).includes(action) : false;
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 100,
  DIRECTOR: 80,
  FINANCE: 60,
  BRANCH_MANAGER: 50,
  IT_SUPPORT: 40,
  USER: 10
};

/**
 * Validates role assignment to prevent privilege escalation:
 * - Only administrators can grant the ADMIN role.
 * - Callers can never assign a role ranked higher than their own.
 * - Nobody can grant SUPER_ADMIN (super admin is a DB flag, not a UserRole).
 */
export function canAssignRole(callerRole: UserRole, targetRole: UserRole): boolean {
  if (callerRole !== 'ADMIN') {
    return false;
  }
  return ['ADMIN', 'DIRECTOR', 'BRANCH_MANAGER', 'IT_SUPPORT', 'FINANCE', 'USER'].includes(targetRole);
}

/**
 * Enforces separation of duties (SoD) for asset write-offs:
 * - The person holding custody cannot approve/certify a write-off.
 * - The asset creator cannot approve/certify a write-off (prevents ghost asset creation & write-off).
 * - The requester cannot approve/certify a write-off.
 * - For unassigned assets, creator still cannot approve.
 * - Requires ADMIN, IT_SUPPORT, or FINANCE role.
 */
export function canApproveWriteOff(
  actorId: string | null | undefined,
  custodyUserId?: string | null | undefined,
  role?: UserRole,
  creatorId?: string | null | undefined,
  requesterId?: string | null | undefined
): boolean {
  if (!actorId || !role) {
    return false;
  }

  // Must hold writeoff authority
  if (role !== 'ADMIN' && role !== 'IT_SUPPORT' && role !== 'FINANCE') {
    return false;
  }

  // Custody holder cannot self-certify write-off
  if (custodyUserId && actorId === custodyUserId) {
    return false;
  }

  // Asset creator cannot approve write-off
  if (creatorId && actorId === creatorId) {
    return false;
  }

  // Requester cannot approve write-off
  if (requesterId && actorId === requesterId) {
    return false;
  }

  return true;
}

/**
 * Enforces separation of duties for damaged returns:
 * - Custody holder cannot self-certify damaged return.
 * - Allowed for ADMIN, IT_SUPPORT, and FINANCE org-wide.
 * - Allowed for BRANCH_MANAGER for assets within their assigned branch.
 */
export function canCertifyDamagedReturn(
  actorId: string | null | undefined,
  custodyUserId: string | null | undefined,
  role: UserRole,
  actorBranchId?: string | null | undefined,
  assetBranchId?: string | null | undefined
): boolean {
  if (!actorId || !role) {
    return false;
  }

  // Custody holder cannot self-certify damaged return
  if (custodyUserId && actorId === custodyUserId) {
    return false;
  }

  if (role === 'ADMIN' || role === 'IT_SUPPORT' || role === 'FINANCE') {
    return true;
  }

  if (role === 'BRANCH_MANAGER') {
    // Only within their own branch facility
    if (actorBranchId && assetBranchId && actorBranchId === assetBranchId) {
      return true;
    }
  }

  return false;
}
