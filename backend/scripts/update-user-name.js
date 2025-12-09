import pg from 'pg';
import dotenv from 'dotenv';

const { Client } = pg;
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'zapflow'}`
});

async function updateUserName() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    // Pega os argumentos da linha de comando
    const args = process.argv.slice(2);
    const username = args[0] || 'admin@piekas.com';
    const newName = args[1] || 'Andrey';

    // Verificar se usuário existe
    const userExists = await client.query('SELECT id, username, name FROM users WHERE username = $1', [username]);
    
    if (userExists.rows.length === 0) {
      console.log(`❌ Usuário ${username} não encontrado.`);
      process.exit(1);
    }

    const oldName = userExists.rows[0].name;
    console.log(`📝 Usuário encontrado: ${username}`);
    console.log(`   Nome atual: ${oldName}`);
    console.log(`   Novo nome: ${newName}`);

    // Atualizar nome
    await client.query(
      `UPDATE users SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2`,
      [newName, username]
    );

    console.log(`✅ Nome do usuário ${username} atualizado de "${oldName}" para "${newName}"`);
    
  } catch (error) {
    console.error('❌ Erro ao atualizar nome do usuário:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

updateUserName();

