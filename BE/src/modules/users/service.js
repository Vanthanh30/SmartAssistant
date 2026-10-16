import { cloudBuffer,uploadCloudBuffer,cloudPublicId,cloudEnabled,destroyCloudAsset } from '../../integrations/cloudinary.js';
import sharp from 'sharp';
import { createHash, randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { AppError } from '../../shared/AppError.js';
import { userDto } from '../auth/service.js';
const allowed = { jpeg: { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'] }, png: { mime: 'image/png', extensions: ['.png'] }, webp: { mime: 'image/webp', extensions: ['.webp'] } };
export function userService(repository, config) {
  return {
    async profile(id) { return userDto(await repository.get(id)); },
    async update(id, input) { return userDto(await repository.updateName(id, input.fullName)); },
    async uploadAvatar(id, file) {
      if (!file) throw new AppError(422, 'AVATAR_REQUIRED', 'Vui lòng chọn ảnh đại diện.');
      let output;
      try {
        const image = sharp(file.buffer, { limitInputPixels: 16000000, failOn: 'warning' });
        const metadata = await image.metadata();
        const kind = allowed[metadata.format];
        if (!kind || kind.mime !== file.mimetype || !kind.extensions.includes(extname(file.originalname).toLowerCase()) || (metadata.pages ?? 1) !== 1) {
          throw new Error('Invalid avatar type');
        }
        // Full decode and re-encode strips EXIF/ICC and avoids serving original bytes.
        output = await image.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      } catch { throw new AppError(422, 'INVALID_AVATAR', 'Ảnh phải là JPEG, PNG hoặc WebP hợp lệ, không có nhiều khung hình.'); }
      const key = `${randomUUID()}.webp`;
      if(!cloudEnabled(config))throw new AppError(503,'CLOUDINARY_NOT_CONFIGURED','Cần cấu hình Cloudinary.');
      const sha256=createHash('sha256').update(output).digest('hex');

      try{await uploadCloudBuffer(config,{public_id:cloudPublicId(config,key,'avatars'),cloud_name:config.CLOUDINARY_CLOUD_NAME,resource_type:'image',size_bytes:output.length,sha256},output);
        await repository.replaceAvatar(id,cloudPublicId(config,key,'avatars'));
      }catch(error){if(!error.commitOutcomeUnknown)await destroyCloudAsset(config,{public_id:cloudPublicId(config,key,'avatars'),cloud_name:config.CLOUDINARY_CLOUD_NAME,resource_type:'image'}).catch(()=>{});throw error;}
      return this.profile(id);
    },
    async avatar(id) {
      const user = await repository.get(id);
      if (!user.avatar_key) throw new AppError(404, 'AVATAR_NOT_FOUND', 'Chưa có ảnh đại diện.');
      const asset={public_id:user.avatar_key,cloud_name:config.CLOUDINARY_CLOUD_NAME,resource_type:'image',state:'uploaded'};
      return cloudBuffer(config,asset);
    },
  };
}
