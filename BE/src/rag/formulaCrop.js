import { Worker } from 'node:worker_threads';
import { AppError } from '../shared/AppError.js';

export function renderFormulaCrop(
  bytes,
  source,
  sha256,
  { WorkerImpl = Worker, timeoutMs = 30000 } = {},
) {
  return new Promise((resolve, reject) => {
    const failed = () =>
      new AppError(
        422,
        'FORMULA_CROP_FAILED',
        'Chưa định vị chắc chắn vùng công thức. Hãy mở trang nguồn.',
      );
    let worker;
    try {
      worker = new WorkerImpl(new URL('./formulaCropThread.js', import.meta.url), {
        workerData: { bytes, source, sha256 },
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      });
    } catch {
      return reject(failed());
    }
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        void Promise.resolve(worker.terminate()).catch(() => {});
      } catch {
        /* result already settled */
      }
      error ? reject(error) : resolve(result);
    };
    const timer = setTimeout(
      () => finish(new AppError(504, 'FORMULA_CROP_TIMEOUT', 'Tạo ảnh công thức quá thời gian.')),
      timeoutMs,
    );
    worker.once('message', (result) => {
      if (!result || typeof result !== 'object') return finish(failed());
      if (result.code === 'PDF_INTEGRITY_FAILED')
        return finish(new AppError(409, 'SOURCE_CHANGED', 'File PDF không khớp phiên bản nguồn.'));
      let data;
      try {
        data = result.bytes ? Buffer.from(result.bytes) : null;
      } catch {
        return finish(failed());
      }
      const region = result.region;
      if (
        !result.ok ||
        !data ||
        data.length > 2 * 1024 ** 2 ||
        data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
        !Number.isSafeInteger(result.page) ||
        result.page < source.pageFrom ||
        result.page > source.pageTo ||
        !region ||
        !['left', 'top', 'width', 'height'].every((key) => Number.isFinite(region[key])) ||
        region.left < 0 ||
        region.top < 0 ||
        region.width <= 0 ||
        region.height <= 0
      )
        return finish(failed());
      finish(null, { ...result, bytes: data });
    });
    worker.once('error', () => finish(failed()));
    // A worker can exit normally without posting a result. That is still failure.
    worker.once('exit', () => {
      if (!settled) finish(failed());
    });
  });
}
