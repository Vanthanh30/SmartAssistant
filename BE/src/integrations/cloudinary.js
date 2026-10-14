import { v2 as cloudinary } from "cloudinary";
import { createHash } from "node:crypto";
import { AppError } from "../shared/AppError.js";

export const cloudEnabled = (config) => !!config.CLOUDINARY_CLOUD_NAME;
const credentials = (config) => ({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});
export function cloudPublicId(config, key, kind) {
  const scope = createHash("sha256")
    .update(JSON.stringify([config.DB_HOST, config.DB_PORT, config.DB_NAME]))
    .digest("hex")
    .slice(0, 20);
  return `study_assistant/${scope}/${kind}/${kind === "avatars" ? key.replace(/\.webp$/, "") : key}`;
}
export async function enqueueCloudAsset(
  db,
  config,
  { key, owner, documentId = null, size, sha256 },
) {
  if (!cloudEnabled(config))
    throw new AppError(
      503,
      "CLOUDINARY_NOT_CONFIGURED",
      "Cần cấu hình Cloudinary để lưu tài liệu/ảnh.",
    );
  await db.execute(
    "INSERT INTO cloud_assets(public_id,cloud_name,resource_type,storage_key,user_id,document_id,size_bytes,sha256) VALUES(?,?,?,?,?,?,?,?)",
    [
      cloudPublicId(config, key, documentId ? "documents" : "avatars"),
      config.CLOUDINARY_CLOUD_NAME,
      documentId ? "raw" : "image",
      key,
      owner,
      documentId,
      size,
      sha256,
    ],
  );
  await db.execute(
    "UPDATE cloud_assets SET state='uploading',locked_until=TIMESTAMPADD(SECOND,120,UTC_TIMESTAMP(3)) WHERE public_id=?",
    [cloudPublicId(config, key, documentId ? "documents" : "avatars")],
  );
}
export async function uploadCloudAsset(config, asset, path) {
  if (
    !cloudEnabled(config) ||
    asset.cloud_name !== config.CLOUDINARY_CLOUD_NAME
  )
    throw new AppError(
      503,
      "CLOUDINARY_NOT_CONFIGURED",
      "Cấu hình Cloudinary chưa phù hợp với tài nguyên.",
    );
  try {
    const result = await cloudinary.uploader.upload(path, {
      ...credentials(config),
      resource_type: asset.resource_type,
      type: "authenticated",
      public_id: asset.public_id,
      overwrite: false,
      timeout: 60000,
    });
    if (
      result.public_id !== asset.public_id ||
      result.type !== "authenticated" ||
      result.resource_type !== asset.resource_type ||
      Number(result.bytes) !== Number(asset.size_bytes)
    )
      throw new Error("CLOUDINARY_INVALID_RESPONSE");
  } catch {
    throw new AppError(
      503,
      "CLOUDINARY_UPLOAD_FAILED",
      "Không thể lưu file lên Cloudinary. Hệ thống sẽ thử lại trong giới hạn.",
    );
  }
}
export async function destroyCloudAsset(config, asset) {
  if (
    !cloudEnabled(config) ||
    asset.cloud_name !== config.CLOUDINARY_CLOUD_NAME
  )
    throw new AppError(
      503,
      "CLOUDINARY_NOT_CONFIGURED",
      "Cấu hình Cloudinary chưa phù hợp với tài nguyên.",
    );
  try {
    const result = await cloudinary.uploader.destroy(asset.public_id, {
      ...credentials(config),
      resource_type: asset.resource_type,
      type: "authenticated",
      invalidate: true,
      timeout: 60000,
    });
    if (!["ok", "not found"].includes(result.result))
      throw new Error("CLOUDINARY_DELETE_REJECTED");
  } catch {
    throw new AppError(
      503,
      "CLOUDINARY_DELETE_FAILED",
      "Chưa xóa được bản Cloudinary.",
    );
  }
}
let activeDownloads = 0;
export async function cloudBuffer(config, asset, signal) {
  if (
    !asset ||
    asset.state !== "uploaded" ||
    !cloudEnabled(config) ||
    asset.cloud_name !== config.CLOUDINARY_CLOUD_NAME
  )
    throw new AppError(
      503,
      "CLOUD_FILE_UNAVAILABLE",
      "Bản Cloudinary chưa sẵn sàng.",
    );
  const maxBytes =
    asset.resource_type === "image"
      ? 2 * 1024 ** 2
      : config.MAX_UPLOAD_MB * 1024 ** 2;
  if (
    !Number.isSafeInteger(Number(asset.size_bytes)) ||
    Number(asset.size_bytes) > maxBytes ||
    activeDownloads >= 4
  )
    throw new AppError(
      503,
      "CLOUD_DOWNLOAD_BUSY",
      "Kho đám mây đang bận hoặc file vượt giới hạn.",
    );
  activeDownloads++;
  try {
    const url = cloudinary.utils.private_download_url(
      asset.public_id,
      asset.resource_type === "image" ? "webp" : null,
      {
        ...credentials(config),
        resource_type: asset.resource_type,
        type: "authenticated",
        secure: true,
      },
    );
    const response = await fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
      redirect: "error",
    });
    if (!response.ok || !response.body) throw new Error("DOWNLOAD_FAILED");
    const parts = [];
    let size = 0;
    const hash = createHash("sha256");
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > Number(asset.size_bytes) || size > maxBytes)
        throw new Error("SIZE_MISMATCH");
      hash.update(chunk);
      parts.push(chunk);
    }
    if (
      size !== Number(asset.size_bytes) ||
      hash.digest("hex") !== asset.sha256
    )
      throw new Error("INTEGRITY_FAILED");
    return Buffer.concat(parts, size);
  } catch {
    throw new AppError(
      503,
      "CLOUDINARY_DOWNLOAD_FAILED",
      "Không đọc được file Cloudinary hợp lệ; không dùng bản local thay thế.",
    );
  } finally {
    activeDownloads--;
  }
}
export async function uploadCloudBuffer(config, asset, buffer) {
  if (
    !cloudEnabled(config) ||
    asset.cloud_name !== config.CLOUDINARY_CLOUD_NAME
  )
    throw new AppError(
      503,
      "CLOUDINARY_NOT_CONFIGURED",
      "Cần cấu hình Cloudinary.",
    );
  try {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          ...credentials(config),
          resource_type: asset.resource_type,
          type: "authenticated",
          public_id: asset.public_id,
          overwrite: false,
          timeout: 60000,
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
      stream.on("error", reject);
      stream.end(buffer);
    });
    if (
      result.public_id !== asset.public_id ||
      result.type !== "authenticated" ||
      result.resource_type !== asset.resource_type ||
      Number(result.bytes) !== Number(asset.size_bytes)
    )
      throw new Error("INVALID_RESPONSE");
    // Verify the private persisted original, including hash, before announcing uploaded.
    await cloudBuffer(config, { ...asset, state: "uploaded" });
  } catch {
    throw new AppError(
      503,
      "CLOUDINARY_UPLOAD_FAILED",
      "Không lưu/kiểm chứng được Cloudinary. Hãy thử tải lại, không có bản local dự phòng.",
    );
  }
}
