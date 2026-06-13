const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'ponto_eletronico',
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 0,
  timezone:           '-03:00',
  charset:            'utf8mb4',
});

pool.on('connection', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log('[DB] Nova conexão estabelecida');
  }
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('[DB] Conexão com MySQL estabelecida com sucesso');
    conn.release();
  } catch (err) {
    console.error('[DB] Falha ao conectar ao MySQL:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
