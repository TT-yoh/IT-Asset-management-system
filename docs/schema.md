# OmniAsset Relational Schema Specification

> **Authoritative Schema Documentation**  
> **Database Wire Protocol**: MySQL 8.0 / PingCAP TiDB Cloud  
> **Single Source of Truth**: Managed exclusively via versioned migrations in `migrations/NNN_*.sql` executed by `scripts/migrate.mjs`.

---

## 1. Architecture Overview

OmniAsset enforces a strict multi-tenant relational architecture with database-level isolation, cryptographic audit trails, optimistic concurrency locking, and generated column constraints.

### Core Tenets:
1. **Multi-Tenant Scoping**: All operational tables (`branches`, `departments`, `users`, `assets`, `checkouts`, `maintenances`, `budgets`, `audit_logs`, `idempotency_keys_v2`) include a non-nullable `org_id`.
2. **Custody & History Protection**: Deleting an asset never cascades into checkouts or maintenance logs (`ON DELETE RESTRICT`). Deleting an organization never cascades into audit ledgers (`ON DELETE RESTRICT`).
3. **Cryptographic Integrity**: The `audit_logs` table forms an immutable SHA-256 hash chain per organization, serialized via `audit_chain_heads`.
4. **Optimistic Locking**: State mutations verify atomic `version` increments to reject stale concurrent writes.

---

## 2. Table Specifications

### 2.1 `organizations`
Master tenant registry.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(64) | PRIMARY KEY | Unique tenant identifier |
| `name` | VARCHAR(255) | NOT NULL | Organization name |
| `type` | VARCHAR(64) | NOT NULL DEFAULT 'Enterprise' | Org tier / type |
| `logo` | TEXT | NULL | Organization logo asset |
| `branding_color` | VARCHAR(32) | DEFAULT '#10b981' | UI theme color |
| `branches_count` | INT | NOT NULL DEFAULT 1 | Total registered branches |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Created timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE | Updated timestamp |

---

### 2.2 `branches`
Physical facilities, campuses, and operational hubs.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(64) | PRIMARY KEY | Unique branch identifier |
| `org_id` | VARCHAR(64) | NOT NULL, FK(`organizations.id`) | Tenant ID |
| `name` | VARCHAR(255) | NOT NULL | Branch / campus name |
| `code` | VARCHAR(64) | NOT NULL | Branch code |
| `location` | VARCHAR(255) | NOT NULL | Street / address location |
| `city` | VARCHAR(128) | NOT NULL | City |
| `country` | VARCHAR(128) | NOT NULL | Country |
| `manager_name` | VARCHAR(128) | NOT NULL | Assigned manager |
| `version` | INT | NOT NULL DEFAULT 1 | Optimistic locking version |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Created timestamp |

**Indexes & Constraints**:
- `UNIQUE KEY uq_org_branch_code (org_id, code)`
- `INDEX idx_branches_org (org_id)`

---

### 2.3 `departments`
Cost centers and organizational divisions.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(64) | PRIMARY KEY | Department ID |
| `org_id` | VARCHAR(64) | NOT NULL, FK(`organizations.id`) | Tenant ID |
| `name` | VARCHAR(128) | NOT NULL | Department name |
| `head_count` | INT | NOT NULL DEFAULT 0 | Staff count |
| `budget_allocated` | DECIMAL(15,2) | NOT NULL DEFAULT 0.00 | Allocated annual budget |
| `version` | INT | NOT NULL DEFAULT 1 | Optimistic locking version |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Created timestamp |

**Indexes**:
- `INDEX idx_departments_org (org_id)`

---

