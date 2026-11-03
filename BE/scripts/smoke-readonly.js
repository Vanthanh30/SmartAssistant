import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/config/db.js';

// Do not import server.js: normal startup runs recovery jobs that can update existing records.
let pool, server;
try {
  const config = loadConfig();
  if (
    config.NODE_ENV !== 'development' ||
    !['localhost', '127.0.0.1', '::1'].includes(config.DB_HOST)
  )
    throw new Error('LOCAL_DEVELOPMENT_REQUIRED');
  pool = createPool(config);
  server = createApp(pool, config).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const checks = [];
  for (const [path, status, code] of [
    ['/api/v1/health/live', 200],
    ['/api/v1/health/ready', 200],
    ['/api/v1/courses', 401, 'SESSION_EXPIRED'],
    ['/api/v1/regression-nonexistent', 404, 'NOT_FOUND'],
  ]) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    assert.equal(response.status, status, path);
    assert.equal(body.requestId, response.headers.get('x-request-id'), path);
    if (code) assert.equal(body.error.code, code, path);
    else assert.equal(body.data.status, 'ok', path);
    checks.push({ path, status, passed: true });
  }
  console.log(
    JSON.stringify({ readOnly: true, realLocalMySql: true, recoveryStarted: false, checks }),
  );
} catch (error) {
  // Keep credentials and response bodies out of smoke-test logs.
  console.error(JSON.stringify({ readOnly: true, passed: false, code: error.code || error.name }));
  process.exitCode = 1;
} finally {
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
  await pool?.end();
}
