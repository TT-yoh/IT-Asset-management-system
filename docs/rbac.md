# Role-Based Access Control (RBAC) & Separation of Duties (SoD) Specification

OmniAsset enforces strict, cryptographically backed multi-tenant authorization.
All permissions, roles, and branch boundaries are derived strictly from the signed session (`req.auth`).
User roles, tenant IDs (`orgId`), or branch IDs (`branchId`) supplied in request headers, query parameters, or bodies are strictly ignored.

---

## 1. Roles & Organizational Scopes

| Role | Scope | Description |
| :--- | :--- | :--- |
| **`ADMIN`** | Organization-wide | Full administrative control over all organization assets, branches, departments, budgets, users, and audit records. Only role authorized to hard-purge assets and manage user accounts. |
| **`DIRECTOR`** | Organization-wide | Executive governance, financial and depreciation auditing, high-level procurement, and audit inspection. Read-only across organizational inventory and logs. |
| **`BRANCH_MANAGER`** | Branch-scoped | Scoped strictly to assigned `branch_id`. Can register, update, check out, and inspect assets at their local facility. Can certify non-custody damaged returns for their branch. |
| **`IT_SUPPORT`** | Organization-wide | Hardware diagnostics, intake triage, repair ticketing, parts replacement, and inventory check-ins. Can initiate write-offs subject to Separation of Duties. |
| **`FINANCE`** | Organization-wide | Budget allocations, capital expenditure governance, asset financial valuations, and damage write-offs. |
| **`USER`** | Personal / Branch | Views assigned custody equipment and branch catalog. Can request self-checkouts and report hardware issues as pending maintenance. |

---

## 2. Definitive Permissions Matrix

| Permission Action | ADMIN | DIRECTOR | BRANCH_MANAGER | IT_SUPPORT | FINANCE | USER | Description |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **`assets:read`** | ✅ | ✅ | Own Branch | ✅ | ✅ | Own Branch | View hardware inventory and asset specifications. |
| **`assets:create`** | ✅ | ❌ | Own Branch | ✅ | ❌ | ❌ | Register new hardware into inventory. |
| **`assets:update`** | ✅ | ❌ | Own Branch | ✅ | ❌ | ❌ | Modify asset metadata, model, condition, and notes. |
| **`assets:delete`** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Hard purge of unused assets with 0 linked checkouts/repairs. |
| **`assets:writeoff`** | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | Retire, dispose, or write off equipment (subject to SoD). |
| **`assets:valuation`** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | Edit asset purchase cost and real-time current market value. |
| **`assets:export`** | ✅ | ✅ | Own Branch | ✅ | ✅ | ❌ | Export asset datasets with role-specific valuation masking. |
| **`reports:read`** | ✅ | ✅ | Own Branch | ❌ | ✅ | ❌ | View executive analytics, fleet depreciation, and financial summaries. |
| **`checkouts:read`** | ✅ | ✅ | Own Branch | ✅ | ✅ | Assigned | View active and historical equipment checkouts. |
| **`checkouts:create`** | ✅ | ❌ | Own Branch | ✅ | ❌ | Self Only | Check out equipment to verified corporate personnel. |
| **`checkouts:return`** | ✅ | ❌ | Own Branch | ✅ | ❌ | ❌ | Process equipment check-ins and inspect hardware condition. |
| **`checkouts:writeoff`** | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | Waive lost equipment or certify total damage write-off. |
| **`maintenance:read`** | ✅ | ✅ | Own Branch | ✅ | ✅ | Reported | View work orders and maintenance records. |
| **`maintenance:create`** | ✅ | ❌ | Own Branch | ✅ | ❌ | Report Only | Log repair work orders (USER forced to PENDING / MEDIUM). |
| **`maintenance:update`** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | Update triage status, replace parts, and complete repair tickets. |
| **`budgets:read`** | ✅ | ✅ | Own Branch | ❌ | ✅ | ❌ | View department allocations and real-time spend. |
| **`budgets:manage`** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | Allocate and adjust departmental budget thresholds. |
| **`users:read`** | ✅ | ✅ | Own Branch | ✅ | ✅ | ❌ | View staff roster and contact information. |
| **`users:invite`** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Invite new staff members and issue onboarding tokens. |
| **`users:update`** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Modify staff roles, facilities, and profile information. |
| **`users:delete`** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Soft-delete staff accounts and revoke active sessions. |
| **`branches:read`** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | View organization branches and physical site locations. |
| **`branches:manage`** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Create, update, or remove physical branch facilities. |
| **`departments:read`** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | View organizational departments and operational units. |
| **`departments:manage`** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Manage organizational departmental structures. Only ADMIN holds authority. |
| **`audit:read`** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | Inspect tamper-evident SHA-256 cryptographic audit logs. |

---

## 3. Separation of Duties (SoD) Controls

### 3.1 Asset Write-Off & Disposal Approval (`canApproveWriteOff`)
- **Custody Defense**: The user currently holding custody of an asset (`actorId === custodyUserId`) **CANNOT** approve or certify a damage write-off or loss waiver.
- **Creator Defense**: The user who created the asset record (`actorId === creatorId`) **CANNOT** approve or certify a write-off. This eliminates the risk of rogue personnel creating ghost inventory and immediately writing it off.
- **Requester Defense**: The user who submitted the write-off or loss request (`actorId === requesterId`) cannot certify their own request.
- **Role Authority**: Only `ADMIN`, `IT_SUPPORT`, or `FINANCE` can certify write-offs. Unassigned assets still enforce the creator defense.

### 3.2 Damaged Return Certification (`canCertifyDamagedReturn`)
- When equipment is returned with `damageReported: true` or degraded condition (`POOR`), custody holders **CANNOT** self-certify the return condition.
- `ADMIN`, `IT_SUPPORT`, and `FINANCE` can certify damaged returns across the entire organization.
- `BRANCH_MANAGER` can certify damaged returns **ONLY** for assets located in their assigned branch facility (`actorBranchId === assetBranchId`), provided they are not the custody holder.
- Upon certifying a damaged return:
  1. The checkout status is permanently marked `DAMAGED_DURING_CHECKOUT`.
  2. The asset status is automatically transitioned to `REPAIR`.
  3. A maintenance intake ticket is automatically created in the database within the same transaction.

### 3.3 Role Escalation & Account Management Immunity (`canAssignRole`)
- No user can grant a role ranked higher than their own (`ADMIN > DIRECTOR > FINANCE > BRANCH_MANAGER > IT_SUPPORT > USER`).
- Only `ADMIN` can assign or update user roles.
- `SUPER_ADMIN` is an immutable database flag set via CLI bootstrap/grant scripts only; it cannot be granted through API endpoints.
- Demoting or deleting the last active `ADMIN` in an organization is strictly blocked (`LAST_ADMIN_PROTECTED`).
- Account deletion is strictly blocked if the target user holds active equipment checkouts (`USER_HAS_ACTIVE_CUSTODY`).

### 3.4 Multi-Tenant & Facility Scoping
- All mutations and reads scope strictly by `org_id = req.auth.orgId`.
- Branch-scoped roles (`BRANCH_MANAGER`, `USER`) fail closed (`[]` / `404`) if their account lacks a valid `branchId`.
- Primary keys supplied by clients in creation or mutation payloads are ignored; system UUIDs are generated server-side.

