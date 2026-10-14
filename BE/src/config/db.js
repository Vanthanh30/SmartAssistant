import mysql from 'mysql2/promise';
export function createPool(config) {
  const pool = mysql.createPool({ host: config.DB_HOST, port: config.DB_PORT, user: config.DB_USER,
    password: config.DB_PASSWORD, database: config.DB_NAME, charset: 'utf8mb4', timezone: 'Z',
    supportBigNumbers: true, bigNumberStrings: true, connectionLimit: 10, connectTimeout: 5000 });
  pool.on('connection', connection => connection.query("SET time_zone = '+00:00'", error => { if (error) connection.destroy(); }));
  return pool;
}
