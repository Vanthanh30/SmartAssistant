import columns from './vietnamese-columns.json' with {type:'json'};
import mysql from 'mysql2/promise';
export function createPool(config) {
  const pool = mysql.createPool({ host: config.DB_HOST, port: config.DB_PORT, user: config.DB_USER,
    password: config.DB_PASSWORD, database: config.DB_NAME, charset: 'utf8mb4', timezone: 'Z',
    supportBigNumbers: true, bigNumberStrings: true, connectionLimit: 10, connectTimeout: 5000 });
  pool.on('connection', connection => connection.query("SET time_zone = '+00:00'", error => { if (error) connection.destroy(); }));
  // Only map physical row field names to the existing domain/REST contract. SQL is already Vietnamese.
  const wrap = target => new Proxy(target,{get(object,key){
    if(key==='getConnection')return async()=>wrap(await object.getConnection());
    if(key==='query'||key==='execute')return async(...args)=>{
      const [rows,fields]=await object[key](...args);
      const mapped=Array.isArray(rows)?rows.map(row=>Object.fromEntries(Object.entries(row).map(([name,value])=>[columns[name]||name,value]))):rows;
      return [mapped,fields];
    };
    const value=Reflect.get(object,key);return typeof value==='function'?value.bind(object):value;
  }});
  return wrap(pool);
}
