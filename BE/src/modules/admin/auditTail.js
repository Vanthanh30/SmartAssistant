import { open } from 'node:fs/promises';

// Read backwards so dashboard cost depends on the last records, not the entire audit history.
export async function readAuditTail(file, limit = 20, { openFile = open } = {}) {
  const handle = await openFile(file, 'r');
  try {
    let position = (await handle.stat()).size;
    const parts = [];
    while (position > 0) {
      const length = Math.min(position, 65536);
      position -= length;
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, position);
      parts.unshift(buffer.subarray(0, bytesRead));
      const lines = Buffer.concat(parts).toString('utf8').split('\n');
      // The first line can be partial, including a split UTF-8 code point.
      if (position > 0) lines.shift();
      const nonempty = lines.filter(Boolean);
      if (nonempty.length >= limit || position === 0) return nonempty.slice(-limit);
    }
    return [];
  } finally {
    await handle.close();
  }
}
