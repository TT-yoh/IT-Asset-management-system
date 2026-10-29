/**
 * OmniAsset Enterprise ITAM - Automated Stress & Concurrency Test Suite
 * Evaluates system resilience under high load, high concurrency, race conditions,
 * connection pool saturation, and edge latency benchmarks.
 *
 * PHASES:
 * 1. Concurrent Burst Throughput & Latency Profiling (Escalating Concurrency Tiers)
 * 2. Race Condition Stress: High-Concurrency Double-Checkout Prevention
 * 3. Optimistic Concurrency Locking: Version Collision Stress
 * 4. Idempotency Key Parallel Burst Collision Stress
 * 5. High-Volume Batch Ingestion Stress (Memory & Ingestion Throughput)
 * 6. High-Frequency Read/Write Interleaving (Connection Pool Contention)
 * 7. Live Production Vercel Edge Gateway Benchmark
 */

process.env.NODE_ENV = 'test';

import http from 'http';
import { app } from '../server/index';
import { createSessionToken } from '../server/auth';
import { query, getDbPool } from '../server/db';

let server: http.Server;
let baseUrl = '';

interface LatencyStats {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  elapsedMs: number;
  rps: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

function calculateLatencyStats(latencies: number[], elapsedMs: number, successCount: number, failureCount: number): LatencyStats {
  const totalRequests = latencies.length;
  if (totalRequests === 0) {
    return {
      totalRequests: 0,
      successCount,
      failureCount,
      elapsedMs,
      rps: 0,
      minMs: 0,
      avgMs: 0,
      p50Ms: 0,
      p90Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0
    };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avgMs = sum / totalRequests;
  const minMs = sorted[0]!;
  const maxMs = sorted[totalRequests - 1]!;

  const getPercentile = (p: number) => {
    const idx = Math.min(Math.floor((p / 100) * totalRequests), totalRequests - 1);
    return sorted[idx]!;
  };

  const rps = (totalRequests / (elapsedMs / 1000));

  return {
    totalRequests,
    successCount,
    failureCount,
    elapsedMs,
    rps: Math.round(rps * 10) / 10,
    minMs: Math.round(minMs * 100) / 100,
    avgMs: Math.round(avgMs * 100) / 100,
    p50Ms: Math.round(getPercentile(50) * 100) / 100,
    p90Ms: Math.round(getPercentile(90) * 100) / 100,
    p95Ms: Math.round(getPercentile(95) * 100) / 100,
    p99Ms: Math.round(getPercentile(99) * 100) / 100,
    maxMs: Math.round(maxMs * 100) / 100
  };
}

function printStatsTable(title: string, stats: LatencyStats) {
  console.log(`\n📊 [${title}]`);
  console.log(`   Requests: ${stats.totalRequests} | Success: ${stats.successCount} | Failed: ${stats.failureCount} | Elapsed: ${stats.elapsedMs.toFixed(1)}ms`);
  console.log(`   Throughput : ${stats.rps.toFixed(1)} req/sec`);
  console.log(`   Min Latency: ${stats.minMs.toFixed(2)} ms`);
  console.log(`   Avg Latency: ${stats.avgMs.toFixed(2)} ms`);
  console.log(`   p50 Latency: ${stats.p50Ms.toFixed(2)} ms`);
  console.log(`   p90 Latency: ${stats.p90Ms.toFixed(2)} ms`);
  console.log(`   p95 Latency: ${stats.p95Ms.toFixed(2)} ms`);
  console.log(`   p99 Latency: ${stats.p99Ms.toFixed(2)} ms`);
  console.log(`   Max Latency: ${stats.maxMs.toFixed(2)} ms`);
}

async function apiRequest(
  method: string,
  path: string,
  token?: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; durationMs: number; body: any }> {
  const url = `${baseUrl}${path}`;
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers
  };
  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const start = performance.now();
  try {
    const res = await fetch(url, {
      method,
      headers: reqHeaders,
      body: body ? JSON.stringify(body) : undefined
    });
    const durationMs = performance.now() - start;
    const text = await res.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: res.status, durationMs, body: parsed };
  } catch (err: any) {
    const durationMs = performance.now() - start;
    return { status: 0, durationMs, body: { error: err.message } };
  }
}

