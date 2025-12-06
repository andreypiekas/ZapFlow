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
        role VARCHAR(50) NOT NULL DEFAULT 'agent',
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

    // Criar usuário admin padrão se não existir
    const bcrypt = await import('bcryptjs');
    const adminExists = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
    
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.default.hash('admin123', 10);
      await client.query(
        `INSERT INTO users (username, password_hash, name, email, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        ['admin', hashedPassword, 'Administrador', 'admin@zapflow.com', 'admin']
      );
      console.log('✅ Usuário admin criado (username: admin, password: admin123)');
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

