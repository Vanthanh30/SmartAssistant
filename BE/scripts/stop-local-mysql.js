import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
const password = (await readFile(new URL('../storage/mysql-auth/root.local', import.meta.url), 'utf8')).trim();
const connection = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root', password });
try { await connection.query('SHUTDOWN'); console.log('Đã yêu cầu MySQL auth local shutdown an toàn.'); }
finally { await connection.end(); }
