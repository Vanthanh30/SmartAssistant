import { recoveryRepository } from './recoveryRepository.js';
// No durable queue: only mark requests orphaned after their course lock is free.
export async function recoverInterruptedDocumentProcessing(pool) {
  const [rows] = await recoveryRepository.processingDocuments(pool);
  for (const row of rows) {
    const db = await pool.getConnection(),
      name = 'erd16-pdf-course-' + row.ma_mon_hoc;
    let locked = false;
    try {
      locked = Number((await recoveryRepository.acquirePdfLock(db, [name]))[0][0].n) === 1;
      if (locked) await recoveryRepository.failDocument(db, [row.ma_tai_lieu]);
    } finally {
      if (locked) await recoveryRepository.releasePdfLock(db, [name]);
      db.release();
    }
  }
}
export async function recoverInterruptedConversationReplies(pool) {
  const [rows] = await recoveryRepository.processingConversations(pool);
  for (const row of rows) {
    const db = await pool.getConnection(),
      name = 'erd16-chat-' + row.ma_hoi_thoai;
    let locked = false;
    try {
      locked = Number((await recoveryRepository.acquireChatLock(db, [name]))[0][0].n) === 1;
      if (locked) await recoveryRepository.failConversation(db, [row.ma_hoi_thoai]);
    } finally {
      if (locked) await recoveryRepository.releaseChatLock(db, [name]);
      db.release();
    }
  }
}
