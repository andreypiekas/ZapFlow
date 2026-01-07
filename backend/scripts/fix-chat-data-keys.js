/**
 * Script para corrigir data_key null/undefined nos chats do banco de dados
 * 
 * Este script:
 * 1. Encontra todos os registros de chats com data_key null, undefined ou 'undefined'
 * 2. Extrai o id do chat do JSON armazenado em data_value
 * 3. Atualiza o data_key com o id do chat
 * 
 * Uso: node backend/scripts/fix-chat-data-keys.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

// Configura dotenv usando o caminho correto para ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'zentria',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function fixChatDataKeys() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔍 Buscando registros de chats com data_key inválido...');
    
    // Busca todos os registros de chats com data_key null, undefined ou 'undefined'
    const result = await client.query(`
      SELECT id, user_id, data_key, data_value 
      FROM user_data 
      WHERE data_type = 'chats' 
        AND (data_key IS NULL 
             OR data_key = 'undefined' 
             OR data_key = 'null'
             OR data_key = '')
    `);
    
    console.log(`📊 Encontrados ${result.rows.length} registros com data_key inválido`);
    
    let fixed = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const row of result.rows) {
      try {
        // Tenta parsear o JSON
        let chatData;
        try {
          chatData = typeof row.data_value === 'string' 
            ? JSON.parse(row.data_value) 
            : row.data_value;
        } catch (parseError) {
          console.warn(`⚠️  Erro ao parsear JSON do registro ${row.id}:`, parseError.message);
          skipped++;
          continue;
        }
        
        // Verifica se tem id no chat
        if (!chatData || !chatData.id) {
          console.warn(`⚠️  Registro ${row.id} não tem id no chat, pulando...`);
          skipped++;
          continue;
        }
        
        const chatId = chatData.id;
        
        // Verifica se já existe um registro com esse chatId para o mesmo usuário
        const existingCheck = await client.query(`
          SELECT id FROM user_data 
          WHERE user_id = $1 
            AND data_type = 'chats' 
            AND data_key = $2
            AND id != $3
        `, [row.user_id, chatId, row.id]);
        
        if (existingCheck.rows.length > 0) {
          console.warn(`⚠️  Já existe registro com chatId ${chatId} para user ${row.user_id}, deletando duplicado ${row.id}...`);
          await client.query(`
            DELETE FROM user_data WHERE id = $1
          `, [row.id]);
          skipped++;
          continue;
        }
        
        // Atualiza o data_key com o id do chat
        await client.query(`
          UPDATE user_data 
          SET data_key = $1, updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        `, [chatId, row.id]);
        
        console.log(`✅ Corrigido registro ${row.id}: data_key atualizado para '${chatId}'`);
        fixed++;
        
      } catch (error) {
        console.error(`❌ Erro ao processar registro ${row.id}:`, error.message);
        errors++;
      }
    }
    
    await client.query('COMMIT');
    
    console.log('\n📈 Resumo:');
    console.log(`   ✅ Corrigidos: ${fixed}`);
    console.log(`   ⚠️  Pulados: ${skipped}`);
    console.log(`   ❌ Erros: ${errors}`);
    console.log(`\n✅ Migração concluída!`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro na migração:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Executa a migração
fixChatDataKeys()
  .then(() => {
    console.log('✅ Script executado com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro ao executar script:', error);
    process.exit(1);
  });

