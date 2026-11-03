import { dto } from './mapper.js';
import { documentRepository } from './repository.js';
import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../../shared/AppError.js';
import { studyAssistantRepository, atomic, json } from '../shared/repository.js';
import { artifactStore } from '../shared/artifacts.js';
import { writePendingPdf, readPendingPdf, removePendingPdf } from '../../jobs/pendingPdf.js';
import { startPdfExtraction } from '../../rag/pdfExtractor.js';
import { ragClient } from '../../rag/client.js';
import {
  cloudBuffer,
  cloudPublicId,
  uploadCloudBuffer,
  destroyCloudAsset,
} from '../../integrations/cloudinary.js';
import { assertActiveActor } from '../auth/service.js';
import { withOwnerLock } from '../studyCalendar/locks.js';
export function documentService(
  pool,
  config,
  {
    call = ragClient(config),
    extract = startPdfExtraction,
    download = cloudBuffer,
    upload = uploadCloudBuffer,
    destroy = destroyCloudAsset,
  } = {},
) {
  const files = artifactStore(config),
    repo = studyAssistantRepository(pool);

  async function bytes(d, signal) {
    const meta = json(d.cau_hinh_xu_ly);
    return d.dinh_danh_dam_may
      ? download(
          config,
          {
            public_id: d.dinh_danh_dam_may,
            cloud_name: config.CLOUDINARY_CLOUD_NAME,
            resource_type: 'raw',
            state: 'uploaded',
            sha256: d.ma_bam_tap_tin,
            size_bytes: meta.sizeBytes,
          },
          signal,
        )
      : readPendingPdf(config, meta.pendingKey);
  }
  async function locked(owner, id, work) {
    const db = await pool.getConnection();
    let name,
      acquired = false;
    try {
      const d = await studyAssistantRepository(db).document(owner, id);
      name = `erd16-pdf-course-${d.ma_mon_hoc}`;
      acquired = Number((await documentRepository.acquireCourseLock(db, [name]))[0][0].n) === 1;
      if (!acquired) throw new AppError(409, 'PDF_BUSY', 'Môn học đang xử lý tài liệu.');
      return await work(db, d);
    } finally {
      if (acquired) await documentRepository.releaseCourseLock(db, [name]);
      db.release();
    }
  }
  async function rebuild(db, owner, course, include) {
    const [docs] = await documentRepository.indexDocuments(db, [owner, course, include || '0']);
    const keys = [...new Set(docs.map((d) => json(d.cau_hinh_xu_ly)?.vectorKey).filter(Boolean))];
    if (!keys.length) {
      await files.write('indexes', `${owner}_${course}`, null);
      return;
    }
    const built = await call('/indexes/build', {
      owner: String(owner),
      course: String(course),
      keys,
    });
    if (
      !Array.isArray(built.positions) ||
      built.positions.some((p) => !/^\d+$/.test(p.chunkId) || !Number.isSafeInteger(p.position))
    )
      throw new AppError(502, 'INDEX_MAPPING_INVALID', 'Chỉ mục thiếu ánh xạ đoạn.');
    await db.beginTransaction();
    try {
      for (const p of built.positions)
        await documentRepository.updateIndexPositions(db, [
          built.manifestKey,
          p.position,
          p.chunkId,
          course,
        ]);
      await db.commit();
    } catch (e) {
      await db.rollback();
      throw e;
    }
    await files.write('indexes', `${owner}_${course}`, {
      ...built,
      schemaVersion: 16,
      chunkIds: built.positions.map((p) => p.chunkId),
    });
  }
  return {
    dto,
    bytes,
    rebuild,
    async get(owner, id) {
      return dto(await repo.document(owner, id));
    },
    async list(owner, course, f) {
      await repo.course(owner, course);
      const [[count]] = await documentRepository.countCourseDocuments(pool, [course]);
      const [rows] = await documentRepository.listCourseDocuments(pool, [
        course,
        f.pageSize,
        (f.page - 1) * f.pageSize,
      ]);
      return {
        data: await Promise.all(rows.map(dto)),
        meta: {
          ...f,
          total: Number(count.n),
          limits: {
            maxFileBytes: config.MAX_UPLOAD_MB * 1024 ** 2,
            maxDocumentsPerCourse: config.MAX_DOCUMENTS_PER_COURSE,
            maxCourseBytes: config.MAX_COURSE_STORAGE_MB * 1024 ** 2,
            maxUserBytes: config.MAX_USER_STORAGE_MB * 1024 ** 2,
          },
        },
      };
    },
    async upload(actor, course, file) {
      await repo.course(actor.user.id, course);
      if (!file?.buffer?.length || file.buffer.subarray(0, 5).toString() !== '%PDF-')
        throw new AppError(422, 'INVALID_PDF', 'Chọn PDF hợp lệ.');
      const sha256 = createHash('sha256').update(file.buffer).digest('hex');
      const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const original =
        [...file.originalname].every((c) => c.charCodeAt(0) <= 255) && !decoded.includes('\ufffd')
          ? decoded
          : file.originalname;
      const name = original
        .split(/[\\/]/)
        .at(-1)
        .normalize('NFC')
        .split('')
        .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
        .join('')
        .trim();
      if (!name || name.length > 255)
        throw new AppError(422, 'INVALID_FILENAME', 'Tên tài liệu tối đa 255 ký tự.');
      return withOwnerLock(pool, actor.user.id, async (db) => {
        await db.beginTransaction();
        let key,
          committed = false;
        try {
          await assertActiveActor(db, config, actor, 'student');
          await studyAssistantRepository(db).course(actor.user.id, course);
          const [owned] = await documentRepository.ownerDocuments(db, [actor.user.id]);
          const duplicate = owned.find(
            (d) => String(d.ma_mon_hoc) === course && d.ma_bam_tap_tin === sha256,
          );
          if (duplicate) {
            await db.commit();
            return {
              ...(await dto(duplicate)),
              documentId: String(duplicate.ma_tai_lieu),
              duplicate: true,
              processRequired: duplicate.trang_thai !== 'sẵn sàng',
            };
          }
          if (
            owned.length > 5000 ||
            owned.filter((d) => String(d.ma_mon_hoc) === course).length >=
              config.MAX_DOCUMENTS_PER_COURSE
          )
            throw new AppError(422, 'DOCUMENT_LIMIT', 'Môn học đã đạt giới hạn tài liệu.');
          const size = (d) => Number(json(d.cau_hinh_xu_ly)?.sizeBytes || 0);
          if (
            owned.reduce((n, d) => n + size(d), 0) + file.buffer.length >
              config.MAX_USER_STORAGE_MB * 1024 ** 2 ||
            owned.filter((d) => String(d.ma_mon_hoc) === course).reduce((n, d) => n + size(d), 0) +
              file.buffer.length >
              config.MAX_COURSE_STORAGE_MB * 1024 ** 2
          )
            throw new AppError(422, 'STORAGE_LIMIT', 'Vượt dung lượng lưu trữ cho phép.');
          key = randomUUID() + '.pdf';
          await writePendingPdf(config, key, file.buffer);
          const meta = {
            schemaVersion: 16,
            pendingKey: key,
            sha256,
            sizeBytes: file.buffer.length,
            resourceType: 'raw',
          };
          const [r] = await documentRepository.insertDocument(db, [
            course,
            name,
            sha256,
            JSON.stringify(meta),
          ]);
          await db.commit();
          committed = true;
          return {
            ...(await this.get(actor.user.id, String(r.insertId))),
            documentId: String(r.insertId),
            processRequired: true,
          };
        } catch (e) {
          await db.rollback();
          if (key && !committed) await removePendingPdf(config, key).catch(() => {});
          throw e;
        }
      });
    },
    async restoreIndex(actor, course) {
      await repo.course(actor.user.id, course);
      const db = await pool.getConnection(),
        name = 'erd16-pdf-course-' + course;
      let locked = false;
      try {
        locked = Number((await documentRepository.acquireUploadLock(db, [name]))[0][0].n) === 1;
        if (!locked) throw new AppError(409, 'PDF_BUSY', 'Môn học đang xử lý tài liệu.');
        await assertActiveActor(db, config, actor, 'student');
        const [[ready]] = await documentRepository.countReadyDocuments(db, [course]);
        if (!Number(ready.n))
          throw new AppError(
            422,
            'NO_READY_DOCUMENT',
            'Chưa có tài liệu sẵn sàng để khôi phục tìm kiếm.',
          );
        await rebuild(db, actor.user.id, course);
        return { restored: true, documentCount: Number(ready.n) };
      } finally {
        if (locked) await documentRepository.releaseUploadLock(db, [name]);
        db.release();
      }
    },
    async content(owner, id) {
      const d = await repo.document(owner, id, true),
        buffer = await bytes(d, AbortSignal.timeout(config.PDF_PROCESS_TIMEOUT_MS));
      return { buffer, size: buffer.length, name: d.ten_tai_lieu };
    },
    async process(actor, id) {
      return locked(actor.user.id, id, async (db, d) => {
        if (d.trang_thai === 'sẵn sàng') return dto(d);
        if (d.trang_thai === 'đang xóa')
          throw new AppError(409, 'DOCUMENT_DELETING', 'Tài liệu đang xóa.');
        const signal = AbortSignal.timeout(config.PDF_PROCESS_TIMEOUT_MS),
          meta = json(d.cau_hinh_xu_ly);
        let thread;
        const stage = async (name) => {
          meta.processing = { stage: name };
          await documentRepository.saveProcessingConfig(db, [JSON.stringify(meta), id]);
        };
        try {
          await assertActiveActor(db, config, actor, 'student');
          await documentRepository.markProcessing(db, [id]);
          await stage('trích xuất');
          const buffer = await bytes(d, signal);
          thread =
            meta.extraction?.sourceSha256 === d.ma_bam_tap_tin
              ? {
                  promise: Promise.resolve(meta.extraction),
                  cancel: async () => {},
                }
              : extract(
                  buffer,
                  {
                    id,
                    original_name: d.ten_tai_lieu,
                    sha256: d.ma_bam_tap_tin,
                  },
                  config,
                );
          const abort = () => void thread.cancel();
          signal.addEventListener('abort', abort, { once: true });
          try {
            meta.extraction = await thread.promise;
          } finally {
            signal.removeEventListener('abort', abort);
          }
          signal.throwIfAborted();
          if (!d.dinh_danh_dam_may) {
            const publicId = cloudPublicId(config, meta.pendingKey, 'pdfs');
            await upload(
              config,
              {
                public_id: publicId,
                resource_type: 'raw',
                cloud_name: config.CLOUDINARY_CLOUD_NAME,
                size_bytes: buffer.length,
                sha256: d.ma_bam_tap_tin,
              },
              buffer,
            );
            await documentRepository.saveCloudAsset(db, [publicId, id]);
          }
          await stage('chia đoạn');
          const prepared = await call(
            '/chunks',
            {
              documentId: String(id),
              sha256: d.ma_bam_tap_tin,
              pages: meta.extraction.pages.map(({ pageNumber, text }) => ({ pageNumber, text })),
            },
            signal,
          );
          meta.contract = prepared.contract;
          meta.extractor = meta.extraction.extractor;
          meta.extractorVersion = meta.extraction.extractorVersion;
          const assigned = [];
          await db.beginTransaction();
          try {
            await assertActiveActor(db, config, actor, 'student');
            for (const ch of prepared.chunks) {
              if (ch.windows.length !== 1)
                throw new AppError(
                  502,
                  'EMBEDDING_WINDOW_CONTRACT',
                  'Mỗi đoạn phải có một biểu diễn.',
                );
              const position = {
                schemaVersion: 16,
                sourceStart: ch.start,
                sourceEnd: ch.end,
                pageMap: ch.pageMap,
                ...(meta.extraction.layout
                  ? {
                      layoutVersion: meta.extraction.layoutVersion,
                      layoutWarnings: [
                        ...new Set(
                          meta.extraction.layout.pages
                            .filter((p) => p.pageNumber >= ch.pageFrom && p.pageNumber <= ch.pageTo)
                            .flatMap((p) => p.warnings),
                        ),
                      ],
                    }
                  : {}),
              };
              const hash = createHash('sha256')
                .update(ch.content.normalize('NFC').replace(/\s+/g, ' ').trim())
                .digest('hex');
              await documentRepository.upsertChunk(db, [
                id,
                ch.order,
                ch.content,
                hash,
                ch.pageFrom,
                ch.pageTo,
                JSON.stringify(position),
              ]);
              const [[row]] = await documentRepository.findChunkByOrder(db, [id, ch.order]);
              assigned.push({ ...ch, id: String(row.ma_doan_tai_lieu), hash });
            }
            const orders = assigned.map((ch) => ch.order),
              [obsolete] = await documentRepository.obsoleteVectors(db, [id, ...orders], orders);
            await documentRepository.deleteObsoleteChunks(db, [id, ...orders], orders);
            for (const row of obsolete)
              if (row.ma_vec_to)
                await documentRepository.deleteUnreferencedVector(db, [
                  row.ma_vec_to,
                  row.ma_vec_to,
                ]);
            await db.commit();
          } catch (e) {
            await db.rollback();
            throw e;
          }
          await stage('tạo biểu diễn');
          const embedded = await call(
            '/embed',
            {
              owner: String(d.ma_nguoi_dung),
              course: String(d.ma_mon_hoc),
              document: String(id),
              chunks: assigned.map((ch) => ({
                id: ch.id,
                windows: ch.windows,
              })),
            },
            signal,
          );
          if (JSON.stringify(embedded.contract) !== JSON.stringify(prepared.contract))
            throw new AppError(
              409,
              'EMBEDDING_CONTRACT_CHANGED',
              'Mô hình thay đổi trong lúc xử lý.',
            );
          meta.vectorKey = embedded.vectorKey;
          await stage('lập chỉ mục');
          await db.beginTransaction();
          try {
            for (const [position, ch] of assigned.entries()) {
              const [[old]] = await documentRepository.chunkVector(db, [ch.id]);
              const identity = createHash('sha256')
                .update(JSON.stringify([ch.hash, prepared.contract]))
                .digest('hex');
              if (old.ma_vec_to)
                await documentRepository.updateVector(db, [
                  identity,
                  prepared.contract.model,
                  embedded.vectorKey,
                  position,
                  old.ma_vec_to,
                ]);
              else {
                const [r] = await documentRepository.insertVector(db, [
                  identity,
                  prepared.contract.model,
                  embedded.vectorKey,
                  position,
                ]);
                await documentRepository.attachVector(db, [String(r.insertId), ch.id]);
              }
            }
            await db.commit();
          } catch (e) {
            await db.rollback();
            throw e;
          }
          await rebuild(db, d.ma_nguoi_dung, d.ma_mon_hoc, id);
          signal.throwIfAborted();
          meta.processing = null;
          await db.beginTransaction();
          await assertActiveActor(db, config, actor, 'student');
          await documentRepository.markReady(db, [
            meta.extraction.pages.length,
            JSON.stringify(meta),
            id,
          ]);
          await db.commit();
          await removePendingPdf(config, meta.pendingKey).catch(() => {});
          return this.get(actor.user.id, id);
        } catch (e) {
          await db.rollback();
          meta.processing = null;
          meta.lastError = e.code || 'PDF_PROCESS_FAILED';
          await documentRepository.markFailed(db, [JSON.stringify(meta), id]);
          throw e instanceof AppError
            ? e
            : new AppError(
                signal.aborted ? 504 : 422,
                'PDF_PROCESS_FAILED',
                e.code === 'PDF_NO_TEXT'
                  ? 'PDF không có lớp văn bản đọc được. Hệ thống chưa có OCR; hãy tải bản PDF có thể chọn hoặc sao chép chữ.'
                  : 'Chưa xử lý được PDF. Có thể thử lại thủ công.',
                { reason: signal.aborted ? 'timeout' : e.code || 'processing' },
              );
        } finally {
          if (thread) await thread.cancel();
        }
      });
    },
    async remove(actor, id) {
      return locked(actor.user.id, id, async (db, d) => {
        const actual = actor.originalActor || actor;
        await assertActiveActor(db, config, actual, actual.user.role);
        await documentRepository.markDeleting(db, [id]);
        await rebuild(db, d.ma_nguoi_dung, d.ma_mon_hoc);
        if (d.dinh_danh_dam_may)
          await destroy(config, {
            public_id: d.dinh_danh_dam_may,
            resource_type: 'raw',
            cloud_name: config.CLOUDINARY_CLOUD_NAME,
          });
        await atomic(pool, async (tx) => {
          await assertActiveActor(tx, config, actual, actual.user.role);
          await documentRepository.markDeleted(tx, [id]);
        });
        await removePendingPdf(config, json(d.cau_hinh_xu_ly).pendingKey).catch(() => {});
        return { documentId: String(id), status: 'deleted' };
      });
    },
  };
}
