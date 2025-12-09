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
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'zapflow'}`
});

async function migrate() {
  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    // 1. Modifica coluna user_id para permitir NULL
    console.log('📝 Modificando coluna user_id para permitir NULL...');
    await client.query(`
      ALTER TABLE user_data 
      ALTER COLUMN user_id DROP NOT NULL
    `);
    console.log('✅ Coluna user_id agora permite NULL');

    // 2. Remove constraint única antiga se existir
    console.log('📝 Removendo constraint única antiga...');
    await client.query(`
      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'user_data_user_id_data_type_data_key_key'
        ) THEN
          ALTER TABLE user_data DROP CONSTRAINT user_data_user_id_data_type_data_key_key;
          RAISE NOTICE 'Constraint antiga removida';
        END IF;
      END $$;
    `);
    console.log('✅ Constraint antiga removida (se existia)');

    // 3. Cria nova constraint que permite NULL (tratando NULL como 0 para unicidade)
    console.log('📝 Criando nova constraint que permite NULL...');
    await client.query(`
      ALTER TABLE user_data 
      ADD CONSTRAINT user_data_user_id_data_type_data_key_key 
      UNIQUE (COALESCE(user_id, 0), data_type, data_key)
    `);
    console.log('✅ Nova constraint criada');

    // 4. Migra configurações existentes para globais (user_id = NULL)
    console.log('📝 Migrando configurações existentes para globais...');
    const configResult = await client.query(`
      SELECT DISTINCT user_id, data_value 
      FROM user_data 
      WHERE data_type = 'config' AND data_key = 'apiConfig'
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    if (configResult.rows.length > 0) {
      const configValue = configResult.rows[0].data_value;
      
      // Remove todas as configurações existentes (de todos os usuários)
      await client.query(`
        DELETE FROM user_data 
        WHERE data_type = 'config' AND data_key = 'apiConfig'
      `);
      
      // Insere como configuração global (user_id = NULL)
      await client.query(`
        INSERT INTO user_data (user_id, data_type, data_key, data_value)
        VALUES (NULL, 'config', 'apiConfig', $1)
      `, [typeof configValue === 'string' ? configValue : JSON.stringify(configValue)]);
      
      console.log('✅ Configurações migradas para globais');
    } else {
      console.log('ℹ️ Nenhuma configuração encontrada para migrar');
    }

    console.log('✅ Migração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    throw error;
  } finally {
    await client.end();
  }
}

migrate().catch(console.error);

