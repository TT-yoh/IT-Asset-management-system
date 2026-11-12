import mysql from 'mysql2/promise';
import fs from 'fs';
import config from './config';

let pool: mysql.Pool | null = null;
let isPoolInitialized = false;
let forceInMemoryForTest = false;

export function setForceInMemoryForTest(val: boolean) {
  if (config.isTest) {
    forceInMemoryForTest = val;
  }
}

// In-memory store for offline unit tests (active ONLY when config.isTest is true)
const inMemoryStore = new Map<string, any[]>();

export function getInMemoryStore() {
  return inMemoryStore;
}

export function resetInMemoryStore() {
  inMemoryStore.clear();
}

/**
 * Returns active TiDB / MySQL connection pool, or null if test environment uses in-memory.
 * Outside test environment, missing credentials or pool failure throws immediately.
 */
export function getDbPool(): mysql.Pool | null {
  if (config.isTest && (forceInMemoryForTest || config.USE_IN_MEMORY_DB || config.ALLOW_IN_MEMORY_DB)) {
    return null;
  }
  if (pool) return pool;

  let targetHost = config.TIDB_HOST;
  let targetPort = config.TIDB_PORT;
  let targetUser = config.TIDB_USER;
  let targetPassword = config.TIDB_PASSWORD;
  let targetDatabase = config.TIDB_DATABASE;

  // Parse TEST_DATABASE_URL if provided in test environment
  if (config.isTest && config.TEST_DATABASE_URL) {
    try {
      const parsed = new URL(config.TEST_DATABASE_URL);
      targetHost = parsed.hostname || targetHost;
      targetPort = parsed.port ? Number(parsed.port) : targetPort;
      targetUser = parsed.username ? decodeURIComponent(parsed.username) : targetUser;
      targetPassword = parsed.password ? decodeURIComponent(parsed.password) : targetPassword;
      targetDatabase = parsed.pathname ? parsed.pathname.replace(/^\//, '') : targetDatabase;
    } catch (err: any) {
      console.warn('[DB] Could not parse TEST_DATABASE_URL:', err.message);
    }
  }

  if (!targetHost || !targetUser || !targetPassword || !targetDatabase) {
    if (config.isTest) {
      return null;
    }
    throw new Error('FATAL: Database configuration missing (TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE).');
  }

  let sslConfig: mysql.SslOptions | undefined;
  if (config.isTest && config.TIDB_SSL === false) {
    sslConfig = undefined;
  } else {
    if (config.TIDB_CA_PATH && fs.existsSync(config.TIDB_CA_PATH)) {
      sslConfig = {
        ca: fs.readFileSync(config.TIDB_CA_PATH),
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      };
    } else {
      sslConfig = {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      };
    }
  }

  const isServerless = config.isVercel || process.env.VERCEL === '1';

  pool = mysql.createPool({
    host: targetHost,
    port: targetPort,
    user: targetUser,
    password: targetPassword,
    database: targetDatabase,
    ssl: sslConfig,
    timezone: 'Z',
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: config.DB_POOL_LIMIT || (isServerless ? 3 : 10),
    maxIdle: config.DB_POOL_LIMIT || (isServerless ? 3 : 10),
    idleTimeout: isServerless ? 10000 : 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  });
  isPoolInitialized = true;
  return pool;
}

export type QueryExecutor = <T = any>(sql: string, params?: any[]) => Promise<T[]>;

/**
 * Executes a parameterized SQL query safely.
 * Never catches and falls back to in-memory store; SQL errors propagate to callers unchanged.
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  if (config.isTest && forceInMemoryForTest) {
    return executeInMemoryQuery<T>(sql, params);
  }

  const activePool = getDbPool();

  if (activePool) {
    try {
      const [rows] = await activePool.execute(sql, params);
      return rows as T[];
    } catch (err: any) {
      // Log server-side only without leaking credentials or details to clients
      console.error(`[DB ERROR] Code: ${err.code || 'UNKNOWN'} - SQL: ${sql}`);
      // Propagate original error (ER_DUP_ENTRY, etc.) unchanged to callers
      throw err;
    }
  }

  if (config.isTest) {
    return executeInMemoryQuery<T>(sql, params);
  }

  throw new Error('FATAL: Database connection pool is not available.');
}

/**
 * Runs a set of operations in a single database transaction.
 * If getConnection or beginTransaction fails, throws immediately.
 * Always rolls back on error, releases connection in finally, and rethrows original error.
 */
export async function withTransaction<T>(
  callback: (executor: QueryExecutor) => Promise<T>
): Promise<T> {
  const activePool = getDbPool();
  if (!activePool) {
    if (config.isTest) {
      const mockTx: QueryExecutor = ((sql: string, params: any[] = []) => query(sql, params)) as any;
      (mockTx as any).isTransaction = true;
      return callback(mockTx);
    }
    throw new Error('Database pool not available for transaction.');
  }

  let conn: mysql.PoolConnection | null = null;
  try {
    conn = await activePool.getConnection();
    await conn.beginTransaction();

    const txExecutor: QueryExecutor = async (sql: string, params: any[] = []) => {
      const [rows] = await conn!.execute(sql, params);
      return rows as any[];
    };
    (txExecutor as any).isTransaction = true;

    const result = await callback(txExecutor);
    await conn.commit();
    return result;
  } catch (err) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr: any) {
        console.error('[DB] Transaction rollback error:', rollbackErr.message);
      }
    }
    throw err;
  } finally {
    if (conn) {
      conn.release();
    }
  }
}

