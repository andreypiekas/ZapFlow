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

async function addNationalHolidaysTable() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    // Criar tabela de feriados nacionais
    await client.query(`
      CREATE TABLE IF NOT EXISTS national_holidays (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        name VARCHAR(255) NOT NULL,
        year INTEGER NOT NULL,
        type VARCHAR(50) DEFAULT 'national',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, name)
      )
    `);

    // Criar índices para melhor performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_national_holidays_date 
      ON national_holidays(date);
      
      CREATE INDEX IF NOT EXISTS idx_national_holidays_year 
      ON national_holidays(year);
      
      CREATE INDEX IF NOT EXISTS idx_national_holidays_date_name 
      ON national_holidays(date, name);
    `);

    console.log('✅ Tabela national_holidays criada/atualizada com sucesso!');
    
    await client.end();
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error);
    process.exit(1);
  }
}

addNationalHolidaysTable();

