import { createHash } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';

export function learningFingerprint(input, snapshot, config) {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'hybrid-learning-v1',
        ...(input.topic || input.topics ? ['focused-practice-v2'] : []),
        config.LLM_PROVIDER,
        config.LLM_MODEL,
        config.GEMINI_THINKING_LEVEL,
        config.LLM_MAX_OUTPUT_TOKENS,
        input.kind,
        input.count,
        input.title || '',
        ...(input.topic ? ['topic', input.topic.normalize('NFC').toLocaleLowerCase('vi')] : []),
        ...(input.topics
          ? [
              'topics',
              [...input.topics]
                .map((value) => value.normalize('NFC').toLocaleLowerCase('vi'))
                .sort(),
            ]
          : []),
        ...(input.sessionId ? ['session', input.sessionId] : []),
        snapshot.documents,
        snapshot.sources.map((s) => [
          s.documentId,
          s.chunkId,
          s.chunkOrder,
          s.content,
          s.sourceStart,
          s.pageFrom,
          s.pageTo,
          s.pageMap,
          s.fileName,
        ]),
      ]),
    )
    .digest('hex');
}

export async function withLearningLock(pool, owner, fingerprint, work) {
  const db = await pool.getConnection();
  const name =
    'learning:' +
    createHash('sha256')
      .update(owner + ':' + fingerprint)
      .digest('hex')
      .slice(0, 48);
  let acquired = false;
  try {
    const [rows] = await db.execute('SELECT GET_LOCK(?,0) acquired', [name]);
    if (Number(rows[0]?.acquired) !== 1)
      throw new AppError(
        409,
        'LEARNING_IN_PROGRESS',
        'Bộ học cùng phạm vi đang được tạo. Vui lòng kiểm tra lại sau.',
      );
    acquired = true;
    return await work();
  } finally {
    try {
      if (acquired) await db.execute('SELECT RELEASE_LOCK(?)', [name]);
    } catch {
      db.destroy();
    } finally {
      db.release();
    }
  }
}