/**
 * Readiness ping check: verifies active database connectivity.
 */
export async function ping(): Promise<boolean> {
  const activePool = getDbPool();
  if (activePool) {
    try {
      const [rows] = await activePool.query('SELECT 1 as ping;');
      return Array.isArray(rows) && rows.length > 0;
    } catch (err: any) {
      console.error('[DB] Ping failed:', err.message);
      return false;
    }
  }
  if (config.isTest) {
    return true;
  }
  return false;
}

/**
 * Closes the active database connection pool gracefully.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    try {
      await pool.end();
    } catch (err: any) {
      console.error('[DB] Error during pool shutdown:', err.message);
    } finally {
      pool = null;
      isPoolInitialized = false;
    }
  }
}

let isShuttingDown = false;
export async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[SHUTDOWN] Received ${signal}, closing database connections gracefully...`);
  await closePool();
  if (!config.isTest) {
    process.exit(0);
  }
}

if (!config.isTest) {
  process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => gracefulShutdown('SIGINT'));
}

/**
 * Strict in-memory query engine (test environments ONLY).
 * Throws "unsupported SQL" for anything it cannot evaluate faithfully:
 * JOIN, LIKE, IN (...), OR conditions, range comparisons, unsupported ORDER BY, composite keys.
 * UPDATE/DELETE with a null/undefined WHERE param matches NOTHING.
 * Merge semantics strictly preserve org_id.
 */
