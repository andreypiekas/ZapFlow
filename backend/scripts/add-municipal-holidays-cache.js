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

async function addMunicipalHolidaysCache() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    // Criar tabela de cache de feriados municipais
    await client.query(`
      CREATE TABLE IF NOT EXISTS municipal_holidays_cache (
        id SERIAL PRIMARY KEY,
        city_name VARCHAR(255) NOT NULL,
        state_code VARCHAR(2) NOT NULL,
        year INTEGER NOT NULL,
        holidays JSONB NOT NULL,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(city_name, state_code, year)
      )
    `);

    // Criar índices para melhor performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_municipal_holidays_city_state_year 
      ON municipal_holidays_cache(city_name, state_code, year);
      
      CREATE INDEX IF NOT EXISTS idx_municipal_holidays_last_updated 
      ON municipal_holidays_cache(last_updated);
    `);

    console.log('✅ Tabela municipal_holidays_cache criada/atualizada com sucesso!');
    
    await client.end();
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error);
    process.exit(1);
  }
}

addMunicipalHolidaysCache();

