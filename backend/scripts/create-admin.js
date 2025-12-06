import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

const { Client } = pg;
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'zapflow'}`
});

async function createAdmin() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    const adminUsername = 'admin@piekas.com';
    const adminPassword = '123';
    
    // Verificar se usuário já existe
    const adminExists = await client.query('SELECT id, username FROM users WHERE username = $1', [adminUsername]);
    
    if (adminExists.rows.length > 0) {
      console.log(`⚠️  Usuário ${adminUsername} já existe.`);
      // Atualizar senha e garantir que o role seja 'ADMIN'
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await client.query(
        `UPDATE users SET password_hash = $1, role = $2, updated_at = CURRENT_TIMESTAMP WHERE username = $3`,
        [hashedPassword, 'ADMIN', adminUsername]
      );
      console.log(`✅ Senha e role do usuário ${adminUsername} atualizados (role: ADMIN)`);
    } else {
      // Criar novo usuário
      const hashedPassword = await bcrypt.hash(adminPassword, 10);
      await client.query(
        `INSERT INTO users (username, password_hash, name, email, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        [adminUsername, hashedPassword, 'Administrador', adminUsername, 'ADMIN']
      );
      console.log(`✅ Usuário admin criado com sucesso!`);
    }
    
    console.log(`   Username: ${adminUsername}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   Role: ADMIN`);
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário admin:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createAdmin();

