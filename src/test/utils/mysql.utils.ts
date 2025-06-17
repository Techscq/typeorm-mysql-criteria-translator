import * as mysql from 'mysql2/promise';
import 'dotenv/config';

const dbHost = process.env.MYSQL_HOST || '';
const dbPort = parseInt(process.env.MYSQL_PORT || '', 10);
const dbUser = process.env.MYSQL_USER || '';
const dbPassword = process.env.MYSQL_PASSWORD || '';
const dbDatabase = process.env.MYSQL_DATABASE_NAME || '';

const pool = mysql.createPool({
  host: dbHost,
  user: dbUser,
  password: dbPassword,
  port: dbPort,
  connectionLimit: 2,
});

export async function initializeDatabase() {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbDatabase}`);
    console.log(`Database ${dbDatabase} ensured.`);
  } catch (err) {
    console.error('Error ensuring database:', err);
    throw err;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
export async function closeMysqlPool() {
  try {
    await pool.end();
    console.log('MySQL utility pool closed successfully.');
  } catch (err) {
    console.error('Error closing MySQL utility pool:', err);
  }
}
