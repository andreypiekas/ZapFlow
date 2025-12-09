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
    database: process.env.DB_NAME || 'zapflow',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
});

async function addDepartmentIdToUsers() {
    const client = await pool.connect();
    
    try {
        console.log('🔍 Verificando se a coluna department_id existe na tabela users...');
        
        // Verifica se a coluna já existe
        const checkColumn = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'users' AND column_name = 'department_id'
        `);
        
        if (checkColumn.rows.length > 0) {
            console.log('✅ Coluna department_id já existe na tabela users');
            return;
        }
        
        console.log('📝 Adicionando coluna department_id à tabela users...');
        
        // Adiciona a coluna department_id
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN department_id VARCHAR(255)
        `);
        
        console.log('✅ Coluna department_id adicionada com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao adicionar coluna department_id:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

addDepartmentIdToUsers()
    .then(() => {
        console.log('✅ Migração concluída com sucesso!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    });

