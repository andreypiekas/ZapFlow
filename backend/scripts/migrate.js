import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const { Client } = pg;
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
  connectionString: process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'zentria'}`
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
        role VARCHAR(50) NOT NULL DEFAULT 'AGENT',
        department_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Adicionar coluna department_id se não existir (para migrações existentes)
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS department_id VARCHAR(255)
    `);

    // Criar tabela de dados do usuário (configurações, contatos, etc)
    // user_id pode ser NULL para configurações globais do sistema
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_data (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        data_type VARCHAR(100) NOT NULL,
        data_key VARCHAR(255) NOT NULL,
        data_value JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Modificar constraint para permitir user_id NULL (para configurações globais)
    // Remove a constraint antiga se existir e cria um índice único funcional
    await client.query(`
      DO $$ 
      BEGIN
        -- Remove constraint única antiga se existir
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'user_data_user_id_data_type_data_key_key'
        ) THEN
          ALTER TABLE user_data DROP CONSTRAINT user_data_user_id_data_type_data_key_key;
        END IF;
      END $$;
    `);
    
    // Remove índice único funcional se já existir
    await client.query(`
      DROP INDEX IF EXISTS user_data_user_id_data_type_data_key_unique_idx
    `);
    
    // Cria índice único funcional que permite NULL (tratando NULL como 0 para unicidade)
    await client.query(`
      CREATE UNIQUE INDEX user_data_user_id_data_type_data_key_unique_idx 
      ON user_data (COALESCE(user_id, 0), data_type, data_key)
    `);
    
    // Modifica coluna user_id para permitir NULL
    await client.query(`
      ALTER TABLE user_data 
      ALTER COLUMN user_id DROP NOT NULL
    `);

    // Criar índices para melhor performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_data_type ON user_data(data_type);
      CREATE INDEX IF NOT EXISTS idx_user_data_key ON user_data(data_key);
    `);

    // Criar tabela de departamentos
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        color VARCHAR(50) NOT NULL DEFAULT 'bg-indigo-500',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )
    `);

    // ========================================================================
    // Many-to-many: usuários podem pertencer a vários departamentos
    // Mantém compatibilidade com users.department_id (legado)
    // ========================================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_departments (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, department_id)
      )
    `);

    // Backfill: se existir users.department_id numérico, cria vínculo em user_departments
    await client.query(`
      INSERT INTO user_departments (user_id, department_id)
      SELECT u.id, (u.department_id)::int
      FROM users u
      WHERE u.department_id IS NOT NULL
        AND u.department_id ~ '^[0-9]+$'
      ON CONFLICT (user_id, department_id) DO NOTHING
    `);

    // Criar tabela de contatos
    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        avatar TEXT,
        source VARCHAR(50) NOT NULL DEFAULT 'manual',
        last_sync TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, phone)
      )
    `);

    // Criar tabela de respostas rápidas
    await client.query(`
      CREATE TABLE IF NOT EXISTS quick_replies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de workflows
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflows (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        trigger_keywords TEXT[],
        steps JSONB NOT NULL,
        target_department_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Criar tabela de tags (por usuário/admin)
    await client.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        color VARCHAR(100) NOT NULL DEFAULT 'bg-blue-100 text-blue-700',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, name)
      )
    `);

    // Garantir colunas/índices em instalações antigas (quando a tabela já existe)
    await client.query(`
      ALTER TABLE tags
      ADD COLUMN IF NOT EXISTS color VARCHAR(100)
    `);
    await client.query(`
      ALTER TABLE tags
      ALTER COLUMN color SET DEFAULT 'bg-blue-100 text-blue-700'
    `);
    await client.query(`
      UPDATE tags SET color = 'bg-blue-100 text-blue-700' WHERE color IS NULL
    `);

    // Criar tabela de stickers (biblioteca global por usuário/admin)
    // - sha256: permite deduplicar quando temos base64/dataUrl
    // - data_url: conteúdo embutido (data:mime;base64,...), ideal para exibir no frontend sem depender de URLs externas
    // - media_url: fallback quando não há base64 disponível
    await client.query(`
      CREATE TABLE IF NOT EXISTS stickers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sha256 VARCHAR(64),
        mime_type VARCHAR(100) NOT NULL DEFAULT 'image/webp',
        data_url TEXT,
        media_url TEXT,
        first_message_id VARCHAR(255),
        first_remote_jid VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, sha256)
      )
    `);

    // Garantir colunas/índices em instalações antigas (quando a tabela já existe)
    await client.query(`
      ALTER TABLE stickers
      ADD COLUMN IF NOT EXISTS sha256 VARCHAR(64),
      ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
      ADD COLUMN IF NOT EXISTS data_url TEXT,
      ADD COLUMN IF NOT EXISTS media_url TEXT,
      ADD COLUMN IF NOT EXISTS first_message_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS first_remote_jid VARCHAR(255),
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    await client.query(`
      ALTER TABLE stickers
      ALTER COLUMN mime_type SET DEFAULT 'image/webp'
    `);

    // Garante o ON CONFLICT (user_id, sha256) para inserts de stickers no webhook
    // (em instalações antigas pode não existir a constraint/índice único).
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'stickers_user_id_sha256_unique_idx'
        ) THEN
          EXECUTE 'CREATE UNIQUE INDEX stickers_user_id_sha256_unique_idx ON stickers (user_id, sha256)';
        END IF;
      END $$;
    `);

    // Índice auxiliar quando sha256 estiver NULL (não garante unicidade, mas melhora listagem)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
      CREATE INDEX IF NOT EXISTS idx_stickers_user_id ON stickers(user_id);
      CREATE INDEX IF NOT EXISTS idx_stickers_created_at ON stickers(created_at);
    `);

    // Criar índices para melhor performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_departments_user_id ON departments(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_departments_user_id ON user_departments(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_departments_department_id ON user_departments(department_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
      CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
      CREATE INDEX IF NOT EXISTS idx_quick_replies_user_id ON quick_replies(user_id);
      CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);
    `);

    // Criar usuário admin padrão se não existir (seed inicial do primeiro acesso)
    // IMPORTANTE (produção): não resetamos senha automaticamente em upgrades.
    // Para forçar reset: defina RESET_ADMIN_PASSWORD=true e (opcionalmente) SEED_ADMIN_PASSWORD.
    const bcrypt = await import('bcryptjs');
    const adminUsername = 'admin@piekas.com';
    const seededAdminPassword = process.env.SEED_ADMIN_PASSWORD || '123';
    const shouldResetAdminPassword =
      String(process.env.RESET_ADMIN_PASSWORD || '').toLowerCase() === 'true' ||
      String(process.env.RESET_ADMIN_PASSWORD || '') === '1';
    const adminExists = await client.query('SELECT id FROM users WHERE username = $1', [adminUsername]);
    
    if (adminExists.rows.length === 0) {
      const hashedPassword = await bcrypt.default.hash(seededAdminPassword, 10);
      await client.query(
        `INSERT INTO users (username, password_hash, name, email, role) 
         VALUES ($1, $2, $3, $4, $5)`,
        [adminUsername, hashedPassword, 'Administrador', adminUsername, 'ADMIN']
      );
      console.log(`✅ Usuário admin criado (username: ${adminUsername}, role: ADMIN)`);
      console.log(`   🔐 Senha inicial: ${seededAdminPassword}`);
    } else {
      // Se o admin já existe: por padrão, NÃO alteramos senha (evita efeitos colaterais em upgrades).
      // Garantimos role=ADMIN e só resetamos senha se for explicitamente solicitado.
      if (shouldResetAdminPassword) {
        const hashedPassword = await bcrypt.default.hash(seededAdminPassword, 10);
        await client.query(
          `UPDATE users SET password_hash = $1, role = $2, updated_at = CURRENT_TIMESTAMP WHERE username = $3`,
          [hashedPassword, 'ADMIN', adminUsername]
        );
        console.log(`✅ Admin atualizado (role=ADMIN) e senha resetada via RESET_ADMIN_PASSWORD`);
      } else {
        await client.query(
          `UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2`,
          ['ADMIN', adminUsername]
        );
        console.log(`✅ Admin existente: role garantido como ADMIN (senha não alterada)`);
      }
    }

    // Busca ID do admin para seeds dependentes
    const adminRow = await client.query('SELECT id FROM users WHERE username = $1', [adminUsername]);
    const adminId = adminRow.rows?.[0]?.id;
    if (!adminId) {
      throw new Error('Falha ao obter ID do admin após criação/atualização');
    }

    // Seed: departamentos padrão (se ainda não existirem para o admin)
    const deptCount = await client.query('SELECT COUNT(*)::int AS count FROM departments WHERE user_id = $1', [adminId]);
    if ((deptCount.rows?.[0]?.count ?? 0) === 0) {
      await client.query(
        `INSERT INTO departments (user_id, name, description, color)
         VALUES
          ($1, 'Comercial', 'Vendas e novos negócios', 'bg-blue-500'),
          ($1, 'Suporte Técnico', 'Resolução de problemas', 'bg-orange-500'),
          ($1, 'Financeiro', 'Cobranças e faturamento', 'bg-green-600')
         ON CONFLICT (user_id, name) DO NOTHING`,
        [adminId]
      );
      console.log('✅ Departamentos padrão criados para o admin');
    }

    // Seed: tags padrão (se ainda não existirem para o admin)
    const tagCount = await client.query('SELECT COUNT(*)::int AS count FROM tags WHERE user_id = $1', [adminId]);
    if ((tagCount.rows?.[0]?.count ?? 0) === 0) {
      await client.query(
        `INSERT INTO tags (user_id, name, color)
         VALUES
          ($1, 'VIP', 'bg-purple-100 text-purple-700'),
          ($1, 'Novo Lead', 'bg-blue-100 text-blue-700'),
          ($1, 'Recorrente', 'bg-green-100 text-green-700'),
          ($1, 'Inadimplente', 'bg-red-100 text-red-700'),
          ($1, 'Aguardando', 'bg-orange-100 text-orange-700')
         ON CONFLICT (user_id, name) DO NOTHING`,
        [adminId]
      );
      console.log('✅ Tags padrão criadas para o admin');
    }

    // Seed: chatbotConfig padrão (global via user_data: user_id NULL)
    // Mantemos em user_data para compatibilidade com o padrão já usado em configs globais.
    const defaultChatbotConfig = {
      isEnabled: false,
      awayMessage: "Olá! No momento estamos fechados. Nosso horário de atendimento é de Segunda a Sexta das 09:00 às 18:00.",
      greetingMessage: "Olá! Bem-vindo ao nosso atendimento.",
      businessHours: [
        { dayOfWeek: 0, isOpen: false, openTime: '09:00', closeTime: '18:00' },
        { dayOfWeek: 1, isOpen: true, openTime: '09:00', closeTime: '18:00' },
        { dayOfWeek: 2, isOpen: true, openTime: '09:00', closeTime: '18:00' },
        { dayOfWeek: 3, isOpen: true, openTime: '09:00', closeTime: '18:00' },
        { dayOfWeek: 4, isOpen: true, openTime: '09:00', closeTime: '18:00' },
        { dayOfWeek: 5, isOpen: true, openTime: '09:00', closeTime: '18:00' },
        { dayOfWeek: 6, isOpen: false, openTime: '09:00', closeTime: '12:00' }
      ]
    };

    await client.query(
      `INSERT INTO user_data (user_id, data_type, data_key, data_value)
       VALUES (NULL, 'config', 'chatbotConfig', $1)
       ON CONFLICT (COALESCE(user_id, 0), data_type, data_key)
       DO NOTHING`,
      [JSON.stringify(defaultChatbotConfig)]
    );

    console.log('✅ Migração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();

