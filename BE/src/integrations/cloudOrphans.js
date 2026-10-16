import {v2 as cloudinary} from 'cloudinary';
import {cloudEnabled,cloudPublicId,destroyCloudAsset} from './cloudinary.js';
export async function reconcileCloudOrphans(pool,config){
 if(!cloudEnabled(config))return;
 for(const [kind,type] of [['avatars','image'],['documents','raw']]){
  const prefix=cloudPublicId(config,'',kind);let cursor;
  do{
   const result=await cloudinary.api.resources({cloud_name:config.CLOUDINARY_CLOUD_NAME,api_key:config.CLOUDINARY_API_KEY,api_secret:config.CLOUDINARY_API_SECRET,type:'authenticated',resource_type:type,prefix,max_results:100,...(cursor?{next_cursor:cursor}:{})});
   for(const asset of result.resources){
    if(!asset.public_id.startsWith(prefix)||Date.parse(asset.created_at)>Date.now()-config.ORPHAN_GRACE_SECONDS*1000)continue;
    const key=asset.public_id.slice(prefix.length);
    const [refs]=kind==='avatars'?await pool.execute("SELECT ma FROM nguoi_dung WHERE khoa_anh_dai_dien=?",[asset.public_id]):await pool.execute("SELECT ma FROM tai_lieu WHERE ((ma_tep_dam_may=? AND trang_thai<>'deleted') OR (khoa_luu_tru=? AND trang_thai='queued'))",[asset.public_id,key]);
    if(!refs.length)await destroyCloudAsset(config,{public_id:asset.public_id,cloud_name:config.CLOUDINARY_CLOUD_NAME,resource_type:type});
   }
   cursor=result.next_cursor;
  }while(cursor);
 }
}
