import pg from 'pg';

const { Pool } = pg;

// Função para limpar chats inválidos do banco de dados
export async function cleanInvalidChats(pool) {
  const client = await pool.connect();
  
  try {
    console.log('[ChatCleanup] 🔍 Buscando chats inválidos no banco de dados...');
    
    // Busca todos os chats
    const result = await client.query(`
      SELECT id, data_key, data_value, user_id
      FROM user_data
      WHERE data_type = 'chats'
      AND data_key IS NOT NULL
      AND data_key != 'default'
    `);
    
    console.log(`[ChatCleanup] 📊 Encontrados ${result.rows.length} chats no banco de dados`);
    
    let invalidCount = 0;
    let deletedCount = 0;
    let fixedCount = 0;
    
    for (const row of result.rows) {
      const chatId = row.data_key;
      
      // Extrai número do ID do chat
      const chatIdNumber = chatId.split('@')[0].replace(/\D/g, '');
      
      // Validação: números brasileiros devem ter pelo menos 11 dígitos
      // Números de 10 dígitos são inválidos (faltam dígitos)
      const isValidNumber = chatIdNumber.length >= 11 && chatIdNumber.length <= 14 && /^\d+$/.test(chatIdNumber);
      
      // Verifica se é grupo (grupos são válidos mesmo sem número de telefone)
      const isGroup = chatId.includes('@g.us');
      
      if (!isGroup && !isValidNumber) {
        invalidCount++;
        
        // Tenta parsear o data_value para verificar se é um objeto válido
        try {
          const chatData = typeof row.data_value === 'string' ? JSON.parse(row.data_value) : row.data_value;
          
          // Verifica se tem contactNumber válido
          const contactNumber = chatData?.contactNumber?.replace(/\D/g, '') || '';
          const hasValidContactNumber = contactNumber.length >= 11 && contactNumber.length <= 14 && /^\d+$/.test(contactNumber);
          
          if (!hasValidContactNumber) {
            console.log(`[ChatCleanup] 🗑️  Deletando chat inválido: ${chatId} (número: ${chatIdNumber}, dígitos: ${chatIdNumber.length})`);
            await client.query(`
              DELETE FROM user_data
              WHERE data_type = 'chats'
              AND data_key = $1
              AND user_id = $2
            `, [chatId, row.user_id]);
            deletedCount++;
          } else {
            console.log(`[ChatCleanup] ⚠️  Chat tem contactNumber válido (${contactNumber}), atualizando data_key...`);
            // Atualiza data_key para usar o contactNumber válido
            const newKey = `${contactNumber}@s.whatsapp.net`;
            
            // Verifica se já existe um chat com essa key para o mesmo usuário
            const existingCheck = await client.query(`
              SELECT id FROM user_data
              WHERE data_type = 'chats'
              AND data_key = $1
              AND user_id = $2
            `, [newKey, row.user_id]);
            
            if (existingCheck.rows.length === 0) {
              await client.query(`
                UPDATE user_data
                SET data_key = $1
                WHERE data_type = 'chats'
                AND data_key = $2
                AND user_id = $3
              `, [newKey, chatId, row.user_id]);
              fixedCount++;
              console.log(`[ChatCleanup] ✅ data_key atualizado: ${chatId} -> ${newKey}`);
            } else {
              // Se já existe, deleta o duplicado inválido
              await client.query(`
                DELETE FROM user_data
                WHERE data_type = 'chats'
                AND data_key = $1
                AND user_id = $2
              `, [chatId, row.user_id]);
              deletedCount++;
              console.log(`[ChatCleanup] 🗑️  Chat duplicado deletado: ${chatId} (já existe ${newKey})`);
            }
          }
        } catch (error) {
          console.error(`[ChatCleanup] ❌ Erro ao processar chat ${chatId}:`, error.message);
          // Se não conseguir parsear, deleta
          await client.query(`
            DELETE FROM user_data
            WHERE data_type = 'chats'
            AND data_key = $1
            AND user_id = $2
          `, [chatId, row.user_id]);
          deletedCount++;
        }
      }
    }
    
    const summary = {
      total: result.rows.length,
      invalid: invalidCount,
      deleted: deletedCount,
      fixed: fixedCount,
      valid: result.rows.length - invalidCount
    };
    
    console.log(`[ChatCleanup] ✅ Limpeza concluída:`);
    console.log(`[ChatCleanup]    - Total de chats: ${summary.total}`);
    console.log(`[ChatCleanup]    - Chats inválidos encontrados: ${summary.invalid}`);
    console.log(`[ChatCleanup]    - Chats deletados: ${summary.deleted}`);
    console.log(`[ChatCleanup]    - Chats corrigidos: ${summary.fixed}`);
    console.log(`[ChatCleanup]    - Chats válidos mantidos: ${summary.valid}`);
    
    return summary;
  } catch (error) {
    console.error('[ChatCleanup] ❌ Erro ao limpar chats inválidos:', error);
    throw error;
  } finally {
    client.release();
  }
}