async function cleanStressData() {
  await query('DELETE FROM `audit_logs` WHERE `org_id` = "stress-org";');
  await query('DELETE FROM `checkouts` WHERE `id` LIKE "chk-stress-%";');
  await query('DELETE FROM `idempotency_keys` WHERE `org_id` = "stress-org";');
  await query('DELETE FROM `assets` WHERE `org_id` = "stress-org";');
  await query('DELETE FROM `users` WHERE `org_id` = "stress-org";');
  await query('DELETE FROM `branches` WHERE `org_id` = "stress-org";');
  await query('DELETE FROM `organizations` WHERE `id` = "stress-org";');
}

async function setupStressData() {
  await cleanStressData();

  await query(`
    INSERT INTO \`organizations\` (\`id\`, \`name\`, \`type\`)
    VALUES ('stress-org', 'OmniAsset Stress Test Lab', 'Enterprise');
  `);

  await query(`
    INSERT INTO \`branches\` (\`id\`, \`org_id\`, \`name\`, \`code\`, \`location\`, \`city\`, \`country\`, \`manager_name\`)
    VALUES ('stress-br-1', 'stress-org', 'Stress Hub Alpha', 'STR-01', 'Data Center Tier 4', 'Sydney', 'Australia', 'Lab Director');
  `);

  await query(`
    INSERT INTO \`asset_categories\` (\`id\`, \`name\`, \`depreciation_years\`)
    VALUES ('stress-cat-srv', 'Servers & Compute', 5)
    ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`);
  `);

  await query(`
    INSERT INTO \`users\` (
      \`id\`, \`org_id\`, \`email\`, \`full_name\`, \`role\`, \`branch_id\`, \`branch_name\`, \`status\`
    ) VALUES 
      ('usr-stress-admin', 'stress-org', 'admin@stresstest.com', 'Stress Test Admin', 'ADMIN', 'stress-br-1', 'Stress Hub Alpha', 'ACTIVE'),
      ('usr-stress-tech-1', 'stress-org', 'tech1@stresstest.com', 'Technician One', 'IT_SUPPORT', 'stress-br-1', 'Stress Hub Alpha', 'ACTIVE'),
      ('usr-stress-tech-2', 'stress-org', 'tech2@stresstest.com', 'Technician Two', 'USER', 'stress-br-1', 'Stress Hub Alpha', 'ACTIVE');
  `);

  // Seed baseline assets for testing
  await query(`
    INSERT INTO \`assets\` (
      \`id\`, \`org_id\`, \`branch_id\`, \`branch_name\`, \`category_id\`, \`category_name\`,
      \`asset_code\`, \`name\`, \`model\`, \`serial_number\`, \`status\`, \`asset_condition\`,
      \`purchase_date\`, \`purchase_cost\`, \`version\`
    ) VALUES (
      'test-stress-ast-single', 'stress-org', 'stress-br-1', 'Stress Hub Alpha', 'stress-cat-srv', 'Servers & Compute',
      'STR-SRV-001', 'Dell PowerEdge R750', 'PowerEdge R750', 'SN-STR-R750-X1', 'ACTIVE', 'NEW',
      '2024-01-01', 8500.00, 1
    );
  `);
}

