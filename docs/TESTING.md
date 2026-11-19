# Running the tests

The automated tests write to a database: they create organizations, users, assets and
audit entries, then delete them. They must **never** run against the live database
(`it_asset_ledger`, used by the deployed app). They use a separate test database instead.

## How tests are kept away from production

- With `NODE_ENV=test` (every `npm test` / `test:*` script), `server/config.ts` loads
  **only `.env.test`**. It never reads `.env`, so the production credentials are not loaded.
- Any test process, and `npm run db:migrate:test`, refuses to start when the configured
  database is production:
  - the schema is `it_asset_ledger`, or
  - the host and schema are the same as in `.env`.
  `server/db.ts` repeats this check before it opens a connection pool.
- The test schema name must end in `_test` or `_dev` and must not contain `prod`.
- `npm test` first runs `npm run test:check-db`. That check stops the run if no test
  database is configured, and prints the host and schema the tests will use.
- Tests that call the HTTP API always start their own in-process server on a random
  port. They never reuse a server already running on `:3001`, which might be a dev
  server connected to production.
- Tests work only inside organizations they seed themselves (`seedTestTenant` in
  `tests/helpers.ts`, or fixed `test-…` / `org-…-test` ids), and delete them afterwards.
  No test uses `org-omnitech`.

## One-time setup

1. **Start a local TiDB** (needs Docker). It listens only on localhost, port 4001:

   ```powershell
   docker run -d --name omniasset-test-tidb -p 127.0.0.1:4001:4000 pingcap/tidb:v8.5.1
   ```

   After a reboot, start it again with `docker start omniasset-test-tidb`.

   You can use any other MySQL-compatible server instead, for example a separate TiDB
   Cloud cluster, or a schema such as `it_asset_ledger_test` on another cluster. Set
   `TIDB_SSL=true` for a remote server.

2. **Create `.env.test`** from the example. Then fill in the three secrets with fresh
   values. Do not copy the production ones.

   ```powershell
   Copy-Item .env.test.example .env.test
   ```

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   `.env.test` is git-ignored. You can also set `TEST_DATABASE_URL`
   (`mysql://user:pass@host:port/schema`), which overrides the `TIDB_*` values.

3. **Create the schema** by running every migration in `migrations/` against the test
   database. It is safe to run this again; applied migrations are skipped.

   ```powershell
   npm run db:migrate:test
   ```

   `npm run db:status:test` lists the migrations that have been applied.

## Running

```powershell
npm test
```

A single suite, for example:

```powershell
npm run test:facilities
```

After you pull new migrations, run `npm run db:migrate:test` again.

## Starting from scratch

```powershell
docker rm -f omniasset-test-tidb
```

Then repeat steps 1 and 3.
