import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig } from '../src/config/env.js';
import { log } from '../src/config/logger.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const localPython = resolve(root, '../.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const python = process.env.PYTHON_BIN ?? (existsSync(localPython) ? localPython : 'python');
const mode = process.argv[2] ?? 'all';
const children = [];
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    if (child.connected) child.send({ type: 'shutdown' });
    else child.kill('SIGTERM');
  }
  for (let i = 0; i < 100 && children.some(c => c.exitCode === null && c.signalCode === null); i++) await delay(100);
  for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  log('launcher', 'stopped', { code }); process.exit(code);
}
function start(name, command, args, ipc = false) {
  const child = spawn(command, args, { cwd: root, env: process.env, windowsHide: true,
    stdio: ipc ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  createInterface({ input: child.stdout }).on('line', line => process.stdout.write(`[${name}] ${line}\n`));
  createInterface({ input: child.stderr }).on('line', line => process.stderr.write(`[${name}] ${line}\n`));
  child.on('error', error => { log('launcher', 'spawn-failed', { process: name, code: error.code }); void shutdown(1); });
  child.on('exit', code => { if (!stopping) { log('launcher', 'child-exited', { child: name, code }); void shutdown(1); } });
  log('launcher', 'spawned', { child: name, pid: child.pid });
  return child;
}
async function health(url, headers = {}) {
  for (let i = 0; i < 120 && !stopping; i++) {
    try { const response = await fetch(url, { headers, signal: AbortSignal.timeout(1500) }); if (response.ok) return; } catch { /* startup wait */ }
    await delay(500);
  }
  throw new Error('Dependency readiness timeout');
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void shutdown());
process.on('message', message => { if (message?.type === 'shutdown') void shutdown(); });
if (process.send) process.on('disconnect', () => void shutdown());
try {
  if (!['all', 'rag'].includes(mode)) throw new Error('Unknown launcher mode');
  if (mode === 'rag') start('rag', python, ['rag-service/run.py']);
  else {
    const config = loadConfig();
    if (!process.env.RAG_SERVICE_TOKEN || process.env.RAG_SERVICE_TOKEN.length < 32 || process.env.RAG_SERVICE_TOKEN.startsWith('replace_')) throw new Error('Invalid env: RAG_SERVICE_TOKEN');
    const ragPort = Number(process.env.RAG_PORT ?? 8001);
    if (!Number.isInteger(ragPort) || ragPort < 1 || ragPort > 65535 || ragPort === config.PORT) throw new Error('Invalid env: RAG_PORT');
    // API PORT must not leak into Python's distinct RAG port.
    process.env.RAG_PORT = String(ragPort);
    process.env.RAG_SERVICE_URL = `http://127.0.0.1:${ragPort}`;
    start('rag', python, ['rag-service/run.py']);
    const worker = start('worker', process.execPath, ['src/jobs/worker.js'], true);
    const workerReady = new Promise((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker readiness timeout')), 60000);
      worker.on('message', message => { if (message?.type === 'ready') { clearTimeout(timer); resolveReady(); } });
      worker.on('exit', () => { clearTimeout(timer); reject(new Error('Worker exited before readiness')); });
    });
    start('api', process.execPath, ['src/server.js'], true);
    await Promise.all([workerReady, health(`http://127.0.0.1:${config.PORT}/api/v1/health/ready`),
      health(`http://127.0.0.1:${ragPort}/health/ready`, { 'X-Service-Token': process.env.RAG_SERVICE_TOKEN })]);
    log('launcher', 'ready', { scope: 'runtime-and-pdf-extraction', indexingImplemented: false });
    process.send?.({ type: 'ready' });
  }
} catch (error) { log('launcher', 'startup-failed', { reason: error.message }); await shutdown(1); }
