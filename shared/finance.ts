/**
 * Shared Finance & Asset Depreciation Module
 *
 * Implements standard Straight-Line Depreciation:
 * - Month-based asset aging
 * - Depreciable Base = Cost - Salvage Value (default 10% salvage value factor)
 * - Monthly Depreciation = Depreciable Base / Useful Life in Months (default 36 or 60 months)
 * - Accumulated Depreciation = Min(Depreciable Base, Monthly Depreciation * Age in Months)
 * - Current Book Value = Max(Salvage Value, Cost - Accumulated Depreciation)
 * - Disposed / Sold / Deprecated assets excluded from active valuation by default
 */

export type AssetCondition = 'NEW' | 'GOOD' | 'FAIR' | 'POOR';

export const VALID_CONDITIONS: readonly AssetCondition[] = ['NEW', 'GOOD', 'FAIR', 'POOR'];

export function normalizeCondition(cond?: string | null): AssetCondition {
  if (!cond) return 'GOOD';
  const c = String(cond).toUpperCase().trim();
  if (['NEW', 'EXCELLENT', 'LIKE NEW', 'BRAND NEW', 'MINT'].includes(c)) return 'NEW';
  if (['GOOD', 'VERY GOOD', 'FINE'].includes(c)) return 'GOOD';
  if (['FAIR', 'ACCEPTABLE', 'DEGRADED'].includes(c)) return 'FAIR';
  if (['POOR', 'DAMAGED', 'BROKEN', 'DEFECTIVE'].includes(c)) return 'POOR';
  return 'GOOD';
}

export interface DepreciationOptions {
  usefulLifeMonths?: number; // default: 36
  salvageFactor?: number;    // default: 0.10 (10%)
  asOfDate?: Date;           // default: current date
}

export interface DepreciationResult {
  cost: number;
  salvageValue: number;
  depreciableBase: number;
  ageMonths: number;
  usefulLifeMonths: number;
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  depreciatedPercentage: number;
}

/**
 * Calculates the age of an asset in completed calendar months from purchase date.
 */
export function calculateAgeMonths(purchaseDate: string | Date | null | undefined, asOfDate: Date = new Date()): number {
  if (!purchaseDate) return 0;
  const p = new Date(purchaseDate);
  if (isNaN(p.getTime())) return 0;

  const yearDiff = asOfDate.getFullYear() - p.getFullYear();
  const monthDiff = asOfDate.getMonth() - p.getMonth();
  let totalMonths = yearDiff * 12 + monthDiff;

  if (asOfDate.getDate() < p.getDate()) {
    totalMonths -= 1;
  }

  return Math.max(0, totalMonths);
}

/**
 * Computes straight-line depreciation for an individual cost and purchase date.
 */
export function calculateStraightLineDepreciation(
  purchaseCost: number,
  purchaseDate: string | Date | null | undefined,
  options: DepreciationOptions = {}
): DepreciationResult {
  const cost = Math.max(0, Number(purchaseCost) || 0);
  const usefulLifeMonths = Math.max(1, options.usefulLifeMonths ?? 36);
  const salvageFactor = Math.min(1, Math.max(0, options.salvageFactor ?? 0.10));
  const asOfDate = options.asOfDate ?? new Date();

  const salvageValue = Math.round(cost * salvageFactor * 100) / 100;
  const depreciableBase = Math.max(0, Math.round((cost - salvageValue) * 100) / 100);

  const ageMonths = calculateAgeMonths(purchaseDate, asOfDate);
  const monthlyDepreciation = depreciableBase / usefulLifeMonths;

  const accumulatedDepreciation = Math.min(
    depreciableBase,
    Math.round(monthlyDepreciation * ageMonths * 100) / 100
  );

  const bookValue = Math.max(
    salvageValue,
    Math.round((cost - accumulatedDepreciation) * 100) / 100
  );

  const depreciatedPercentage = depreciableBase > 0
    ? Math.min(100, Math.round((accumulatedDepreciation / depreciableBase) * 100))
    : 100;

  return {
    cost,
    salvageValue,
    depreciableBase,
    ageMonths,
    usefulLifeMonths,
    monthlyDepreciation: Math.round(monthlyDepreciation * 100) / 100,
    accumulatedDepreciation,
    bookValue,
    depreciatedPercentage
  };
}

export interface FleetValuationSummary {
  totalAssetsCount: number;
  activeAssetsCount: number;
  disposedAssetsCount: number;
  totalPurchaseCost: number;
  totalBookValue: number;
  totalAccumulatedDepreciation: number;
  averageAgeMonths: number;
}

/**
 * Aggregates valuation across a list of assets.
 * By default excludes DISPOSED, SOLD, and DEPRECATED assets from active valuation (Addendum 3 D4).
 */
export function calculateFleetValuation(
  assets: Array<{
    purchaseCost?: number;
    purchaseDate?: string | Date;
    status?: string;
  }>,
  options: DepreciationOptions & { includeDisposed?: boolean } = {}
): FleetValuationSummary {
  const includeDisposed = options.includeDisposed ?? false;

  let activeCount = 0;
  let disposedCount = 0;
  let totalPurchaseCost = 0;
  let totalBookValue = 0;
  let totalAccumulatedDepreciation = 0;
  let totalAgeMonths = 0;

  for (const asset of assets) {
    const status = String(asset.status || 'ACTIVE').toUpperCase();
    const isInactive = ['DISPOSED', 'SOLD', 'DEPRECATED'].includes(status);

    if (isInactive) {
      disposedCount++;
      if (!includeDisposed) continue;
    } else {
      activeCount++;
    }

    const cost = Math.max(0, Number(asset.purchaseCost) || 0);
    const dep = calculateStraightLineDepreciation(cost, asset.purchaseDate, options);

    totalPurchaseCost += dep.cost;
    totalBookValue += dep.bookValue;
    totalAccumulatedDepreciation += dep.accumulatedDepreciation;
    totalAgeMonths += dep.ageMonths;
  }

  const countedAssets = includeDisposed ? assets.length : activeCount;
  const averageAgeMonths = countedAssets > 0 ? Math.round((totalAgeMonths / countedAssets) * 10) / 10 : 0;

  return {
    totalAssetsCount: assets.length,
    activeAssetsCount: activeCount,
    disposedAssetsCount: disposedCount,
    totalPurchaseCost: Math.round(totalPurchaseCost * 100) / 100,
    totalBookValue: Math.round(totalBookValue * 100) / 100,
    totalAccumulatedDepreciation: Math.round(totalAccumulatedDepreciation * 100) / 100,
    averageAgeMonths
  };
}

