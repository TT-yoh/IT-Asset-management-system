# OmniAsset Financial & Depreciation Specification

## 1. Depreciation Methodology
OmniAsset uses standard **Straight-Line Depreciation** evaluated on a **calendar month basis**:

### Formula
1. **Salvage Value** (\(SV\)):
   \[
   SV = \text{Purchase Cost} \times \text{Salvage Factor (default: 0.10, i.e., 10\%)}
   \]
2. **Depreciable Base** (\(DB\)):
   \[
   DB = \max(0, \text{Purchase Cost} - SV)
   \]
3. **Asset Age in Months** (\(M\)):
   Calculated as the number of elapsed full calendar months between the purchase date and current date (or specified `asOfDate`).
4. **Monthly Depreciation** (\(MD\)):
   \[
   MD = \frac{DB}{\text{Useful Life in Months (default: 36)}}
   \]
5. **Accumulated Depreciation** (\(AD\)):
   \[
   AD = \min(DB, MD \times M)
   \]
6. **Current Book Value** (\(BV\)):
   \[
   BV = \max(SV, \text{Purchase Cost} - AD)
   \]

## 2. Inactive Asset Exclusions
In accordance with corporate financial governance rules:
- Assets with status `DISPOSED`, `SOLD`, or `DEPRECATED` are **excluded** from active fleet valuation and balance sheet aggregations by default.
- Their accumulated depreciation is frozen, and they do not contribute to ongoing active operational asset totals.

## 3. Condition Standard
Asset conditions are standardized to 4 canonical enterprise states:
- `NEW`: Unopened, in original factory box, or freshly commissioned.
- `GOOD`: Minor signs of regular operational use; fully functional.
- `FAIR`: Noticeable cosmetic wear or degraded battery/performance; requires monitoring.
- `POOR`: Damaged, defective, or failing hardware; scheduled for repair or retirement.

(Note: Legacy non-standard values like `EXCELLENT` or `MINT` map deterministically to `NEW`).