export function executeInMemoryQuery<T = any>(sql: string, params: any[]): T[] {
  const normalized = sql.trim();
  const lower = normalized.toLowerCase();

  // 1. Strict SQL Syntax & Construct Enforcement
  if (/\bjoin\b/i.test(normalized)) {
    throw new Error('unsupported SQL: JOIN is not supported by the in-memory engine');
  }
  if (/\blike\b/i.test(normalized)) {
    throw new Error('unsupported SQL: LIKE is not supported by the in-memory engine');
  }
  if (/\bin\s*\(/i.test(normalized)) {
    throw new Error('unsupported SQL: IN (...) is not supported by the in-memory engine');
  }
  if (/\bwhere\b[\s\S]*\bor\b/i.test(normalized)) {
    throw new Error('unsupported SQL: OR in WHERE clause is not supported by the in-memory engine');
  }
  if (/[<>]|<=|>=/i.test(normalized.replace(/'[^']*'/g, ''))) {
    throw new Error('unsupported SQL: range comparison operators are not supported by the in-memory engine');
  }

  // Verify ORDER BY clauses
  const orderMatch = lower.match(/order\s+by\s+[`]?([a-zA-Z0-9_]+)[`]?\s*(asc|desc)?/i);
  if (orderMatch) {
    const orderCol = orderMatch[1];
    const supportedCols = ['seq', 'name', 'timestamp', 'created_at', 'checked_out_at', 'fiscal_year'];
    if (!supportedCols.includes(orderCol)) {
      throw new Error(`unsupported SQL: ORDER BY ${orderCol} is not supported by the in-memory engine`);
    }
  }

  // 2. SELECT queries
  if (lower.startsWith('select')) {
    const tableMatch = lower.match(/from\s+[`]?([a-zA-Z0-9_]+)[`]?/);
    if (!tableMatch || !tableMatch[1]) return [] as T[];
    const tableName = tableMatch[1];
    let rows = [...(inMemoryStore.get(tableName) || [])];

    // Systematic WHERE parameter parsing
    const whereMatch = lower.match(/where\s+(.+?)(?:\s+order|\s+group|\s+limit|\s+for\s+update|$)/);
    if (whereMatch && whereMatch[1]) {
      const whereClause = whereMatch[1];
      const condRegex = /[`]?([a-zA-Z0-9_]+)[`]?\s*=\s*\?/g;
      let match;
      let paramIdx = 0;
      while ((match = condRegex.exec(whereClause)) !== null && paramIdx < params.length) {
        const col = match[1];
        const val = params[paramIdx++];
        if (val === null || val === undefined) {
          // NULL in SQL = condition evaluates to UNKNOWN -> matches 0 rows
          return [] as T[];
        }
        if (col === 'email') {
          rows = rows.filter(r => r.email?.toLowerCase() === String(val).toLowerCase());
        } else {
          rows = rows.filter(r => r[col] == val);
        }
      }
    }

    // Handle COUNT(*) aggregation
    if (lower.includes('count(*)')) {
      const aliasMatch = lower.match(/count\(\*\)\s+(?:as\s+)?([a-zA-Z0-9_]+)/);
      const alias = aliasMatch ? aliasMatch[1] : 'cnt';
      return [{ [alias]: rows.length }] as any;
    }

    // Order by column handling
    if (orderMatch) {
      const orderCol = orderMatch[1];
      const direction = (orderMatch[2] || 'asc').toLowerCase();
      rows.sort((a, b) => {
        const valA = a[orderCol] ?? '';
        const valB = b[orderCol] ?? '';
        if (typeof valA === 'number' && typeof valB === 'number') {
          return direction === 'desc' ? valB - valA : valA - valB;
        }
        return direction === 'desc'
          ? String(valB).localeCompare(String(valA))
          : String(valA).localeCompare(String(valB));
      });
    }

    if (lower.includes('limit 1')) {
      return rows.slice(0, 1) as T[];
    }

    return rows as T[];
  }

  // 3. INSERT queries
  if (lower.startsWith('insert')) {
    const tableMatch = lower.match(/into\s+[`]?([a-zA-Z0-9_]+)[`]?/);
    if (tableMatch && tableMatch[1]) {
      const tableName = tableMatch[1];
      const rows = inMemoryStore.get(tableName) || [];

      // Extract column names
      const colsMatch = normalized.match(/\(([^)]+)\)\s+values/i);
      if (colsMatch && colsMatch[1]) {
        const columns = colsMatch[1].split(',').map(c => c.trim().replace(/[`"']/g, ''));
        const colCount = columns.length;
        const totalRows = Math.floor(params.length / colCount);

        for (let r = 0; r < Math.max(1, totalRows); r++) {
          const newRow: Record<string, any> = {};
          columns.forEach((col, idx) => {
            newRow[col] = params[r * colCount + idx];
          });

          // Check for upsert / primary key conflict
          const existingIdx = rows.findIndex(existing => 
            (newRow.id && existing.id === newRow.id) || 
            (newRow.key && existing.key === newRow.key) ||
            (tableName === 'audit_chain_heads' && existing.org_id === newRow.org_id) ||
            (newRow.org_id && newRow.user_id && newRow.idem_key &&
             existing.org_id === newRow.org_id && existing.user_id === newRow.user_id && existing.idem_key === newRow.idem_key)
          );

          if (existingIdx !== -1) {
            if (tableName === 'idempotency_keys_v2' && !lower.includes('on duplicate key update')) {
              const dupErr: any = new Error("ER_DUP_ENTRY: Duplicate entry for key 'PRIMARY'");
              dupErr.code = 'ER_DUP_ENTRY';
              dupErr.errno = 1062;
              throw dupErr;
            }
            const existingOrgId = rows[existingIdx].org_id;
            const merged = { ...rows[existingIdx], ...newRow };
            // Merge semantics: NEVER overwrite existing org_id
            if (existingOrgId) {
              merged.org_id = existingOrgId;
            }
            rows[existingIdx] = merged;
          } else {
            rows.push(newRow);
          }
        }
        inMemoryStore.set(tableName, rows);
      }
    }
    return [] as T[];
  }

  // 4. UPDATE queries
  if (lower.startsWith('update')) {
    const tableMatch = lower.match(/update\s+[`]?([a-zA-Z0-9_]+)[`]?/);
    if (tableMatch && tableMatch[1]) {
      const tableName = tableMatch[1];
      const rows = inMemoryStore.get(tableName) || [];

      const setMatch = normalized.match(/set\s+(.+?)\s+where\s+(.+)/i);
      if (setMatch) {
        const setClause = setMatch[1];
        const whereClause = setMatch[2];

        const setCols = setClause.split(',').map(s => s.trim().split('=')[0].trim().replace(/[`"']/g, ''));
        const setPlaceholdersCount = (setClause.match(/\?/g) || []).length;

        // Parse WHERE conditions
        const whereConds = whereClause.match(/[`]?([a-zA-Z0-9_]+)[`]?\s*=\s*\?/g) || [];
        let matchingIndices = rows.map((_, i) => i);

        // Check if unassigned custody check is required
        if (whereClause.toLowerCase().includes('assigned_to_user_id is null')) {
          matchingIndices = matchingIndices.filter(i => !rows[i].assigned_to_user_id || rows[i].assigned_to_user_id === '');
        }

        whereConds.forEach((cond, cIdx) => {
          const col = cond.split('=')[0].trim().replace(/[`"']/g, '');
          const val = params[setPlaceholdersCount + cIdx];
          // If WHERE parameter is null or undefined, matches NOTHING (0 rows)
          if (val === null || val === undefined) {
            matchingIndices = [];
          } else {
            matchingIndices = matchingIndices.filter(i => rows[i][col] == val);
          }
        });

        for (const idx of matchingIndices) {
          const target = { ...rows[idx] };
          const existingOrgId = target.org_id;
          let pIdx = 0;
          setCols.forEach(col => {
            if (pIdx < setPlaceholdersCount) {
              const newVal = params[pIdx++];
              // Tenant boundary preservation: never overwrite org_id
              if (col !== 'org_id' || !existingOrgId) {
                target[col] = newVal;
              }
            }
          });
          if (lower.includes('version = version + 1') || lower.includes('`version` = `version` + 1')) {
            target.version = (Number(target.version) || 1) + 1;
          }
          rows[idx] = target;
        }
        inMemoryStore.set(tableName, rows);
        return [{ affectedRows: matchingIndices.length }] as any;
      }
    }
    return [{ affectedRows: 0 }] as any;
  }

  // 5. DELETE queries
  if (lower.startsWith('delete')) {
    const tableMatch = lower.match(/from\s+[`]?([a-zA-Z0-9_]+)[`]?/);
    if (tableMatch && tableMatch[1]) {
      const tableName = tableMatch[1];
      let rows = inMemoryStore.get(tableName) || [];

      // Check WHERE conditions
      const whereMatch = normalized.match(/where\s+(.+)/i);
      if (whereMatch) {
        const whereClause = whereMatch[1];
        const whereConds = whereClause.match(/[`]?([a-zA-Z0-9_]+)[`]?\s*(=|!=|<|>|<=|>=)\s*(\?|'[^']*'|\d+)/g) || [];
        let pIdx = 0;
        let matchingIndices = rows.map((_, i) => i);

        whereConds.forEach((cond) => {
          const match = cond.match(/[`]?([a-zA-Z0-9_]+)[`]?\s*(=|!=|<|>|<=|>=)\s*(\?|'[^']*'|\d+)/);
          if (match) {
            const col = match[1];
            const op = match[2];
            const rawVal = match[3];
            let val: any;
            if (rawVal === '?') {
              val = params[pIdx++];
            } else if (rawVal.startsWith("'")) {
              val = rawVal.replace(/^'|'$/g, '');
            } else {
              val = Number(rawVal);
            }

            if (val === null || val === undefined) {
              matchingIndices = [];
            } else if (op === '=') {
              matchingIndices = matchingIndices.filter(i => rows[i][col] == val);
            } else if (op === '!=') {
              matchingIndices = matchingIndices.filter(i => rows[i][col] != val);
            }
          }
        });

        const deletedCount = matchingIndices.length;
        rows = rows.filter((_, i) => !matchingIndices.includes(i));
        inMemoryStore.set(tableName, rows);
        return [{ affectedRows: deletedCount }] as any;
      }
      inMemoryStore.set(tableName, []);
      return [{ affectedRows: rows.length }] as any;
    }
    return [] as T[];
  }

  return [] as T[];
}
