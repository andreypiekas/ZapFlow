import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const { Client } = pg;
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
  connectionString: process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'zentria'}`
});

async function addGeminiQuotaControl() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    // Criar tabela de controle de cota do Gemini
    await client.query(`
      CREATE TABLE IF NOT EXISTS gemini_quota_control (
        id SERIAL PRIMARY KEY,
        quota_exceeded_date DATE NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(quota_exceeded_date)
      )
    `);

    // Criar índices para melhor performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gemini_quota_date 
      ON gemini_quota_control(quota_exceeded_date);
      
      CREATE INDEX IF NOT EXISTS idx_gemini_quota_last_updated 
      ON gemini_quota_control(last_updated);
    `);

    console.log('✅ Tabela gemini_quota_control criada/atualizada com sucesso!');
    
    await client.end();
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error);
    process.exit(1);
  }
}

addGeminiQuotaControl();

