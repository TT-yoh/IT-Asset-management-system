import assert from 'assert';
import fs from 'fs';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import { asyncHandler, HttpError } from '../server/errors';

console.log('⚡ Starting OmniAsset Addendum 3: Async Error Handling & HttpError Test Suite...\n');

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function runTests() {
  // 1. Static AST / Codebase Audit: Verify zero unwrapped async route handlers in server/routes and server/index.ts
  await test('1. Static Code Audit: Zero unwrapped async route handlers across server', () => {
    const routeDir = path.resolve(process.cwd(), 'server', 'routes');
    const routeFiles = fs.readdirSync(routeDir).filter(f => f.endsWith('.ts')).map(f => path.join(routeDir, f));
    const allFilesToScan = [...routeFiles, path.resolve(process.cwd(), 'server', 'index.ts')];

    const violations: string[] = [];

    // Pattern matching route methods: .(get|post|put|patch|delete)\(
    // followed by an async function that is NOT wrapped in asyncHandler
    for (const filePath of allFilesToScan) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/\.(get|post|put|patch|delete)\s*\(/.test(line)) {
          // Look ahead up to 5 lines for async (
          const chunk = lines.slice(i, i + 6).join(' ');
          if (/\basync\s*\([^)]*\)\s*=>/.test(chunk)) {
            // Check if asyncHandler is wrapping it
            if (!chunk.includes('asyncHandler(')) {
              violations.push(`${path.basename(filePath)}:${i + 1}: Unwrapped async route handler detected -> ${line.trim()}`);
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      assert.fail(`Unwrapped async route handlers found:\n${violations.join('\n')}`);
    }
    assert.strictEqual(violations.length, 0);
  });

  // 2. Setup mock express app with central error middleware to verify runtime behavior
  const mockApp = express();
  mockApp.use(express.json());

  // Attach requestId middleware
  mockApp.use((req: any, _res: any, next: any) => {
    req.id = 'req-test-uuid-1234';
    next();
  });

  // Route throwing exposed HttpError
  mockApp.get(
    '/test/http-error-exposed',
    asyncHandler(async () => {
      throw new HttpError(404, 'Asset AST-9999 was not found in registry', 'ASSET_NOT_FOUND', true);
    })
  );

  // Route throwing unexposed HttpError (expose = false)
  mockApp.get(
    '/test/http-error-unexposed',
    asyncHandler(async () => {
      throw new HttpError(500, 'Raw internal credentials leaked in DB connection', 'INTERNAL_LEAK', false);
    })
  );

  // Route throwing raw Database Error (SQL / connection failure)
  mockApp.get(
    '/test/db-rejection',
    asyncHandler(async () => {
      const dbErr: any = new Error('ER_BAD_FIELD_ERROR: Unknown column "secret_totp_key" in "field list"');
      dbErr.code = 'ER_BAD_FIELD_ERROR';
      dbErr.errno = 1054;
      throw dbErr;
    })
  );

  // Central error middleware matching server/index.ts
  mockApp.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as any).id || 'req-fallback';
    const statusCode =
      typeof err.statusCode === 'number'
        ? err.statusCode
        : typeof err.status === 'number'
        ? err.status
        : 500;

    const isServerFault = statusCode >= 500;
    const errorCode = err.code || (isServerFault ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
    const isExposed = err instanceof HttpError ? err.expose : (!isServerFault && Boolean(err.message));
    const clientMessage = isExposed
      ? err.message
      : 'An internal server error occurred. Please contact system support.';

    res.status(statusCode).json({
      error: clientMessage,
      code: errorCode,
      requestId
    });
  });

  const server = mockApp.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 3. Runtime Test: HttpError with expose=true returns status, code, and exposed message
    await test('2. Runtime Test: HttpError with expose=true returns code, status, and message', async () => {
      const res = await fetch(`${baseUrl}/test/http-error-exposed`);
      assert.strictEqual(res.status, 404);
      const data: any = await res.json();
      assert.strictEqual(data.error, 'Asset AST-9999 was not found in registry');
      assert.strictEqual(data.code, 'ASSET_NOT_FOUND');
      assert.strictEqual(data.requestId, 'req-test-uuid-1234');
      assert.strictEqual(data.stack, undefined);
    });

    // 4. Runtime Test: HttpError with expose=false sanitizes message
    await test('3. Runtime Test: HttpError with expose=false masks message from client', async () => {
      const res = await fetch(`${baseUrl}/test/http-error-unexposed`);
      assert.strictEqual(res.status, 500);
      const data: any = await res.json();
      assert.strictEqual(data.error, 'An internal server error occurred. Please contact system support.');
      assert.strictEqual(data.code, 'INTERNAL_LEAK');
      assert(!JSON.stringify(data).includes('Raw internal credentials leaked'));
      assert.strictEqual(data.stack, undefined);
    });

    // 5. Runtime Test: DB SQL error sanitization
    await test('4. Runtime Test: Database rejection yields sanitized 500 without leaking SQL', async () => {
      const res = await fetch(`${baseUrl}/test/db-rejection`);
      assert.strictEqual(res.status, 500);
      const data: any = await res.json();
      assert.strictEqual(data.error, 'An internal server error occurred. Please contact system support.');
      assert.strictEqual(data.code, 'ER_BAD_FIELD_ERROR');
      assert(!JSON.stringify(data).includes('secret_totp_key'));
      assert(!JSON.stringify(data).includes('field list'));
      assert.strictEqual(data.stack, undefined);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(`\n==========================================`);
  console.log(`Async Error Handling Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`==========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
