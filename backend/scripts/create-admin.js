import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

const { Client } = pg;
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'zentria'}`
});

async function createAdmin() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    const adminUsername = 'admin@piekas.com';
    const seededAdminPassword = process.env.SEED_ADMIN_PASSWORD || '123';
    const shouldResetAdminPassword =
      String(process.env.RESET_ADMIN_PASSWORD || '').toLowerCase() === 'true' ||
      String(process.env.RESET_ADMIN_PASSWORD || '') === '1';
    
    // Verificar se usuário já existe
    const adminExists = await client.query('SELECT id, username FROM users WHERE username = $1', [adminUsername]);
    
    if (adminExists.rows.length > 0) {
      console.log(`⚠️  Usuário ${adminUsername} já existe.`);
      // Por padrão, NÃO alteramos senha (evita efeitos colaterais em upgrades).
      // Para forçar reset: RESET_ADMIN_PASSWORD=true e (opcionalmente) SEED_ADMIN_PASSWORD.
      if (shouldResetAdminPassword) {
        const hashedPassword = await bcrypt.hash(seededAdminPassword, 10);
        await client.query(
          `UPDATE users SET password_hash = $1, role = $2, name = $4, updated_at = CURRENT_TIMESTAMP WHERE username = $3`,
          [hashedPassword, 'ADMIN', adminUsername, 'Andrey']
        );
        console.log(`✅ Admin atualizado (name: Andrey, role: ADMIN) e senha resetada via RESET_ADMIN_PASSWORD`);
      } else {
        await client.query(
          `UPDATE users SET role = $1, name = $3, updated_at = CURRENT_TIMESTAMP WHERE username = $2`,
          ['ADMIN', adminUsername, 'Andrey']
        );
        console.log(`✅ Admin existente: role/nome garantidos (senha não alterada)`);
      }
    } else {
      // Criar novo usuário
      const hashedPassword = await bcrypt.hash(seededAdminPassword, 10);
      await client.query(
        `INSERT INTO users (username, password_hash, name, email, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        [adminUsername, hashedPassword, 'Andrey', adminUsername, 'ADMIN']
      );
      console.log(`✅ Usuário admin criado com sucesso!`);
    }
    
    console.log(`   Username: ${adminUsername}`);
    console.log(`   Password: ${seededAdminPassword}`);
    console.log(`   Name: Andrey`);
    console.log(`   Role: ADMIN`);
    
  } catch (error) {
    console.error('❌ Erro ao criar usuário admin:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createAdmin();

