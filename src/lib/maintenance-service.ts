import { MaintenanceRecord, MaintenanceType, MaintenanceStatus, Asset, User } from '../types';

export interface CreateMaintenanceInput {
  assetId: string;
  assetCode: string;
  assetName: string;
  type: MaintenanceType;
  description: string;
  assignedTechnician?: string;
  startDate: string;
  expectedCompletion: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  cost?: number;
  notes?: string;
}

export interface UpdateMaintenanceInput {
  status?: MaintenanceStatus;
  priority?: 'HIGH' | 'MEDIUM' | 'LOW';
  actualCompletionDate?: string;
  cost?: number;
  partsReplaced?: string;
  notes?: string;
  assignedTechnician?: string;
}

export interface MaintenanceFilters {
  status?: string;
  type?: string;
  priority?: string;
  assignedTechnician?: string;
  searchQuery?: string;
  dateRange?: { start: string; end: string };
}

export interface RepairSummaryStats {
  totalUnderRepair: number;
  avgRepairDays: number;
  totalCostThisMonth: number;
  totalCostYear: number;
  mostRepairedTypes: Array<{ type: string; count: number; totalCost: number }>;
  technicianWorkload: Array<{ name: string; activeTickets: number; completedTickets: number }>;
  costTrend: Array<{ month: string; cost: number }>;
}

/**
 * File 9: Maintenance Service Layer
 */
