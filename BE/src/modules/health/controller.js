import { assertDatabaseSchema } from '../../config/schema.js';
import { AppError, sendData } from '../../shared/AppError.js';
export function healthController(pool) {
  return {
    live: (req, res) => sendData(req, res, { status: 'ok' }),
    ready: async (req, res) => {
      try {
        await assertDatabaseSchema(pool);
      } catch {
        throw new AppError(503, 'DB_NOT_READY', 'Cấu trúc cơ sở dữ liệu chưa sẵn sàng.');
      }
      sendData(req, res, { status: 'ok' });
    },
  };
}
