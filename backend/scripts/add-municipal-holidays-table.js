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

async function addMunicipalHolidaysTable() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    // Criar tabela de feriados municipais
    await client.query(`
      CREATE TABLE IF NOT EXISTS municipal_holidays (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        name VARCHAR(255) NOT NULL,
        city VARCHAR(255) NOT NULL,
        state VARCHAR(2) NOT NULL,
        year INTEGER NOT NULL,
        type VARCHAR(50) DEFAULT 'municipal',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, name, city, state)
      )
    `);

    // Criar índices para melhor performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_municipal_holidays_date 
      ON municipal_holidays(date);
      
      CREATE INDEX IF NOT EXISTS idx_municipal_holidays_year 
      ON municipal_holidays(year);
      
      CREATE INDEX IF NOT EXISTS idx_municipal_holidays_city_state 
      ON municipal_holidays(city, state);
      
      CREATE INDEX IF NOT EXISTS idx_municipal_holidays_state 
      ON municipal_holidays(state);
      
      CREATE INDEX IF NOT EXISTS idx_municipal_holidays_date_city_state 
      ON municipal_holidays(date, city, state);
    `);

    console.log('✅ Tabela municipal_holidays criada/atualizada com sucesso!');
    
    await client.end();
  } catch (error) {
    console.error('❌ Erro ao criar tabela:', error);
    process.exit(1);
  }
}

addMunicipalHolidaysTable();