### 2.4 `users`
Authenticated personnel and role-based access control.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(64) | PRIMARY KEY | User identifier |
| `org_id` | VARCHAR(64) | NOT NULL, FK(`organizations.id`) | Tenant ID |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE | User email (lowercased) |
| `full_name` | VARCHAR(255) | NOT NULL | User full name |
| `role` | ENUM | NOT NULL | 'ADMIN', 'DIRECTOR', 'BRANCH_MANAGER', 'IT_SUPPORT', 'FINANCE', 'USER' |
| `password_hash` | VARCHAR(255) | NULL | Bcrypt password hash |
| `department_id` | VARCHAR(64) | NULL | Department ID |
| `department_name` | VARCHAR(128) | NULL | Department name |
| `branch_id` | VARCHAR(64) | NULL | Branch ID |
| `branch_name` | VARCHAR(128) | NULL | Branch name |
| `status` | ENUM | NOT NULL DEFAULT 'ACTIVE' | 'INVITED', 'ACTIVE', 'SUSPENDED', 'DELETED' |
| `two_factor_enabled`| TINYINT(1) | NOT NULL DEFAULT 0 | 2FA TOTP flag |
| `two_factor_secret` | VARCHAR(64) | NULL | Legacy unencrypted secret |
| `two_factor_secret_enc` | VARCHAR(255) | NULL | AES-256-GCM ciphertext |
| `totp_last_step` | BIGINT | NULL | Replay-prevention counter |
| `invite_token_hash` | VARCHAR(255) | NULL | SHA-256 hashed invite token |
| `invited_at` | TIMESTAMP | NULL | Invite creation timestamp |
| `invite_expires_at`| TIMESTAMP | NULL | Invite expiration timestamp |
| `reset_token_hash`  | VARCHAR(255) | NULL | SHA-256 hashed reset token |
| `reset_expires_at` | TIMESTAMP | NULL | Reset expiration timestamp |
| `failed_login_attempts` | INT | NOT NULL DEFAULT 0 | Consecutive failed attempts |
| `locked_until` | TIMESTAMP | NULL | Lockout expiration timestamp |
| `version` | INT | NOT NULL DEFAULT 1 | Optimistic locking version |
| `token_version` | INT | NOT NULL DEFAULT 1 | JWT / session revocation counter |
| `is_super_admin` | TINYINT(1) | NOT NULL DEFAULT 0 | Super-admin flag |
| `password_changed_at` | TIMESTAMP | NULL | Password last updated |

---

### 2.5 `login_attempts`
Brute-force protection and IP-based rate limiting.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(64) | PRIMARY KEY | Record ID |
| `email` | VARCHAR(255) | NOT NULL | Attempted email |
| `ip` | VARCHAR(64) | NOT NULL | Remote client IP |
| `failures` | INT | NOT NULL DEFAULT 0 | Failed count |
| `locked_until` | TIMESTAMP | NULL | Temporary lockout expiry |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE | Last attempt timestamp |

**Indexes**:
- `INDEX idx_login_attempts_email_ip (email, ip)`

---

### 2.6 `recovery_codes`
Emergency 2FA backup codes.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(64) | PRIMARY KEY | Code record ID |
| `user_id` | VARCHAR(64) | NOT NULL, FK(`users.id` CASCADE) | Target user ID |
| `code_hash` | VARCHAR(255) | NOT NULL | Argon2 / bcrypt code hash |
| `used` | TINYINT(1) | NOT NULL DEFAULT 0 | Consumption status |
| `used_at` | TIMESTAMP | NULL | Consumed timestamp |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Generated timestamp |

---

### 2.7 `assets`
Hardware inventory ledger with partial-unique generated columns.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(64) | PRIMARY KEY | Asset record ID |
| `org_id` | VARCHAR(64) | NOT NULL, FK(`organizations.id`) | Tenant ID |
| `branch_id` | VARCHAR(64) | NOT NULL | Assigned branch ID |
| `branch_name` | VARCHAR(128) | NULL | Branch name snapshot |
| `category_id` | VARCHAR(64) | NOT NULL | Category ID |
| `category_name` | VARCHAR(128) | NULL | Category name |
| `asset_code` | VARCHAR(128) | NOT NULL | Barcode / Asset Tag |
| `name` | VARCHAR(255) | NOT NULL | Asset display name |
| `model` | VARCHAR(255) | NULL | Model / specification |
| `serial_number` | VARCHAR(128) | NOT NULL | Manufacturer serial |
| `mac_address` | VARCHAR(64) | NULL | Network MAC address |
| `phone_number` | VARCHAR(64) | NULL | SIM / Phone number |
| `registered_email` | VARCHAR(255) | NULL | Enrolled Apple ID / Google account |
| `imei_number` | VARCHAR(64) | NULL | Cellular IMEI |
| `status` | ENUM | NOT NULL DEFAULT 'ACTIVE' | 'ACTIVE', 'DAMAGED', 'REPAIR', 'DEPRECATED', 'SOLD', 'DISPOSED' |
| `asset_condition` | ENUM | NOT NULL DEFAULT 'GOOD' | 'NEW', 'GOOD', 'FAIR', 'POOR' |
| `purchase_date` | DATE | NOT NULL | Purchase date |
| `purchase_cost` | DECIMAL(15,2) | NOT NULL DEFAULT 0.00 | Capital cost |
| `warranty_expiry` | DATE | NULL | Warranty expiration |
| `current_value` | DECIMAL(15,2) | NOT NULL DEFAULT 0.00 | Depreciated book value |
| `assigned_to_user_id` | VARCHAR(64) | NULL | Current custodian user ID |
| `version` | INT | NOT NULL DEFAULT 1 | Optimistic locking version |
| `clean_serial` | VARCHAR(128) | GENERATED VIRTUAL | Non-empty, non-disposed serial |
| `clean_mac` | VARCHAR(64) | GENERATED VIRTUAL | Non-empty, non-disposed MAC |
| `clean_imei` | VARCHAR(64) | GENERATED VIRTUAL | Non-empty, non-disposed IMEI |