async function runStressSuite() {
  console.log('\n================================================================');
  console.log('⚡ OmniAsset Enterprise High-Concurrency & Stress Test Engine');
  console.log('================================================================');

  server = app.listen(0);
  const address = server.address() as any;
  baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`🚀 Ephemeral Test Gateway listening on ${baseUrl}`);

  const adminToken = createSessionToken({
    userId: 'usr-stress-admin',
    orgId: 'stress-org',
    email: 'admin@stresstest.com',
    fullName: 'Stress Test Admin',
    role: 'ADMIN',
    branchId: 'stress-br-1'
  });

  await setupStressData();

  let totalPassed = 0;
  let totalFailed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      totalPassed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      totalFailed++;
    }
  }

  // ============================================================================
  // PHASE 1: Concurrent Burst Throughput & Latency Profiling
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 1: Concurrent Burst Throughput & Latency Profiling');
  console.log('----------------------------------------------------------------');

  const tiers = [
    { concurrency: 25, title: 'Tier A: 25 Concurrent Health Requests' },
    { concurrency: 50, title: 'Tier B: 50 Concurrent Health Requests' },
    { concurrency: 100, title: 'Tier C: 100 Concurrent Health Requests' }
  ];

  for (const tier of tiers) {
    const latencies: number[] = [];
    let success = 0;
    let failed = 0;

    const start = performance.now();
    const promises = Array.from({ length: tier.concurrency }, async () => {
      const res = await apiRequest('GET', '/api/health');
      latencies.push(res.durationMs);
      if (res.status === 200 && res.body?.status === 'healthy') {
        success++;
      } else {
        failed++;
      }
    });

    await Promise.all(promises);
    const elapsed = performance.now() - start;
    const stats = calculateLatencyStats(latencies, elapsed, success, failed);
    printStatsTable(tier.title, stats);

    assert(stats.successCount === tier.concurrency, `${tier.concurrency} concurrent requests handled with 100% success`);
    assert(stats.p95Ms < 450, `p95 latency is sub-450ms (${stats.p95Ms}ms) under ${tier.concurrency} load`);
  }

  // Deep endpoint stress: /api/init (8 parallel queries per request) under 30 concurrent callers
  {
    console.log('\n--- Deep Endpoint Stress: /api/init (8 Parallel SQL Queries/Request) ---');
    const concurrency = 30;
    const latencies: number[] = [];
    let success = 0;
    let failed = 0;

    const start = performance.now();
    const promises = Array.from({ length: concurrency }, async () => {
      const res = await apiRequest('GET', '/api/init', adminToken);
      latencies.push(res.durationMs);
      if (res.status === 200 && Array.isArray(res.body?.assets)) {
        success++;
      } else {
        failed++;
      }
    });

    await Promise.all(promises);
    const elapsed = performance.now() - start;
    const stats = calculateLatencyStats(latencies, elapsed, success, failed);
    printStatsTable('30 Concurrent Heavy /api/init (240 simultaneous DB queries)', stats);

    assert(stats.successCount === concurrency, `All ${concurrency} heavy aggregated init calls succeeded`);
    assert(stats.p90Ms < 30000, `p90 latency under heavy cloud DB load is within operational bounds (${stats.p90Ms}ms)`);
  }

  // ============================================================================
  // PHASE 2: Race Condition Stress: Double-Checkout Prevention
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 2: Race Condition Stress: High-Concurrency Double-Checkout');
  console.log('----------------------------------------------------------------');
  {
    const raceConcurrency = 20;
    console.log(`💥 Firing ${raceConcurrency} SIMULTANEOUS checkout requests for the EXACT SAME asset...`);

    const responses: { status: number; body: any }[] = [];
    const racePromises = Array.from({ length: raceConcurrency }, async (_, idx) => {
      const res = await apiRequest('POST', '/api/checkouts', adminToken, {
        id: `chk-stress-race-${idx}`,
        assetId: 'test-stress-ast-single',
        checkedOutToUserId: `usr-stress-tech-${(idx % 2) + 1}`,
        checkedOutToUserName: `Technician ${(idx % 2) + 1}`,
        reason: `High Concurrency Stress Test Thread #${idx}`
      });
      responses.push(res);
    });

    await Promise.all(racePromises);

    const success201 = responses.filter(r => r.status === 201);
    const conflict409 = responses.filter(r => r.status === 409);
    const otherErrors = responses.filter(r => r.status !== 201 && r.status !== 409);

    console.log(`   Results: ${success201.length} Succeeded (201 Created), ${conflict409.length} Rejected (409 Conflict), ${otherErrors.length} Errors`);

    assert(success201.length === 1, 'Exactly ONE checkout request succeeded under concurrent race condition');
    assert(conflict409.length === raceConcurrency - 1, `All ${raceConcurrency - 1} competing requests were safely rejected with HTTP 409 Conflict`);
    assert(otherErrors.length === 0, 'Zero 500 crashes or unexpected unhandled errors during race condition');

    // Verify DB integrity
    const dbCheckouts = await query<any>(
      'SELECT * FROM `checkouts` WHERE `asset_id` = "test-stress-ast-single" AND `status` = "ACTIVE";'
    );
    assert(dbCheckouts.length === 1, 'Database has exactly ONE active checkout record for the asset');
  }

  // ============================================================================
  // PHASE 3: Optimistic Concurrency Locking: Version Collision Stress
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 3: Optimistic Concurrency Locking: Version Collision Stress');
  console.log('----------------------------------------------------------------');
  {
    const collisionConcurrency = 25;
    console.log(`💥 Firing ${collisionConcurrency} simultaneous updates for the same asset with baseVersion: 1...`);

    const updateResponses: { status: number; body: any }[] = [];
    const collisionPromises = Array.from({ length: collisionConcurrency }, async (_, idx) => {
      const res = await apiRequest('PUT', '/api/assets/test-stress-ast-single', adminToken, {
        name: `Dell PowerEdge R750 (Updated by Thread #${idx})`,
        baseVersion: 1,
        status: 'ACTIVE',
        condition: 'GOOD',
        currentValue: 8000 + idx
      });
      updateResponses.push(res);
    });

    await Promise.all(collisionPromises);

    const ok200 = updateResponses.filter(r => r.status === 200);
    const conflict409 = updateResponses.filter(r => r.status === 409);

    console.log(`   Results: ${ok200.length} Succeeded (200 OK), ${conflict409.length} Version Conflicts (409)`);

    assert(ok200.length === 1, 'Exactly ONE update succeeded with baseVersion 1');
    assert(conflict409.length === collisionConcurrency - 1, `Remaining ${collisionConcurrency - 1} updates rejected due to stale version conflict`);

    // Verify version in database incremented to 2
    const updatedAsset = await query<any>('SELECT version FROM `assets` WHERE `id` = "test-stress-ast-single";');
    assert(Number(updatedAsset[0]?.version) === 2, 'Asset version incremented atomically to 2 in database');
  }

  // ============================================================================
  // PHASE 4: Idempotency Key Parallel Burst Collision Stress
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 4: Idempotency Key Parallel Burst Collision Stress');
  console.log('----------------------------------------------------------------');
  {
    const idempotencyConcurrency = 20;
    const sharedIdempotencyKey = `idemp-burst-${Date.now()}`;
    const payload = {
      name: 'Idempotency Stress Server',
      assetCode: `STR-IDEMP-${Date.now()}`,
      serialNumber: `SN-IDEMP-${Date.now()}`,
      purchaseCost: 4500.00
    };

    console.log(`💥 Sending ${idempotencyConcurrency} identical requests with SAME Idempotency-Key: ${sharedIdempotencyKey}...`);

    const idempResponses: { status: number; body: any }[] = [];
    const idempPromises = Array.from({ length: idempotencyConcurrency }, async () => {
      const res = await apiRequest('POST', '/api/assets', adminToken, payload, {
        'Idempotency-Key': sharedIdempotencyKey
      });
      idempResponses.push(res);
    });

    await Promise.all(idempPromises);

    const created201 = idempResponses.filter(r => r.status === 201);
    console.log(`   Results: ${created201.length}/${idempotencyConcurrency} returned HTTP 201 Created`);

    assert(created201.length === idempotencyConcurrency, 'All callers received HTTP 201 Created');

    // Verify all returned the exact same asset ID
    const returnedIds = new Set(idempResponses.map(r => r.body?.id));
    assert(returnedIds.size === 1, 'All parallel requests received identical asset ID from idempotency engine');

    // Verify database contains exactly ONE asset row
    const insertedAssets = await query<any>(
      'SELECT * FROM `assets` WHERE `asset_code` = ?;',
      [payload.assetCode]
    );
    assert(insertedAssets.length === 1, 'Database contains exactly ONE asset record despite 20 simultaneous POST calls');
  }

  // ============================================================================
  // PHASE 5: High-Volume Batch Ingestion Stress (Bulk Ingestion & Memory Stability)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 5: High-Volume Batch Ingestion Stress (150 Assets in 1 Batch)');
  console.log('----------------------------------------------------------------');
  {
    const BATCH_SIZE = 150;
    const memBefore = process.memoryUsage().heapUsed / 1024 / 1024;

    const bulkAssets = Array.from({ length: BATCH_SIZE }, (_, i) => ({
      name: `Cisco Catalyst 9300-X Switch #${i + 1}`,
      assetCode: `STR-BULK-${Date.now()}-${i}`,
      serialNumber: `SN-BULK-${Date.now()}-${i}`,
      macAddress: `00:1A:2B:3C:${(i % 90 + 10).toString(16).padStart(2, '0')}:${(i % 80 + 10).toString(16).padStart(2, '0')}`,
      model: 'Catalyst 9300-X',
      status: 'ACTIVE',
      condition: 'NEW',
      purchaseCost: 3200.00
    }));

    console.log(`📦 Ingesting ${BATCH_SIZE} hardware records in a single chunked transactional payload...`);
    const start = performance.now();
    const res = await apiRequest('POST', '/api/assets/bulk', adminToken, {
      assets: bulkAssets
    });
    const duration = performance.now() - start;
    const memAfter = process.memoryUsage().heapUsed / 1024 / 1024;
    const memDelta = memAfter - memBefore;

    console.log(`   Response Status: ${res.status} | Ingested: ${res.body?.imported} | Time: ${duration.toFixed(1)}ms`);
    console.log(`   Heap Memory Before: ${memBefore.toFixed(1)}MB | After: ${memAfter.toFixed(1)}MB (Delta: ${memDelta > 0 ? '+' : ''}${memDelta.toFixed(1)}MB)`);

    assert(res.status === 201, 'Bulk ingestion API returned HTTP 201 Created');
    assert(res.body?.imported === BATCH_SIZE, `All ${BATCH_SIZE} assets imported successfully`);
    assert(duration < 15000, `Batch ingestion completed within SLA (${duration.toFixed(1)}ms)`);
    assert(memDelta < 50, `Memory heap expansion remained well-bounded (${memDelta.toFixed(1)}MB delta)`);

    // Verify total assets in org
    const totalAssets = await query<any>('SELECT COUNT(*) as cnt FROM `assets` WHERE `org_id` = "stress-org";');
    assert(Number(totalAssets[0]?.cnt) >= BATCH_SIZE, `Database confirmed ${totalAssets[0]?.cnt} total assets`);
  }

  // ============================================================================
  // PHASE 6: High-Frequency Read/Write Interleaving (Pool Contention)
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 6: High-Frequency Read/Write Interleaving (Connection Pool Contention)');
  console.log('----------------------------------------------------------------');
  {
    const totalOps = 30; // 15 reads + 15 writes interleaved
    console.log(`🔄 Launching ${totalOps} interleaved read/write queries simultaneously...`);

    const opPromises: Promise<{ status: number; durationMs: number }>[] = [];
    const start = performance.now();

    for (let i = 0; i < totalOps; i++) {
      if (i % 2 === 0) {
        // Read operation
        opPromises.push(apiRequest('GET', '/api/assets', adminToken));
      } else {
        // Write operation
        opPromises.push(apiRequest('POST', '/api/assets', adminToken, {
          name: `Interleaved Node #${i}`,
          assetCode: `STR-INT-${Date.now()}-${i}`,
          serialNumber: `SN-INT-${Date.now()}-${i}`,
          purchaseCost: 1500.00
        }));
      }
    }

    const opResults = await Promise.all(opPromises);
    const elapsed = performance.now() - start;

    const opSuccess = opResults.filter(r => r.status === 200 || r.status === 201).length;
    const opFailed = opResults.filter(r => r.status !== 200 && r.status !== 201).length;

    console.log(`   Completed ${totalOps} interleaved operations in ${elapsed.toFixed(1)}ms (${Math.round((totalOps / (elapsed / 1000)))} ops/sec)`);
    console.log(`   Success: ${opSuccess} | Failed: ${opFailed}`);

    assert(opSuccess === totalOps, `All ${totalOps} interleaved read/write operations completed cleanly without pool lockups`);
  }

  // ============================================================================
  // PHASE 7: Live Cloud Production Latency & Edge Verification
  // ============================================================================
  console.log('\n----------------------------------------------------------------');
  console.log('PHASE 7: Live Cloud Production Latency & Edge Verification');
  console.log('----------------------------------------------------------------');
  {
    const prodUrl = 'https://it-asset-management-system-orpin.vercel.app/api/health';
    console.log(`🌐 Probing production edge: ${prodUrl} with 20 parallel requests...`);

    const prodLatencies: number[] = [];
    let prodSuccess = 0;
    let prodFailed = 0;

    const start = performance.now();
    const prodPromises = Array.from({ length: 20 }, async () => {
      const pStart = performance.now();
      try {
        const res = await fetch(prodUrl, { signal: AbortSignal.timeout(10000) });
        const pDuration = performance.now() - pStart;
        prodLatencies.push(pDuration);
        if (res.ok) {
          const body = await res.json();
          if (body.status === 'healthy') prodSuccess++;
          else prodFailed++;
        } else {
          prodFailed++;
        }
      } catch {
        const pDuration = performance.now() - pStart;
        prodLatencies.push(pDuration);
        prodFailed++;
      }
    });

    await Promise.all(prodPromises);
    const elapsed = performance.now() - start;
    const stats = calculateLatencyStats(prodLatencies, elapsed, prodSuccess, prodFailed);
    printStatsTable('Live Production Vercel Edge (20 Concurrent Requests)', stats);

    assert(stats.successCount >= 18, `Live Vercel gateway handled concurrent traffic (${stats.successCount}/20 successful)`);
    assert(stats.avgMs < 2000, `Average edge round-trip latency is responsive (${stats.avgMs}ms)`);
  }

  // Clean up
  await cleanStressData();
  server.close();

  console.log('\n================================================================');
  console.log(`  STRESS TESTING COMPLETE: ${totalPassed} Passed, ${totalFailed} Failed`);
  console.log('================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runStressSuite().catch(err => {
  console.error('Fatal stress test suite failure:', err);
  if (server) server.close();
  process.exit(1);
});
