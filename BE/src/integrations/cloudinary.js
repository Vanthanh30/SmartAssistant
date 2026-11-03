import { v2 as cloudinary } from 'cloudinary';
import { createHash } from 'node:crypto';
import { AppError } from '../shared/AppError.js';

export const cloudEnabled = (config) => !!config.CLOUDINARY_CLOUD_NAME;
const credentials = (config) => ({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});
export function cloudPublicId(config, key, kind) {
  const scope = createHash('sha256')
    .update(
      JSON.stringify([
        config.DB_HOST,
        config.DB_PORT,
        config.DB_NAME,
        ...(config.ARTIFACT_NAMESPACE ? [config.ARTIFACT_NAMESPACE] : []),
      ]),
    )
    .digest('hex')
    .slice(0, 20);
  return `study_assistant/${scope}/${kind}/${kind === 'avatars' ? key.replace(/\.webp$/, '') : key}`;
}
export async function uploadCloudAsset(config, asset, path) {
  if (!cloudEnabled(config) || asset.cloud_name !== config.CLOUDINARY_CLOUD_NAME)
    throw new AppError(
      503,
      'CLOUDINARY_NOT_CONFIGURED',
      'Cấu hình Cloudinary chưa phù hợp với tài nguyên.',
    );
  try {
    const result = await cloudinary.uploader.upload(path, {
      ...credentials(config),
      resource_type: asset.resource_type,
      type: 'authenticated',
      public_id: asset.public_id,
      overwrite: false,
      timeout: 60000,
    });
    if (
      result.public_id !== asset.public_id ||
      result.type !== 'authenticated' ||
      result.resource_type !== asset.resource_type ||
      Number(result.bytes) !== Number(asset.size_bytes)
    )
      throw new Error('CLOUDINARY_INVALID_RESPONSE');
  } catch {
    throw new AppError(
      503,
      'CLOUDINARY_UPLOAD_FAILED',
      'Không thể lưu file lên Cloudinary. Hệ thống sẽ thử lại trong giới hạn.',
    );
  }
}
export async function destroyCloudAsset(config, asset) {
  if (!cloudEnabled(config) || asset.cloud_name !== config.CLOUDINARY_CLOUD_NAME)
    throw new AppError(
      503,
      'CLOUDINARY_NOT_CONFIGURED',
      'Cấu hình Cloudinary chưa phù hợp với tài nguyên.',
    );
  try {
    const result = await cloudinary.uploader.destroy(asset.public_id, {
      ...credentials(config),
      resource_type: asset.resource_type,
      type: 'authenticated',
      invalidate: true,
      timeout: 60000,
    });
    if (!['ok', 'not found'].includes(result.result)) throw new Error('CLOUDINARY_DELETE_REJECTED');
  } catch {
    throw new AppError(503, 'CLOUDINARY_DELETE_FAILED', 'Chưa xóa được bản Cloudinary.');
  }
}
let activeDownloads = 0;
const downloadWaiters = [];
const verifiedImages = new Map();
let cachedImageBytes = 0;
async function acquireDownload(signal) {
  signal?.throwIfAborted();
  if (activeDownloads < 4) {
    activeDownloads++;
    return;
  }
  if (downloadWaiters.length >= 32)
    throw new AppError(503, 'CLOUD_DOWNLOAD_BUSY', 'Kho đám mây đang bận. Hãy thử lại.');
  await new Promise((resolve, reject) => {
    const waiter = {
      resolve: () => {
        cleanup();
        resolve();
      },
    };
    const abort = () => {
      const index = downloadWaiters.indexOf(waiter);
      if (index >= 0) downloadWaiters.splice(index, 1);
      cleanup();
      reject(new AppError(503, 'CLOUD_DOWNLOAD_BUSY', 'Chờ tải ảnh quá thời gian. Hãy thử lại.'));
    };
    const timer = setTimeout(abort, 60000);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    };
    signal?.addEventListener('abort', abort, { once: true });
    downloadWaiters.push(waiter);
  });
}
function releaseDownload() {
  const next = downloadWaiters.shift();
  if (next) next.resolve();
  else activeDownloads--;
}
export async function cloudBuffer(config, asset, signal) {
  if (
    !asset ||
    asset.state !== 'uploaded' ||
    !cloudEnabled(config) ||
    asset.cloud_name !== config.CLOUDINARY_CLOUD_NAME
  )
    throw new AppError(503, 'CLOUD_FILE_UNAVAILABLE', 'Bản Cloudinary chưa sẵn sàng.');
  const maxBytes =
    asset.resource_type === 'image' ? 2 * 1024 ** 2 : config.MAX_UPLOAD_MB * 1024 ** 2;
  if (
    (asset.resource_type !== 'image' && !Number.isSafeInteger(Number(asset.size_bytes))) ||
    (asset.size_bytes != null && Number(asset.size_bytes) > maxBytes)
  )
    throw new AppError(503, 'CLOUD_DOWNLOAD_BUSY', 'Kho đám mây đang bận hoặc file vượt giới hạn.');
  const cacheKey =
    asset.sha256 && Number(asset.size_bytes) > 0 && Number(asset.size_bytes) <= 8 * 1024 ** 2
      ? JSON.stringify([
          asset.cloud_name,
          asset.public_id,
          asset.resource_type,
          asset.format || '',
          asset.sha256,
          asset.size_bytes,
        ])
      : null;
  const cached = cacheKey && verifiedImages.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.bytes;
  await acquireDownload(signal);
  try {
    const url = cloudinary.utils.private_download_url(
      asset.public_id,
      asset.resource_type === 'image' ? asset.format || 'webp' : null,
      {
        ...credentials(config),
        resource_type: asset.resource_type,
        type: 'authenticated',
        secure: true,
      },
    );
    const response = await fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
      redirect: 'error',
    });
    if (!response.ok || !response.body) throw new Error('DOWNLOAD_FAILED');
    const parts = [];
    let size = 0;
    const hash = createHash('sha256');
    for await (const chunk of response.body) {
      size += chunk.length;
      if ((asset.size_bytes != null && size > Number(asset.size_bytes)) || size > maxBytes)
        throw new Error('SIZE_MISMATCH');
      hash.update(chunk);
      parts.push(chunk);
    }
    if (
      (asset.size_bytes != null && size !== Number(asset.size_bytes)) ||
      (asset.sha256 && hash.digest('hex') !== asset.sha256)
    )
      throw new Error('INTEGRITY_FAILED');
    const bytes = Buffer.concat(parts, size);
    if (cacheKey) {
      // Only integrity-verified private files; callers still authorize each request.
      if (verifiedImages.has(cacheKey)) {
        cachedImageBytes -= verifiedImages.get(cacheKey).bytes.length;
        verifiedImages.delete(cacheKey);
      }
      while (cachedImageBytes + size > 32 * 1024 ** 2 || verifiedImages.size >= 64) {
        const key = verifiedImages.keys().next().value;
        if (!key) break;
        cachedImageBytes -= verifiedImages.get(key).bytes.length;
        verifiedImages.delete(key);
      }
      verifiedImages.set(cacheKey, {
        bytes,
        expires: Date.now() + (asset.resource_type === 'raw' ? 300000 : 60000),
      });
      cachedImageBytes += size;
    }
    return bytes;
  } catch {
    throw new AppError(
      503,
      'CLOUDINARY_DOWNLOAD_FAILED',
      'Không đọc được file Cloudinary hợp lệ; không dùng bản local thay thế.',
    );
  } finally {
    releaseDownload();
  }
}
export async function uploadCloudBuffer(config, asset, buffer) {
  if (!cloudEnabled(config) || asset.cloud_name !== config.CLOUDINARY_CLOUD_NAME)
    throw new AppError(503, 'CLOUDINARY_NOT_CONFIGURED', 'Cần cấu hình Cloudinary.');
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          ...credentials(config),
          resource_type: asset.resource_type,
          type: 'authenticated',
          public_id: asset.public_id,
          overwrite: false,
          timeout: 60000,
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
      stream.on('error', reject);
      stream.end(buffer);
    });
    if (
      result.public_id !== asset.public_id ||
      result.type !== 'authenticated' ||
      result.resource_type !== asset.resource_type ||
      Number(result.bytes) !== Number(asset.size_bytes)
    )
      throw new Error('INVALID_RESPONSE');
    // Verify the private persisted original, including hash, before announcing uploaded.
    await cloudBuffer(config, { ...asset, state: 'uploaded' });
  } catch {
    throw new AppError(
      503,
      'CLOUDINARY_UPLOAD_FAILED',
      'Không lưu/kiểm chứng được Cloudinary. Hãy thử tải lại, không có bản local dự phòng.',
    );
  }
}
