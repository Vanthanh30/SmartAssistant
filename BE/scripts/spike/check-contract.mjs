import SwaggerParser from '@apidevtools/swagger-parser';
import { fileURLToPath } from 'node:url';
import { writeFile, mkdir } from 'node:fs/promises';
const path = fileURLToPath(new URL('../../../docs/api.openapi.yaml', import.meta.url));
const out = new URL('../../../docs/evidence/openapi-validation.json', import.meta.url);
try {
  const api = await SwaggerParser.validate(path);
  const internal = await SwaggerParser.validate(fileURLToPath(new URL('../../../docs/rag.openapi.json', import.meta.url)));
  const operations = Object.values(api.paths).flatMap(path => Object.entries(path)
    .filter(([key]) => ['get', 'post', 'patch', 'delete'].includes(key)).map(([, value]) => value));
  const ids = operations.map(op => op.operationId);
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate operationId');
  const report = { status: 'passed', validator: '@apidevtools/swagger-parser@12.1.0',
    openapi: api.openapi, paths: Object.keys(api.paths).length, operations: operations.length,
    implementedOperations: operations.filter(op => op['x-implementation-status'] === 'implemented').length,
    internalRagHealthOperations: Object.keys(internal.paths).length,
    limitation: 'Schema validation only. Sprint04 document/worker runtime and regression tests NOT RUN by user request; earlier sprint reports are historical, not evidence for the current code. Later-sprint endpoints remain planned' };
  await mkdir(new URL('../../../docs/evidence/', import.meta.url), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} catch (error) { console.error(error.message); process.exitCode = 1; }
