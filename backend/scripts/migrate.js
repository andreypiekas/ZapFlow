import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Client } = pg;
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
  connectionString: process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'zapflow'}`
});

async function migrate() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    // Criar tabela de usuários
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        role VARCHAR(50) NOT NULL DEFAULT 'AGENT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de dados do usuário (configurações, contatos, etc)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data_type VARCHAR(100) NOT NULL,
        data_key VARCHAR(255) NOT NULL,
        data_value JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, data_type, data_key)
      )
    `);

    // Criar índices para melhor performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_data_type ON user_data(data_type);
      CREATE INDEX IF NOT EXISTS idx_user_data_key ON user_data(data_key);
    `);

    // Criar tabela de departamentos
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(50) NOT NULL DEFAULT 'bg-indigo-500',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )
    `);

    // Criar tabela de contatos
    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        avatar TEXT,
        source VARCHAR(50) NOT NULL DEFAULT 'manual',
        last_sync TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, phone)
      )
    `);

    // Criar tabela de respostas rápidas
    await client.query(`
      CREATE TABLE IF NOT EXISTS quick_replies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de workflows
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        trigger_keywords TEXT[],
        steps JSONB NOT NULL,
        target_department_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar índices para melhor performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_departments_user_id ON departments(user_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
      CREATE INDEX IF NOT EXISTS idx_quick_replies_user_id ON quick_replies(user_id);
      CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
    `);

    // Criar usuário admin padrão se não existir
    const bcrypt = await import('bcryptjs');
    const adminUsername = 'admin@piekas.com';
    const adminExists = await client.query('SELECT id FROM users WHERE username = $1', [adminUsername]);
    
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.default.hash('123', 10);
      await client.query(
        `INSERT INTO users (username, password_hash, name, email, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        [adminUsername, hashedPassword, 'Administrador', adminUsername, 'ADMIN']
      );
      console.log(`✅ Usuário admin criado (username: ${adminUsername}, password: 123, role: ADMIN)`);
    } else {
      // Se o admin já existe, atualizar senha e garantir que o role seja 'ADMIN'
      const hashedPassword = await bcrypt.default.hash('123', 10);
      await client.query(
        `UPDATE users SET password_hash = $1, role = $2, updated_at = CURRENT_TIMESTAMP WHERE username = $3`,
        [hashedPassword, 'ADMIN', adminUsername]
      );
      console.log(`✅ Senha e role do usuário admin atualizados (username: ${adminUsername}, password: 123, role: ADMIN)`);
    }

    console.log('✅ Migração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();

