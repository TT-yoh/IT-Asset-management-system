# Role-Based Access Control (RBAC) & Separation of Duties Matrix

OmniAsset enforces a strict, server-side multi-tenant authorization matrix.
All permissions are derived from the cryptographically verified session cookie (`req.auth`).
User roles, tenant IDs (`orgId`), and branch boundaries (`branchId`) supplied in request bodies or query parameters are strictly ignored.

---

## 1. Role Definitions

| Role | Scope | Description |
| :--- | :--- | :--- |
| **`ADMIN`** | Organization-wide | Full administrative control over all organization assets, branches, users, and audit records. |
| **`DIRECTOR`** | Organization-wide | Executive governance, financial depreciation rollups, high-level procurement, and audit inspection. |
| **`BRANCH_MANAGER`** | Branch-scoped | Operates exclusively within assigned `branch_id`. Can check out, inspect, and assign devices at their facility. |
| **`IT_SUPPORT`** | Organization-wide | Hardware diagnostics desk, repair ticketing, parts cataloging, and inventory check-ins. |
| **`FINANCE`** | Organization-wide | Budget allocations, capital expenditure auditing, and asset write-offs. |
| **`USER`** | Personal / Branch | Views only assigned custody assets and branch equipment catalog. Cannot approve checkouts or alter assets. |

---

## 2. Resource Permission Matrix

| Resource & Action | ADMIN | DIRECTOR | BRANCH_MANAGER | IT_SUPPORT | FINANCE | USER |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Read Assets** | All Org | All Org | Own Branch Only | All Org | All Org | Own Branch Only |
| **Create / Register Asset** | ✅ | ❌ | Own Branch | ✅ | ❌ | ❌ |
| **Update Asset Details** | ✅ | ❌ | Own Branch | ✅ | ❌ | ❌ |
| **Delete / Dispose Asset** | ✅ | ❌ | ❌ | ❌ | ✅ (Write-Off) | ❌ |
| **Initiate Checkout** | ✅ | ❌ | Own Branch | ✅ | ❌ | Self Only |
| **Check-in Asset** | ✅ | ❌ | Own Branch | ✅ | ❌ | ❌ |
| **Create Repair Ticket** | ✅ | ❌ | Own Branch | ✅ | ❌ | Request Only |
| **Complete Repair** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Invite & Onboard Staff** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Modify User Roles & Facilities** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Suspend / Reactivate Staff** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Delete / Remove User Accounts** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Audit Logs** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |

---

## 3. Separation of Duties (SoD) Constraints

1. **Checkout vs. Damage Write-Off**:
   - The user who has custody of an asset (`checked_out_to_user_id === req.auth.userId`) **CANNOT** approve or certify a damage write-off or loss waiver on that asset.
   - An independent supervisor (`ADMIN`, `BRANCH_MANAGER`, or `IT_SUPPORT` other than the holder) must inspect and certify the return condition.
2. **Role Escalation Immunity**:
   - No user (including administrators) can change their own role via `PUT /api/users/:id` or inject `role: 'ADMIN'` via request payloads.
3. **Branch Boundary Enforcement**:
   - `BRANCH_MANAGER` and `USER` queries and mutations are hard-filtered by `branch_id = req.auth.branchId`. Attempts to specify another `branch_id` in path or body are rejected with `403 Forbidden`.
