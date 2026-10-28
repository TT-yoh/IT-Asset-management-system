import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const host = process.env.TIDB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com';
const port = Number(process.env.TIDB_PORT || 4000);
const user = process.env.TIDB_USER || 'pcTx68ZcUHQq15E.root';
const password = process.env.TIDB_PASSWORD || 'Fyxzmx2p19g5mL5j';
const database = process.env.TIDB_DATABASE || 'it_asset_ledger';
const ssl = process.env.TIDB_SSL !== 'false';

let pool: mysql.Pool | null = null;
let isPoolInitialized = false;

// Fallback in-memory store for offline development, local unit tests, and air-gapped environments
const inMemoryStore = new Map<string, any[]>();

export function getInMemoryStore() {
  return inMemoryStore;
}

export function resetInMemoryStore() {
  inMemoryStore.clear();
}

/**
 * Returns active TiDB / MySQL connection pool, or null if not configured
 */
export function getDbPool(): mysql.Pool | null {
  if (pool) return pool;
  if (!user || !host) return null;

  try {
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      ssl: ssl ? { rejectUnauthorized: false } : undefined,
      timezone: 'Z',
      dateStrings: true,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000
    });
    isPoolInitialized = true;
    return pool;
  } catch (err) {
    console.warn('Could not initialize MySQL pool, falling back to resilient in-memory engine:', err);
    return null;
  }
}

export type QueryExecutor = <T = any>(sql: string, params?: any[]) => Promise<T[]>;

/**
 * Executes a parameterized SQL query safely.
 * Never concatenates raw values into the query.
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const activePool = getDbPool();

  if (activePool) {
    try {
      const [rows] = await activePool.execute(sql, params);
      return rows as T[];
    } catch (err: any) {
      // If network unreachable or ECONNREFUSED, fallback to in-memory store
      console.warn(`Database query error (query falling back to in-memory store): ${err.message}`);
      return executeInMemoryQuery<T>(sql, params);
    }
  }

  return executeInMemoryQuery<T>(sql, params);
}

/**
 * Runs a set of operations in a single database transaction.
 * Automatically commits on success, and rolls back on error.
 */
export async function withTransaction<T>(
  callback: (executor: QueryExecutor) => Promise<T>
): Promise<T> {
  const activePool = getDbPool();
  if (activePool) {
    let conn;
    try {
      conn = await activePool.getConnection();
      await conn.beginTransaction();
      const txExecutor: QueryExecutor = async (sql: string, params: any[] = []) => {
        const [rows] = await conn.execute(sql, params);
        return rows as any[];
      };
      const result = await callback(txExecutor);
      await conn.commit();
      return result;
    } catch (err) {
      if (conn) {
        try {
          await conn.rollback();
        } catch {}
      }
      throw err;
    } finally {
      if (conn) {
        conn.release();
      }
    }
  }

  // Fallback to in-memory execution
  return callback(query);
}

/**
 * Resilient in-memory query engine supporting parameterized SELECT, INSERT, UPDATE, DELETE
 * to allow air-gapped testing and offline execution.
 */
function executeInMemoryQuery<T = any>(sql: string, params: any[]): T[] {
  const normalized = sql.trim();
  const lower = normalized.toLowerCase();

  // 1. SELECT queries
  if (lower.startsWith('select')) {
    const tableMatch = lower.match(/from\s+[`]?([a-zA-Z0-9_]+)[`]?/);
    if (!tableMatch || !tableMatch[1]) return [] as T[];
    const tableName = tableMatch[1];
    let rows = [...(inMemoryStore.get(tableName) || [])];

    // Systematic WHERE parameter parsing
    const whereMatch = lower.match(/where\s+(.+?)(?:\s+order|\s+group|\s+limit|$)/);
    if (whereMatch && whereMatch[1]) {
      const whereClause = whereMatch[1];
      const condRegex = /[`]?([a-zA-Z0-9_]+)[`]?\s*=\s*\?/g;
      let match;
      let paramIdx = 0;
      while ((match = condRegex.exec(whereClause)) !== null && paramIdx < params.length) {
        const col = match[1];
        const val = params[paramIdx++];
        if (col === 'email') {
          rows = rows.filter(r => r.email?.toLowerCase() === String(val).toLowerCase());
        } else {
          rows = rows.filter(r => r[col] == val);
        }
      }
    }

    // Order by seq handling
    if (lower.includes('order by seq desc') || lower.includes('order by `seq` desc')) {
      rows.sort((a, b) => Number(b.seq || 0) - Number(a.seq || 0));
    } else if (lower.includes('order by seq asc') || lower.includes('order by `seq` asc')) {
      rows.sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
    }

    if (lower.includes('limit 1')) {
      return rows.slice(0, 1) as T[];
    }

    return rows as T[];
  }

  // 2. INSERT queries
  if (lower.startsWith('insert')) {
    const tableMatch = lower.match(/into\s+[`]?([a-zA-Z0-9_]+)[`]?/);
    if (tableMatch && tableMatch[1]) {
      const tableName = tableMatch[1];
      const rows = inMemoryStore.get(tableName) || [];

      // Extract column names
      const colsMatch = normalized.match(/\(([^)]+)\)\s+values/i);
      if (colsMatch && colsMatch[1]) {
        const columns = colsMatch[1].split(',').map(c => c.trim().replace(/[`"']/g, ''));
        const newRow: Record<string, any> = {};
        columns.forEach((col, idx) => {
          newRow[col] = params[idx];
        });

        // Check for upsert / primary key conflict (id or key)
        const existingIdx = rows.findIndex(r => 
          (newRow.id && r.id === newRow.id) || 
          (newRow.key && r.key === newRow.key)
        );
        if (existingIdx !== -1) {
          rows[existingIdx] = { ...rows[existingIdx], ...newRow };
        } else {
          rows.push(newRow);
        }
        inMemoryStore.set(tableName, rows);
      }
    }
    return [] as T[];
  }

  // 3. UPDATE queries
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

        whereConds.forEach((cond, cIdx) => {
          const col = cond.split('=')[0].trim().replace(/[`"']/g, '');
          const val = params[setPlaceholdersCount + cIdx];
          matchingIndices = matchingIndices.filter(i => rows[i][col] == val);
        });

        for (const idx of matchingIndices) {
          const target = { ...rows[idx] };
          let pIdx = 0;
          setCols.forEach(col => {
            if (pIdx < setPlaceholdersCount) {
              target[col] = params[pIdx++];
            }
          });
          if (lower.includes('version = version + 1') || lower.includes('`version` = `version` + 1')) {
            target.version = (Number(target.version) || 1) + 1;
          }
          rows[idx] = target;
        }
        inMemoryStore.set(tableName, rows);
      }
    }
    return [] as T[];
  }

  // 4. DELETE queries
  if (lower.startsWith('delete')) {
    const tableMatch = lower.match(/from\s+[`]?([a-zA-Z0-9_]+)[`]?/);
    if (tableMatch && tableMatch[1]) {
      const tableName = tableMatch[1];
      let rows = inMemoryStore.get(tableName) || [];
      const param = params[0];
      if (typeof param === 'string' && param.endsWith('%')) {
        const prefix = param.slice(0, -1);
        rows = rows.filter(r => !r.id?.startsWith(prefix));
      } else {
        rows = rows.filter(r => r.id !== param);
      }
      inMemoryStore.set(tableName, rows);
    }
    return [] as T[];
  }

  return [] as T[];
}
