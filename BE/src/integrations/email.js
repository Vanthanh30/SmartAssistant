import nodemailer from "nodemailer";
import { AppError } from "../shared/AppError.js";
export const mailEnabled = (config) => !!config.SMTP_HOST;
export function mailTransport(config) {
  if (!mailEnabled(config))
    throw new AppError(503, "EMAIL_NOT_CONFIGURED", "Chưa cấu hình gửi email.");
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: !config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
}
export async function queueDocumentMail(db, id, status, config) {
  if (!mailEnabled(config)) return;
  const [rows] = await db.execute(
    "SELECT d.user_id,d.course_id,d.original_name,u.email FROM documents d JOIN users u ON u.id=d.user_id WHERE d.id=? AND u.status='active' AND d.deleted_at IS NULL",
    [id],
  );
  if (!rows.length) return;
  const row = rows[0];
  const ready = status === "ready";
  await db.execute(
    "INSERT IGNORE INTO mail_outbox(event_key,user_id,recipient,kind,subject,body) VALUES(?,?,?,?,?,?)",
    [
      `document:${id}:${status}`,
      row.user_id,
      row.email,
      "document",
      ready
        ? "Tài liệu đã sẵn sàng — Trợ lý học tập"
        : "Không thể xử lý tài liệu — Trợ lý học tập",
      `Tài liệu: ${row.original_name}\n${ready ? "Đã sẵn sàng để hỏi đáp, tạo quiz và flashcard." : "Xử lý chưa thành công. Mở môn học để xem trạng thái/lỗi và chọn tài liệu phù hợp."}\n${config.CORS_ORIGIN}/app/courses/${row.course_id}`,
    ],
  );
}
