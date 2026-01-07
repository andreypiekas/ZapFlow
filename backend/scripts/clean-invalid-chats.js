import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

// Suporte para __dirname em ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Carrega variáveis de ambiente
dotenv.config({ path: join(__dirname, '../.env') });

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'zentria',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

async function cleanInvalidChats() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Buscando chats inválidos no banco de dados...');
        
        // Busca todos os chats
        const result = await client.query(`
            SELECT id, data_key, data_value
            FROM user_data
            WHERE data_type = 'chats'
            AND data_key IS NOT NULL
            AND data_key != 'default'
        `);
        
        console.log(`📊 Encontrados ${result.rows.length} chats no banco de dados`);
        
        let invalidCount = 0;
        let deletedCount = 0;
        
        for (const row of result.rows) {
            const chatId = row.data_key;
            
            // Extrai número do ID do chat
            const chatIdNumber = chatId.split('@')[0].replace(/\D/g, '');
            
            // Validação: números brasileiros devem ter pelo menos 11 dígitos
            // Números de 10 dígitos são inválidos (faltam dígitos)
            const isValidNumber = chatIdNumber.length >= 11 && chatIdNumber.length <= 14 && /^\d+$/.test(chatIdNumber);
            
            if (!isValidNumber) {
                invalidCount++;
                console.log(`❌ Chat inválido encontrado: ${chatId} (número: ${chatIdNumber}, dígitos: ${chatIdNumber.length})`);
                
                // Tenta parsear o data_value para verificar se é um objeto válido
                try {
                    const chatData = typeof row.data_value === 'string' ? JSON.parse(row.data_value) : row.data_value;
                    
                    // Verifica se tem contactNumber válido
                    const contactNumber = chatData?.contactNumber?.replace(/\D/g, '') || '';
                    const hasValidContactNumber = contactNumber.length >= 11 && contactNumber.length <= 14 && /^\d+$/.test(contactNumber);
                    
                    if (!hasValidContactNumber) {
                        console.log(`   🗑️  Deletando chat inválido: ${chatId}`);
                        await client.query(`
                            DELETE FROM user_data
                            WHERE data_type = 'chats'
                            AND data_key = $1
                        `, [chatId]);
                        deletedCount++;
                    } else {
                        console.log(`   ⚠️  Chat tem contactNumber válido (${contactNumber}), mantendo mas atualizando data_key...`);
                        // Atualiza data_key para usar o contactNumber válido
                        const newKey = `${contactNumber}@s.whatsapp.net`;
                        await client.query(`
                            UPDATE user_data
                            SET data_key = $1
                            WHERE data_type = 'chats'
                            AND data_key = $2
                        `, [newKey, chatId]);
                        console.log(`   ✅ data_key atualizado: ${chatId} -> ${newKey}`);
                    }
                } catch (error) {
                    console.error(`   ❌ Erro ao processar chat ${chatId}:`, error.message);
                    // Se não conseguir parsear, deleta
                    await client.query(`
                        DELETE FROM user_data
                        WHERE data_type = 'chats'
                        AND data_key = $1
                    `, [chatId]);
                    deletedCount++;
                }
            }
        }
        
        console.log(`\n✅ Limpeza concluída:`);
        console.log(`   - Chats inválidos encontrados: ${invalidCount}`);
        console.log(`   - Chats deletados: ${deletedCount}`);
        console.log(`   - Chats válidos mantidos: ${result.rows.length - invalidCount}`);
        
    } catch (error) {
        console.error('❌ Erro ao limpar chats inválidos:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

cleanInvalidChats()
    .then(() => {
        console.log('\n✅ Script executado com sucesso!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Erro ao executar script:', error);
        process.exit(1);
    });

