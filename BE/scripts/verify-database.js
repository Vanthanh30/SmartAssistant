import { loadConfig } from '../src/config/env.js';
import { createPool } from '../src/config/db.js';
import { assertSchema } from '../src/config/schema.js';
import { verifyIntegrity,verifyVietnameseData } from '../database/schema-contract/verify.js';
const config=loadConfig();if(config.NODE_ENV!=='development'||config.DB_SCHEMA_VERSION!==16||!['localhost','127.0.0.1','::1'].includes(config.DB_HOST))throw Error('PROJECT_LOCAL_DEV_REQUIRED');
const db=createPool(config);
try{
 await assertSchema(db);

  await verifyIntegrity(db);
  const dataCheck=process.argv.includes('--kiem-tra-du-lieu')?await verifyVietnameseData(db):'chưa yêu cầu kiểm tra ghi dữ liệu';
  console.log(JSON.stringify({schema:{tables:16,columns:124,foreignKeys:21},databaseVerified:true,dataCheck,applicationCompatibility:'cần kiểm tra các luồng ứng dụng riêng',ragLiveSmoke:'không thực hiện trong lệnh này',googleLiveSmoke:'không thực hiện trong lệnh này'}));
}finally{await db.end();}
