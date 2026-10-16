import {loadConfig} from '../src/config/env.js';import {createPool} from '../src/config/db.js';import {assertSchema} from '../src/config/schema.js';
const pool=createPool(loadConfig());try{await assertSchema(pool);console.log('Schema tiếng Việt19 bảng sẵn sàng.');}finally{await pool.end();}
