// Local operator diagnostic only: no public retrieval API or chat flow in F05.
import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/config/db.js';
import { retrievalService } from '../src/rag/retrieval.js';
const [owner, course, query] = process.argv.slice(2);
if (!/^[1-9][0-9]*$/.test(owner ?? '') || !/^[1-9][0-9]*$/.test(course ?? '') || !query?.trim()) {
  console.error('Usage: node BE/scripts/search-source.js <userId> <courseId> "question"'); process.exitCode = 1;
} else {
  const config = loadConfig(); const pool = createPool(config);
  try {
    const results = await retrievalService(pool, config)(owner, course, query, 5);
    console.log(JSON.stringify(results, null, 2));
  } catch (error) { console.error(error.code ?? 'SOURCE_SEARCH_FAILED'); process.exitCode = 1; }
  finally { await pool.end(); }
}
