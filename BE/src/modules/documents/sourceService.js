import { sourceRepository } from '../conversations/sourceRepository.js';
import { studyAssistantRepository } from '../shared/repository.js';
import { cloudBuffer } from '../../integrations/cloudinary.js';
export function sourceService(pool, config) {
  return {
    async chunk(owner, documentId, chunkId) {
      const rows = await studyAssistantRepository(pool).chunks(owner, documentId);
      const ch = rows.find((c) => String(c.ma_doan_tai_lieu) === chunkId);
      return ch;
    },
    async formula(owner, ids) {
      await studyAssistantRepository(pool).conversation(owner, ids.conversationId);
      const [rows] = await sourceRepository.answerPayload(pool, [ids.turnId, ids.conversationId]);
      const payload = rows[0]?.noi_dung_tra_loi;
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      const block = data?.blocks?.find((b) => b.id === ids.blockId);
      if (!block?.cloudImage) return null;
      const a = block.cloudImage,
        bytes = await cloudBuffer(config, {
          public_id: a.publicId,
          resource_type: 'image',
          format: a.format || 'png',
          cloud_name: config.CLOUDINARY_CLOUD_NAME,
          state: 'uploaded',
          sha256: a.sha256,
          size_bytes: a.sizeBytes,
        });
      return bytes;
    },
  };
}
