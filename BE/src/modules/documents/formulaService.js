import { renderFormulaCrop } from '../../rag/formulaCrop.js';
import { createHash } from 'node:crypto';
import { cloudBuffer, cloudPublicId, uploadCloudBuffer } from '../../integrations/cloudinary.js';
import { AppError } from '../../shared/AppError.js';
import { documentService } from './service.js';
import { artifactStore } from '../shared/artifacts.js';
import { studyAssistantRepository } from '../shared/repository.js';
export async function persistFormulaImages(pool, config, owner, blocks) {
  const documents = documentService(pool, config),
    cache = new Map(),
    files = artifactStore(config);
  if (blocks.filter((b) => b.type === 'formula_image').length > 16)
    throw new AppError(
      422,
      'TOO_MANY_FORMULAS',
      'Hãy hỏi phạm vi hẹp hơn để hiển thị công thức đầy đủ.',
    );
  for (const block of blocks) {
    if (block.type !== 'formula_image') continue;
    if (!block.source)
      throw new AppError(
        422,
        'FORMULA_SOURCE_MISSING',
        'Không định vị được công thức trong nguồn.',
      );
    const id = block.source.documentId;
    const document = await studyAssistantRepository(pool).document(owner, id, true);
    const key =
      'formula-v5_' +
      createHash('sha256')
        .update(
          JSON.stringify([id, document.ma_bam_tap_tin, config.CLOUDINARY_CLOUD_NAME, block.source]),
        )
        .digest('hex');
    const cached = document.ma_bam_tap_tin && (await files.read('requests', key));
    if (
      cached?.sha256 &&
      cached?.publicId &&
      cached?.format === 'png' &&
      cached.sizeBytes > 0 &&
      cached.sizeBytes <= 2 * 1024 ** 2
    ) {
      block.cloudImage = cached;
      continue;
    }
    if (!cache.has(id)) cache.set(id, (await documents.content(owner, id)).buffer);
    const crop = await renderFormulaCrop(cache.get(id), block.source, document.ma_bam_tap_tin);
    const sha = createHash('sha256').update(crop.bytes).digest('hex'),
      publicId = cloudPublicId(config, sha, 'formulas'),
      asset = {
        public_id: publicId,
        resource_type: 'image',
        format: 'png',
        cloud_name: config.CLOUDINARY_CLOUD_NAME,
        size_bytes: crop.bytes.length,
        sha256: sha,
      };
    let stored = false;
    try {
      await cloudBuffer(config, { ...asset, state: 'uploaded' });
      stored = true;
    } catch {
      /* upload then verify the private original */
    }
    if (!stored) await uploadCloudBuffer(config, asset, crop.bytes);
    block.cloudImage = {
      publicId,
      format: 'png',
      sha256: sha,
      sizeBytes: crop.bytes.length,
      page: crop.page,
      region: crop.region,
    };
    if (document.ma_bam_tap_tin) await files.write('requests', key, block.cloudImage);
  }
  return blocks;
}