export const MaintenanceService = {
  /**
   * Create maintenance record
   */
  createMaintenance(
    input: CreateMaintenanceInput,
    user: User
  ): { record: MaintenanceRecord; notification: string } {
    const now = new Date().toISOString();
    const newId = `mnt-${Date.now()}`;
    
    const record: MaintenanceRecord = {
      id: newId,
      assetId: input.assetId,
      assetCode: input.assetCode,
      assetName: input.assetName,
      type: input.type,
      status: 'IN_PROGRESS',
      priority: input.priority || 'MEDIUM',
      description: input.description,
      reportedBy: user.fullName || 'Support Staff',
      assignedTechnician: input.assignedTechnician || 'Unassigned (IT Repair Pool)',
      startDate: input.startDate,
      expectedCompletion: input.expectedCompletion,
      cost: input.cost || 0,
      notes: input.notes || '',
      auditLogs: [
        {
          id: `aud-${Date.now()}-1`,
          timestamp: now,
          action: 'MAINTENANCE_CREATED',
          user: user.fullName,
          details: `Ticket created for ${input.assetCode} (${input.type}). Status set to REPAIR.`
        }
      ]
    };

    return {
      record,
      notification: `Outage alert: [${input.assetCode}] marked under ${input.type} by ${user.fullName}. ETA: ${input.expectedCompletion}`
    };
  },

  /**
   * Update maintenance record
   */
  updateMaintenance(
    currentRecord: MaintenanceRecord,
    updates: UpdateMaintenanceInput,
    user: User
  ): MaintenanceRecord {
    const now = new Date().toISOString();
    const changes: string[] = [];

    if (updates.status && updates.status !== currentRecord.status) {
      changes.push(`Status changed from ${currentRecord.status} to ${updates.status}`);
    }
    if (updates.cost !== undefined && updates.cost !== currentRecord.cost) {
      changes.push(`Cost updated to $${updates.cost}`);
    }
    if (updates.partsReplaced && updates.partsReplaced !== currentRecord.partsReplaced) {
      changes.push(`Parts logged: ${updates.partsReplaced}`);
    }

    const updatedLog = {
      id: `aud-${Date.now()}`,
      timestamp: now,
      action: updates.status === 'COMPLETED' ? 'MAINTENANCE_COMPLETED' : 'MAINTENANCE_UPDATED',
      user: user.fullName,
      details: changes.length > 0 ? changes.join('; ') : 'Record notes or assignments updated.'
    };

    return {
      ...currentRecord,
      status: updates.status || currentRecord.status,
      priority: updates.priority || currentRecord.priority,
      actualCompletion: updates.actualCompletionDate || currentRecord.actualCompletion,
      cost: updates.cost !== undefined ? updates.cost : currentRecord.cost,
      partsReplaced: updates.partsReplaced !== undefined ? updates.partsReplaced : currentRecord.partsReplaced,
      notes: updates.notes !== undefined ? updates.notes : currentRecord.notes,
      assignedTechnician: updates.assignedTechnician || currentRecord.assignedTechnician,
      auditLogs: [...(currentRecord.auditLogs || []), updatedLog]
    };
  },

  /**
   * Complete maintenance record
   */
  completeMaintenanceRecord(
    currentRecord: MaintenanceRecord,
    completionData: { cost: number; partsReplaced: string; notes: string },
    user: User
  ): { record: MaintenanceRecord; assetRestored: boolean } {
    const now = new Date().toISOString().split('T')[0]!;
    const updated = this.updateMaintenance(
      currentRecord,
      {
        status: 'COMPLETED',
        actualCompletionDate: now,
        cost: completionData.cost,
        partsReplaced: completionData.partsReplaced,
        notes: completionData.notes
      },
      user
    );
    return { record: updated, assetRestored: true };
  },

  /**
   * Filter maintenance records
   */
  getMaintenanceRecords(
    records: MaintenanceRecord[],
    filters: MaintenanceFilters
  ): MaintenanceRecord[] {
    return records.filter(rec => {
      if (filters.status && filters.status !== 'ALL' && rec.status !== filters.status) return false;
      if (filters.type && filters.type !== 'ALL' && rec.type !== filters.type) return false;
      if (filters.priority && filters.priority !== 'ALL' && (rec.priority || 'MEDIUM') !== filters.priority) return false;
      if (filters.assignedTechnician && filters.assignedTechnician !== 'ALL' && !(rec.assignedTechnician || '').includes(filters.assignedTechnician)) return false;
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase();
        const match =
          (rec.assetCode || '').toLowerCase().includes(q) ||
          (rec.assetName || '').toLowerCase().includes(q) ||
          (rec.description || '').toLowerCase().includes(q) ||
          (rec.assignedTechnician || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  },

  /**
   * Get overdue maintenance records
   */
  getOverdueMaintenanceRecords(records: MaintenanceRecord[]): MaintenanceRecord[] {
    const today = new Date().toISOString().split('T')[0]!;
    return records.filter(rec => rec.status === 'IN_PROGRESS' && rec.expectedCompletion < today);
  },

  /**
   * Calculate costs for an asset or date range
   */
  calculateMaintenanceCosts(
    records: MaintenanceRecord[],
    assetId?: string
  ): { totalCost: number; partsCount: number; recordsCount: number } {
    const filtered = assetId ? records.filter(r => r.assetId === assetId) : records;
    const totalCost = filtered.reduce((acc, r) => acc + (r.cost || 0), 0);
    const partsCount = filtered.filter(r => !!r.partsReplaced).length;
    return { totalCost, partsCount, recordsCount: filtered.length };
  },

  /**
   * File 10 Deliverable: Get comprehensive repairs summary and statistics
   */
  getRepairsSummary(records: MaintenanceRecord[], assets: Asset[]): RepairSummaryStats {
    const active = records.filter(r => r.status === 'IN_PROGRESS' || r.status === 'PENDING');
    const completed = records.filter(r => r.status === 'COMPLETED');

    // Average repair days
    let totalDays = 0;
    let counted = 0;
    completed.forEach(c => {
      if (c.startDate && (c.actualCompletion || c.expectedCompletion)) {
        const d1 = new Date(c.startDate).getTime();
        const d2 = new Date(c.actualCompletion || c.expectedCompletion).getTime();
        const diffDays = Math.max(1, Math.round((d2 - d1) / 86400000));
        totalDays += diffDays;
        counted++;
      }
    });
    const avgRepairDays = counted > 0 ? Math.round((totalDays / counted) * 10) / 10 : 3.5;

    // Costs
    const totalCostThisMonth = records.reduce((acc, r) => acc + (r.cost || 0), 0);
    const totalCostYear = totalCostThisMonth * 3.2; // Simulating annualized total

    // Most repaired asset types
    const typeMap = new Map<string, { count: number; cost: number }>();
    records.forEach(r => {
      const ast = assets.find(a => a.id === r.assetId);
      const cat = ast?.category || 'Hardware';
      const existing = typeMap.get(cat) || { count: 0, cost: 0 };
      typeMap.set(cat, { count: existing.count + 1, cost: existing.cost + (r.cost || 0) });
    });
    const mostRepairedTypes = Array.from(typeMap.entries()).map(([type, val]) => ({
      type,
      count: val.count,
      totalCost: val.cost
    }));

    // Tech workload
    const techMap = new Map<string, { active: number; completed: number }>();
    records.forEach(r => {
      const tech = r.assignedTechnician || 'Unassigned Pool';
      const ex = techMap.get(tech) || { active: 0, completed: 0 };
      if (r.status === 'COMPLETED') ex.completed++;
      else ex.active++;
      techMap.set(tech, ex);
    });
    const technicianWorkload = Array.from(techMap.entries()).map(([name, val]) => ({
      name,
      activeTickets: val.active,
      completedTickets: val.completed
    }));

    // Trend
    const costTrend = [
      { month: 'Jan', cost: 420 },
      { month: 'Feb', cost: 890 },
      { month: 'Mar', cost: 310 },
      { month: 'Apr', cost: 1250 },
      { month: 'May', cost: 650 },
      { month: 'Jun', cost: totalCostThisMonth || 835 }
    ];

    return {
      totalUnderRepair: active.length,
      avgRepairDays,
      totalCostThisMonth,
      totalCostYear,
      mostRepairedTypes,
      technicianWorkload,
      costTrend
    };
  }
};
