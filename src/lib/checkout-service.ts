import { Asset, User, CheckoutRecord, MaintenanceRecord, AssetCondition } from '../types';

export interface CheckoutInput {
  asset: Asset;
  user: User | { id: string; fullName: string; email?: string; avatar?: string; role?: string };
  reason: string;
  expectedReturnDate: string;
  notes?: string;
  adminUser?: User;
  targetBranchId?: string;
  targetBranchName?: string;
}

export interface CheckinInput {
  checkoutRecord: CheckoutRecord;
  asset: Asset;
  condition: AssetCondition;
  damageReported: boolean;
  damageDescription?: string;
  notes?: string;
  adminUser?: User;
}

export interface CheckinResult {
  updatedCheckout: CheckoutRecord;
  updatedAsset: Asset;
  autoMaintenanceRecord?: MaintenanceRecord;
}

/**
 * File 10: src/lib/checkout-service.ts
 * Phase 4 Service Layer handling hardware checkout/checkin transactions, custody assignment, and damage reporting.
 */
export class CheckoutService {
  /**
   * Register a new asset checkout transaction
   */
  static checkoutAsset(input: CheckoutInput): { checkout: CheckoutRecord; updatedAsset: Asset } {
    const now = new Date().toISOString().split('T')[0]!;
    
    const newRecord: CheckoutRecord = {
      id: `chk-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      assetId: input.asset.id,
      assetCode: input.asset.assetCode,
      assetName: input.asset.name,
      checkedOutBy: input.adminUser?.fullName || input.user.fullName,
      checkedOutToUserId: input.user.id,
      checkedOutToUserName: input.user.fullName,
      checkedOutAt: now,
      expectedReturnDate: input.expectedReturnDate,
      reason: input.reason || 'Daily production use',
      status: 'ACTIVE',
      notes: input.notes
    };

    const updatedAsset: Asset = {
      ...input.asset,
      assignedToUserId: input.user.id,
      assignedToUserName: input.user.fullName,
      assignedToUserAvatar: input.user.avatar || undefined,
      assignedAt: now,
      status: 'ACTIVE',
      ...(input.targetBranchId && input.targetBranchName ? {
        branchId: input.targetBranchId,
        branchName: input.targetBranchName
      } : {})
    };

    return { checkout: newRecord, updatedAsset };
  }

  /**
   * Process asset return check-in. If damage reported, auto-dispatch a maintenance ticket.
   */
  static checkinAsset(input: CheckinInput): CheckinResult {
    const now = new Date().toISOString().split('T')[0]!;

    const updatedCheckout: CheckoutRecord = {
      ...input.checkoutRecord,
      checkedInAt: now,
      returnCondition: input.condition,
      damageReported: input.damageReported,
      damageDescription: input.damageDescription,
      status: 'RETURNED',
      notes: input.notes ? `${input.checkoutRecord.notes || ''} | Return note: ${input.notes}` : input.checkoutRecord.notes
    };

    let newStatus: Asset['status'] = 'ACTIVE';
    let autoMaintenanceRecord: MaintenanceRecord | undefined = undefined;

    if (input.damageReported) {
      newStatus = 'DAMAGED';
      autoMaintenanceRecord = {
        id: `maint-auto-${Date.now()}`,
        assetId: input.asset.id,
        assetCode: input.asset.assetCode,
        assetName: input.asset.name,
        type: 'REPAIR',
        status: 'PENDING',
        description: `[AUTO-TRIGGERED ON RETURN] Damage reported: ${input.damageDescription || 'Physical inspection required'}`,
        reportedBy: input.adminUser?.fullName || input.checkoutRecord.checkedOutToUserName,
        assignedTechnician: 'IT Repair Pool',
        startDate: now,
        expectedCompletion: now,
        cost: 0,
        notes: `Checked in condition: ${input.condition}. Custody returned from ${input.checkoutRecord.checkedOutToUserName}.`
      };
    } else if (input.condition === 'POOR' || input.condition === 'FAIR') {
      newStatus = 'REPAIR';
    }

    const updatedAsset: Asset = {
      ...input.asset,
      condition: input.condition,
      status: newStatus,
      // Clear active custody upon return
      assignedToUserId: undefined,
      assignedToUserName: undefined,
      assignedToUserAvatar: undefined,
      assignedAt: undefined
    };

    return { updatedCheckout, updatedAsset, autoMaintenanceRecord };
  }

  /**
   * Assign asset to employee custody directly (Admin action)
   */
  static assignAsset(asset: Asset, user: User, adminName: string): Asset {
    const now = new Date().toISOString().split('T')[0]!;
    return {
      ...asset,
      assignedToUserId: user.id,
      assignedToUserName: user.fullName,
      assignedToUserAvatar: user.avatar,
      assignedAt: now,
      notes: `${asset.notes || ''} | Assigned to ${user.fullName} by ${adminName} on ${now}.`
    };
  }

  /**
   * Unassign asset custody directly (Admin action)
   */
  static unassignAsset(asset: Asset, reason: string, adminName: string): Asset {
    const now = new Date().toISOString().split('T')[0]!;
    return {
      ...asset,
      assignedToUserId: undefined,
      assignedToUserName: undefined,
      assignedToUserAvatar: undefined,
      assignedAt: undefined,
      notes: `${asset.notes || ''} | Custody revoked by ${adminName} on ${now}. Reason: ${reason || 'Standard rotation'}.`
    };
  }

  /**
   * Retrieve full checkout ledger for a specific asset
   */
  static getCheckoutHistory(pool: CheckoutRecord[], assetId: string): CheckoutRecord[] {
    return pool.filter(c => c.assetId === assetId).sort((a, b) => b.checkedOutAt.localeCompare(a.checkedOutAt));
  }

  /**
   * Retrieve active checkouts for a specific user
   */
  static getUserCheckouts(pool: CheckoutRecord[], userId: string): CheckoutRecord[] {
    return pool.filter(c => c.checkedOutToUserId === userId && c.status === 'ACTIVE');
  }

  /**
   * Retrieve overdue checkouts across the organization
   */
  static getOverdueCheckouts(pool: CheckoutRecord[]): CheckoutRecord[] {
    const today = new Date().toISOString().split('T')[0]!;
    return pool.filter(c => c.status === 'ACTIVE' && c.expectedReturnDate && c.expectedReturnDate < today);
  }
}