**Indexes & Constraints**:
- `UNIQUE KEY uq_assets_org_code (org_id, asset_code)`
- `UNIQUE KEY uq_assets_org_clean_serial (org_id, clean_serial)`
- `UNIQUE KEY uq_assets_org_clean_mac (org_id, clean_mac)`
- `UNIQUE KEY uq_assets_org_clean_imei (org_id, clean_imei)`
- `INDEX idx_assets_org_branch_status (org_id, branch_id, status)`

---

### 2.8 `checkouts`
Custody checkout and return chain.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(64) | PRIMARY KEY | Checkout transaction ID |
| `org_id` | VARCHAR(64) | NOT NULL | Tenant ID |
| `branch_id` | VARCHAR(64) | NULL | Branch ID |
| `asset_id` | VARCHAR(64) | NOT NULL, FK(`assets.id` RESTRICT) | Target hardware ID |
| `asset_code` | VARCHAR(128) | NOT NULL | Asset tag snapshot |
| `asset_name` | VARCHAR(255) | NOT NULL | Asset name snapshot |
| `checked_out_by` | VARCHAR(255) | NOT NULL | Issuing officer |
| `checked_out_to_user_id` | VARCHAR(64) | NOT NULL | Custodian user ID |
| `checked_out_to_user_name` | VARCHAR(255) | NOT NULL | Custodian full name |
| `checked_out_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Issuance time |
| `expected_return_date` | DATE | NULL | Due date |
| `checked_in_at` | TIMESTAMP | NULL | Actual return time |
| `return_condition` | ENUM | NULL | 'NEW', 'GOOD', 'FAIR', 'POOR' |
| `status` | ENUM | NOT NULL DEFAULT 'ACTIVE' | 'ACTIVE', 'RETURNED', 'LOST', 'DAMAGED_DURING_CHECKOUT' |
| `active_asset_id` | VARCHAR(64) | GENERATED VIRTUAL | `IF(status='ACTIVE', asset_id, NULL)` |
| `version` | INT | NOT NULL DEFAULT 1 | Optimistic locking version |

**Indexes & Constraints**:
- `UNIQUE KEY uq_checkouts_active_asset (active_asset_id)` — **Enforces at most one active checkout per asset at the database engine level**.
- `INDEX idx_checkouts_org_branch (org_id, branch_id)`
- `CONSTRAINT fk_checkouts_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT`

---

### 2.9 `maintenances`
Service work orders and repair rollups.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(64) | PRIMARY KEY | Maintenance ticket ID |
| `org_id` | VARCHAR(64) | NOT NULL | Tenant ID |
| `branch_id` | VARCHAR(64) | NULL | Branch ID |
| `asset_id` | VARCHAR(64) | NOT NULL, FK(`assets.id` RESTRICT) | Hardware ID |
| `asset_code` | VARCHAR(128) | NOT NULL | Asset code snapshot |
| `type` | ENUM | NOT NULL | 'REPAIR', 'PREVENTIVE', 'INSPECTION', 'UPGRADE' |
| `status` | ENUM | NOT NULL | 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED' |
| `priority` | ENUM | NOT NULL | 'HIGH', 'MEDIUM', 'LOW' |
| `description` | TEXT | NOT NULL | Issue description |
| `reported_by` | VARCHAR(255) | NOT NULL | Reporter name |
| `reported_by_user_id` | VARCHAR(64) | NULL | Reporter user ID |
| `assigned_technician` | VARCHAR(255) | NOT NULL | Assigned engineer |
| `cost` | DECIMAL(15,2) | NOT NULL DEFAULT 0.00 | Incurred service cost |
| `version` | INT | NOT NULL DEFAULT 1 | Optimistic locking version |

**Indexes & Constraints**:
- `CONSTRAINT fk_maintenances_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT`
- `INDEX idx_maintenances_org_branch (org_id, branch_id)`

---

### 2.10 `audit_logs` & `audit_chain_heads`
Cryptographically chained, immutable audit ledger.

#### `audit_logs`:
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | VARCHAR(64) | PRIMARY KEY | Event ID |
| `org_id` | VARCHAR(64) | NOT NULL, FK(`organizations.id` RESTRICT) | Tenant ID |
| `seq` | BIGINT | NOT NULL | Monotonic per-org sequence |
| `actor_id` | VARCHAR(64) | NOT NULL | Actor user ID |
| `actor_user_id` | VARCHAR(64) | NULL | Explicit actor reference |
| `user_name` | VARCHAR(255) | NOT NULL | Actor name snapshot |
| `user_role` | VARCHAR(64) | NOT NULL | Actor role snapshot |
| `action` | VARCHAR(128) | NOT NULL | Action opcode |
| `entity_type` | VARCHAR(64) | NOT NULL | Entity type |
| `entity_id` | VARCHAR(64) | NOT NULL | Entity record ID |
| `entity_name` | VARCHAR(255) | NOT NULL | Entity name snapshot |
| `changes` | TEXT | NOT NULL | JSON diff payload |
| `request_id` | VARCHAR(64) | NULL | Correlated HTTP request ID |
| `prev_hash` | VARCHAR(64) | NOT NULL | Preceding SHA-256 hash |
| `hash` | VARCHAR(64) | NOT NULL | SHA-256 digest of record |
| `timestamp` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Normalized UTC event time |
| `ip_address` | VARCHAR(64) | DEFAULT '127.0.0.1' | Client IP address |

**Indexes & Constraints**:
- `UNIQUE KEY uq_audit_org_seq (org_id, seq)`
- `INDEX idx_audit_org_time (org_id, timestamp)`
- `CONSTRAINT fk_audit_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE RESTRICT`

#### `audit_chain_heads`:
Serializes sequence assignment per organization with row-level locks (`SELECT ... FOR UPDATE`).
| Column | Type | Constraints | Description |
|---|---|---|---|
| `org_id` | VARCHAR(64) | PRIMARY KEY, FK(`organizations.id` RESTRICT) | Tenant ID |
| `last_seq` | BIGINT | NOT NULL DEFAULT 0 | Latest committed sequence |
| `last_hash` | VARCHAR(64) | NOT NULL | Latest block SHA-256 hash |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP ON UPDATE | Last event timestamp |

---

### 2.11 `idempotency_keys_v2`
Offline mutation replay prevention and duplicate request protection.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `key` | VARCHAR(128) | NOT NULL | Client idempotency UUID |
| `org_id` | VARCHAR(64) | NOT NULL | Tenant ID |
| `user_id` | VARCHAR(64) | NULL | Submitting user ID |
| `request_path` | VARCHAR(255) | NOT NULL | Target API path |
| `request_hash` | VARCHAR(64) | NOT NULL | SHA-256 payload digest |
| `status` | ENUM | NOT NULL DEFAULT 'PROCESSING' | 'PROCESSING', 'COMPLETED', 'FAILED' |
| `response_status` | INT | NULL | HTTP response status code |
| `response_body` | MEDIUMTEXT | NULL | Cached HTTP response payload |
| `response_headers` | TEXT | NULL | Cached HTTP response headers |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Submission timestamp |
| `expires_at` | TIMESTAMP | NOT NULL | TTL expiration timestamp |

**Indexes & Constraints**:
- `PRIMARY KEY (key, org_id)`
- `INDEX idx_idemp_v2_org_created (org_id, created_at)`
- `INDEX idx_idemp_v2_expires (expires_at)`

---

### 2.12 `schema_migrations`
Cryptographic registry of applied versioned migration files.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `version` | VARCHAR(64) | PRIMARY KEY | Migration version (e.g. '001', '002') |
| `name` | VARCHAR(255) | NOT NULL | File name (e.g. '001_initial_schema.sql') |
| `checksum` | VARCHAR(64) | NOT NULL | SHA-256 digest of migration file |
| `applied_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Execution timestamp |

---

## 3. Migration Commands
- **Check Status**: `npm run db:status`
- **Dry Run**: `npm run db:dry-run`
- **Apply Migrations**: `npm run db:migrate`
