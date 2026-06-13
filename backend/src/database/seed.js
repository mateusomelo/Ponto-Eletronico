/**
 * Seed script - cria dados de demonstração
 * Usage: npm run seed
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcrypt');
const { pool, testConnection } = require('./connection');

async function seed() {
  await testConnection();

  console.log('\n[Seed] Gerando hash da senha Admin@123...');
  const hash = await bcrypt.hash('Admin@123', 12);
  console.log('[Seed] Hash gerado:', hash);
  console.log('\n[Seed] Atualize o INSERT no schema.sql com este hash.\n');

  // Criar funcionários de demo (se não existirem)
  const hashDemo = await bcrypt.hash('Demo@123', 12);

  const demos = [
    ['Maria Oliveira',   'maria@empresa.com',   '111.111.111-11', '(11) 91111-1111', 2],
    ['Carlos Santos',    'carlos@empresa.com',  '222.222.222-22', '(11) 92222-2222', 3],
    ['Ana Costa',        'ana@empresa.com',     '333.333.333-33', '(11) 93333-3333', 3],
    ['Pedro Almeida',    'pedro@empresa.com',   '444.444.444-44', '(11) 94444-4444', 3],
  ];

  for (const [nome, email, cpf, tel, cargo_id] of demos) {
    try {
      await pool.query(
        `INSERT IGNORE INTO usuarios (nome, email, cpf, telefone, senha_hash, cargo_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, email, cpf, tel, hashDemo, cargo_id]
      );
      console.log(`[Seed] Usuário criado/verificado: ${email}`);
    } catch (err) {
      console.warn(`[Seed] Aviso ao criar ${email}:`, err.message);
    }
  }

  console.log('\n[Seed] Concluído!\n');
  console.log('Usuários de demonstração:');
  console.log('  admin@empresa.com   / Admin@123  (Administrador)');
  console.log('  maria@empresa.com   / Demo@123   (Supervisor)');
  console.log('  carlos@empresa.com  / Demo@123   (Funcionário)');
  console.log('  ana@empresa.com     / Demo@123   (Funcionário)');
  console.log('  pedro@empresa.com   / Demo@123   (Funcionário)\n');

  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
