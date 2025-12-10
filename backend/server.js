import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

dotenv.config();

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3001;

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'zapflow'}`
});

// Middleware CORS
const corsOrigins = process.env.CORS_ORIGIN?.split(',').map(o => o.trim()) || ['http://localhost:5173', 'http://localhost:3000'];
app.use(cors({
  origin: (origin, callback) => {
    // Permitir requisições sem origin (Postman, curl, etc)
    if (!origin) return callback(null, true);
    
    // Verificar se origin está na lista permitida
    if (corsOrigins.includes(origin) || corsOrigins.includes('*')) {
      return callback(null, true);
    }
    
    // Permitir se origin contém localhost ou IP do servidor
    const serverIP = process.env.SERVER_IP || 'localhost';
    if (origin.includes('localhost') || origin.includes(serverIP)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// Aumentar limite do body parser para permitir payloads grandes (chats com muitas mensagens)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================================
// RATE LIMITING - Prevenção de Brute Force e DDoS
// ============================================================================
// ⚠️ TEMPORARIAMENTE DESABILITADO - Ver CHECKLIST_PRODUCAO.md para reativar
// TODO: Revisar e reativar rate limiting antes de produção
// ============================================================================

// Rate limiter geral para todas as rotas (proteção básica)
// const generalLimiter = rateLimit({
//   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '15') * 60 * 1000, // 15 minutos por padrão
//   max: parseInt(process.env.RATE_LIMIT_MAX || '1000'), // 100 requisições por janela
//   message: {
//     error: 'Muitas requisições deste IP, tente novamente mais tarde.',
//     retryAfter: '15 minutos'
//   },
//   standardHeaders: true, // Retorna informações de rate limit nos headers `RateLimit-*`
//   legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
//   // Função para obter o IP do cliente (considera proxies/load balancers)
//   keyGenerator: (req) => {
//     return req.ip || 
//            req.headers['x-forwarded-for']?.split(',')[0] || 
//            req.headers['x-real-ip'] || 
//            req.connection.remoteAddress || 
//            'unknown';
//   },
//   // Handler customizado para erros
//   handler: (req, res) => {
//     res.status(429).json({
//       error: 'Muitas requisições deste IP, tente novamente mais tarde.',
//       retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) + ' segundos'
//     });
//   },
//   // Skip rate limiting para health checks (não conta no limite)
//   skip: (req) => {
//     return req.path === '/api/health' || req.path === '/';
//   }
// });

// Rate limiter RESTRITIVO para login (prevenção de brute force)
// const loginLimiter = rateLimit({
//   windowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '15') * 60 * 1000, // 15 minutos
//   max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5'), // Apenas 5 tentativas de login por 15 minutos
//   message: {
//     error: 'Muitas tentativas de login. Por segurança, tente novamente em alguns minutos.',
//     retryAfter: '15 minutos'
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
//   keyGenerator: (req) => {
//     // Para login, também considerar o username para rate limiting mais inteligente
//     const username = req.body?.username || 'unknown';
//     const ip = req.ip || 
//                req.headers['x-forwarded-for']?.split(',')[0] || 
//                req.headers['x-real-ip'] || 
//                req.connection.remoteAddress || 
//                'unknown';
//     return `login:${ip}:${username}`;
//   },
//   handler: (req, res) => {
//     const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
//     const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
//     const username = req.body?.username || 'unknown';
//     
//     // Log de tentativas bloqueadas para auditoria (movido para dentro do handler - onLimitReached foi removido no v7)
//     console.warn(`[SECURITY] Rate limit atingido para login - IP: ${ip}, Username: ${username}, Tentativas: ${req.rateLimit.totalHits}`);
//     
//     res.status(429).json({
//       error: 'Muitas tentativas de login. Por segurança, sua conta foi temporariamente bloqueada.',
//       retryAfter: `${Math.ceil(retryAfter / 60)} minutos`,
//       message: 'Por favor, aguarde antes de tentar novamente. Se você esqueceu sua senha, entre em contato com o administrador.'
//     });
//   }
// });

// Rate limiter para rotas de dados (proteção contra abuso de API)
// const dataLimiter = rateLimit({
//   windowMs: parseInt(process.env.DATA_RATE_LIMIT_WINDOW_MS || '1') * 60 * 1000, // 1 minuto
//   max: parseInt(process.env.DATA_RATE_LIMIT_MAX || '200'), // 200 requisições por minuto (aumentado para evitar 429 em sincronizações frequentes)
//   message: {
//     error: 'Muitas requisições de dados. Aguarde um momento antes de continuar.',
//     retryAfter: '1 minuto'
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
//   keyGenerator: (req) => {
//     // Para rotas autenticadas, usar user ID se disponível
//     if (req.user?.id) {
//       return `data:user:${req.user.id}`;
//     }
//     return req.ip || 
//            req.headers['x-forwarded-for']?.split(',')[0] || 
//            req.headers['x-real-ip'] || 
//            req.connection.remoteAddress || 
//            'unknown';
//   },
//   handler: (req, res) => {
//     const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
//     res.status(429).json({
//       error: 'Muitas requisições. Aguarde um momento antes de continuar.',
//       retryAfter: `${retryAfter} segundos`
//     });
//   }
// });

// Aplicar rate limiting geral em todas as rotas
// app.use(generalLimiter);

// Criar variáveis vazias para não quebrar as rotas (limiters desabilitados)
const loginLimiter = (req, res, next) => next(); // Middleware vazio - rate limiting desabilitado
const dataLimiter = (req, res, next) => next(); // Middleware vazio - rate limiting desabilitado

// Middleware de autenticação
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_change_in_production');
    const result = await pool.query('SELECT id, username, name, email, role FROM users WHERE id = $1', [decoded.userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido' });
  }
};

// Rotas de autenticação
// Aplicar rate limiting restritivo na rota de login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password são obrigatórios' });
    }

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'fallback_secret_change_in_production',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rotas de dados do usuário
// Aplicar rate limiting nas rotas de dados (após autenticação)
app.get('/api/data/:dataType', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { dataType } = req.params;
    const { key } = req.query;

    let query = 'SELECT data_value, data_key FROM user_data WHERE user_id = $1 AND data_type = $2';
    const params = [req.user.id, dataType];

    if (key) {
      query += ' AND data_key = $3';
      params.push(key);
    }

    const result = await pool.query(query, params);

    if (key && result.rows.length > 0) {
      // Se há key, retorna o valor parseado
      try {
        const parsed = typeof result.rows[0].data_value === 'string' 
          ? JSON.parse(result.rows[0].data_value) 
          : result.rows[0].data_value;
        res.json(parsed);
      } catch (e) {
        res.json(result.rows[0].data_value);
      }
    } else if (!key) {
      // Se não há key, retorna objeto com todos os valores parseados
      // IMPORTANTE: Para chats, usa o id do chat como chave se data_key for null/undefined
      const data = {};
      result.rows.forEach(row => {
        try {
          const parsedValue = typeof row.data_value === 'string' 
            ? JSON.parse(row.data_value) 
            : row.data_value;
          
          // Para chats, se data_key for null/undefined, usa o id do chat como chave
          let dataKey = row.data_key;
          if (!dataKey && dataType === 'chats' && parsedValue && parsedValue.id) {
            dataKey = parsedValue.id;
            console.log(`[GET /api/data/:dataType] Corrigindo data_key null/undefined para chat ${parsedValue.id}`);
          }
          
          // Se ainda não tem chave válida, ignora este registro
          if (!dataKey) {
            console.warn(`[GET /api/data/:dataType] Ignorando registro sem data_key válido para ${dataType}`);
            return;
          }
          
          data[dataKey] = parsedValue;
        } catch (e) {
          // Se não conseguiu parsear, tenta usar data_key diretamente
          let dataKey = row.data_key;
          if (!dataKey && dataType === 'chats') {
            console.warn(`[GET /api/data/:dataType] Ignorando registro de chat sem data_key e sem JSON válido`);
            return;
          }
          if (dataKey) {
            data[dataKey] = row.data_value;
          }
        }
      });
      res.json(data);
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

app.post('/api/data/:dataType', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { dataType } = req.params;
    const { key, value } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ error: 'key e value são obrigatórios' });
    }

    // Usa a expressão do índice funcional no ON CONFLICT
    // O índice é: (COALESCE(user_id, 0), data_type, data_key)
    await pool.query(
      `INSERT INTO user_data (user_id, data_type, data_key, data_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (COALESCE(user_id, 0), data_type, data_key)
       DO UPDATE SET data_value = $4, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, dataType, key, JSON.stringify(value)]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar dados:', error);
    console.error('Detalhes do erro:', error.message, error.code);
    res.status(500).json({ error: 'Erro ao salvar dados', details: error.message });
  }
});

app.put('/api/data/:dataType/:key', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { dataType, key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'value é obrigatório' });
    }

    await pool.query(
      `UPDATE user_data 
       SET data_value = $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND data_type = $3 AND data_key = $4`,
      [JSON.stringify(value), req.user.id, dataType, key]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar dados:', error);
    res.status(500).json({ error: 'Erro ao atualizar dados' });
  }
});

app.delete('/api/data/:dataType/:key', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { dataType, key } = req.params;

    await pool.query(
      'DELETE FROM user_data WHERE user_id = $1 AND data_type = $2 AND data_key = $3',
      [req.user.id, dataType, key]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar dados:', error);
    res.status(500).json({ error: 'Erro ao deletar dados' });
  }
});

// Listar usuários (apenas ADMIN)
app.get('/api/users', authenticateToken, dataLimiter, async (req, res) => {
  try {
    // Verificar se o usuário é ADMIN
    const currentUserResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (currentUserResult.rows.length === 0 || currentUserResult.rows[0].role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas administradores podem listar usuários' });
    }

    const result = await pool.query(
      'SELECT id, username, name, email, role, department_id FROM users ORDER BY name',
      []
    );

    res.json(result.rows.map(row => ({
      id: row.id.toString(),
      username: row.username,
      name: row.name,
      email: row.email || row.username,
      role: row.role,
      departmentId: row.department_id || undefined
    })));
  } catch (error) {
    console.error('Erro ao listar usuários:', error);
    res.status(500).json({ error: 'Erro ao listar usuários' });
  }
});

// Rota para criar novo usuário (apenas ADMIN)
app.post('/api/users', authenticateToken, dataLimiter, async (req, res) => {
  try {
    // Verificar se o usuário é ADMIN
    const currentUserResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (currentUserResult.rows.length === 0 || currentUserResult.rows[0].role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas administradores podem criar usuários' });
    }

    const { username, password, name, email, role } = req.body;

    if (!username || !password || !name) {
      return res.status(400).json({ error: 'username, password e name são obrigatórios' });
    }

    // Verificar se o username já existe
    const existingUser = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username já existe' });
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Criar usuário
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, name, email, role) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, username, name, email, role`,
      [username, hashedPassword, name, email || username, role || 'AGENT']
    );

    res.status(201).json({
      success: true,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Erro ao criar usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para deletar usuário (apenas ADMIN)
app.delete('/api/users/:id', authenticateToken, dataLimiter, async (req, res) => {
  try {
    // Verificar se o usuário é ADMIN
    const currentUserResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (currentUserResult.rows.length === 0 || currentUserResult.rows[0].role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas administradores podem deletar usuários' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Não permite deletar a si mesmo
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Não é possível deletar seu próprio usuário' });
    }

    // Deletar dados do usuário primeiro (CASCADE deve cuidar disso, mas vamos garantir)
    await pool.query('DELETE FROM user_data WHERE user_id = $1', [userId]);

    // Deletar usuário
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING id', [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para atualizar qualquer usuário (apenas ADMIN)
app.put('/api/users/:id', authenticateToken, dataLimiter, async (req, res) => {
  try {
    // Verificar se o usuário é ADMIN
    const currentUserResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (currentUserResult.rows.length === 0 || currentUserResult.rows[0].role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas administradores podem atualizar outros usuários' });
    }

    const userId = parseInt(req.params.id);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { name, email, role, password, departmentId } = req.body;

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    if (name) {
      updateFields.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (email) {
      updateFields.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (role) {
      updateFields.push(`role = $${paramIndex++}`);
      params.push(role);
    }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push(`password_hash = $${paramIndex++}`);
      params.push(hashedPassword);
    }
    if (departmentId !== undefined) {
      updateFields.push(`department_id = $${paramIndex++}`);
      params.push(departmentId || null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(userId);

    const result = await pool.query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, username, name, email, role, department_id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ 
      success: true, 
      user: {
        id: result.rows[0].id,
        username: result.rows[0].username,
        name: result.rows[0].name,
        email: result.rows[0].email,
        role: result.rows[0].role,
        departmentId: result.rows[0].department_id || undefined
      }
    });
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Rota para atualizar informações do próprio usuário (nome, email)
app.put('/api/user/profile', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name é obrigatório' });
    }

    const updateFields = ['name = $1'];
    const params = [name];
    let paramIndex = 2;

    if (email) {
      updateFields.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }

    params.push(req.user.id);

    await pool.query(
      `UPDATE users 
       SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $${paramIndex}`,
      params
    );

    // Retorna o usuário atualizado
    const result = await pool.query(
      'SELECT id, username, name, email, role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar perfil do usuário:', error);
    res.status(500).json({ error: 'Erro ao atualizar perfil do usuário' });
  }
});

// ============================================================================
// ENDPOINTS CRUD PARA DEPARTMENTS
// ============================================================================

// Listar departamentos
app.get('/api/departments', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description, color FROM departments WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );
    res.json(result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      description: row.description || '',
      color: row.color
    })));
  } catch (error) {
    console.error('Erro ao listar departamentos:', error);
    res.status(500).json({ error: 'Erro ao listar departamentos' });
  }
});

// Criar departamento
app.post('/api/departments', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name é obrigatório' });
    }

    const result = await pool.query(
      `INSERT INTO departments (user_id, name, description, color) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, name, description, color`,
      [req.user.id, name, description || '', color || 'bg-indigo-500']
    );

    res.status(201).json({
      id: result.rows[0].id.toString(),
      name: result.rows[0].name,
      description: result.rows[0].description || '',
      color: result.rows[0].color
    });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Já existe um departamento com este nome' });
    }
    console.error('Erro ao criar departamento:', error);
    res.status(500).json({ error: 'Erro ao criar departamento' });
  }
});

// Atualizar departamento
app.put('/api/departments/:id', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    if (name) {
      updateFields.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      params.push(description);
    }
    if (color) {
      updateFields.push(`color = $${paramIndex++}`);
      params.push(color);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(parseInt(id));
    params.push(req.user.id);

    const result = await pool.query(
      `UPDATE departments 
       SET ${updateFields.join(', ')} 
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING id, name, description, color`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado' });
    }

    res.json({
      id: result.rows[0].id.toString(),
      name: result.rows[0].name,
      description: result.rows[0].description || '',
      color: result.rows[0].color
    });
  } catch (error) {
    console.error('Erro ao atualizar departamento:', error);
    res.status(500).json({ error: 'Erro ao atualizar departamento' });
  }
});

// Deletar departamento
app.delete('/api/departments/:id', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM departments WHERE id = $1 AND user_id = $2 RETURNING id',
      [parseInt(id), req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Departamento não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar departamento:', error);
    res.status(500).json({ error: 'Erro ao deletar departamento' });
  }
});

// ============================================================================
// ENDPOINTS CRUD PARA CONTACTS
// ============================================================================

// Listar contatos
app.get('/api/contacts', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, phone, email, avatar, source, last_sync FROM contacts WHERE user_id = $1 ORDER BY name',
      [req.user.id]
    );
    res.json(result.rows.map(row => ({
      id: row.id.toString(),
      name: row.name,
      phone: row.phone,
      email: row.email,
      avatar: row.avatar,
      source: row.source,
      lastSync: row.last_sync ? new Date(row.last_sync) : undefined
    })));
  } catch (error) {
    console.error('Erro ao listar contatos:', error);
    res.status(500).json({ error: 'Erro ao listar contatos' });
  }
});

// Criar contato
app.post('/api/contacts', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { name, phone, email, avatar, source } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'name e phone são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO contacts (user_id, name, phone, email, avatar, source, last_sync) 
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP) 
       ON CONFLICT (user_id, phone) 
       DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, avatar = EXCLUDED.avatar, 
                     source = EXCLUDED.source, last_sync = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       RETURNING id, name, phone, email, avatar, source, last_sync`,
      [req.user.id, name, phone, email || null, avatar || null, source || 'manual']
    );

    res.status(201).json({
      id: result.rows[0].id.toString(),
      name: result.rows[0].name,
      phone: result.rows[0].phone,
      email: result.rows[0].email,
      avatar: result.rows[0].avatar,
      source: result.rows[0].source,
      lastSync: result.rows[0].last_sync ? new Date(result.rows[0].last_sync) : undefined
    });
  } catch (error) {
    console.error('Erro ao criar contato:', error);
    res.status(500).json({ error: 'Erro ao criar contato' });
  }
});

// Atualizar contato
app.put('/api/contacts/:id', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, avatar, source } = req.body;

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    if (name) {
      updateFields.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (phone) {
      updateFields.push(`phone = $${paramIndex++}`);
      params.push(phone);
    }
    if (email !== undefined) {
      updateFields.push(`email = $${paramIndex++}`);
      params.push(email || null);
    }
    if (avatar !== undefined) {
      updateFields.push(`avatar = $${paramIndex++}`);
      params.push(avatar || null);
    }
    if (source) {
      updateFields.push(`source = $${paramIndex++}`);
      params.push(source);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(parseInt(id));
    params.push(req.user.id);

    const result = await pool.query(
      `UPDATE contacts 
       SET ${updateFields.join(', ')} 
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING id, name, phone, email, avatar, source, last_sync`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    res.json({
      id: result.rows[0].id.toString(),
      name: result.rows[0].name,
      phone: result.rows[0].phone,
      email: result.rows[0].email,
      avatar: result.rows[0].avatar,
      source: result.rows[0].source,
      lastSync: result.rows[0].last_sync ? new Date(result.rows[0].last_sync) : undefined
    });
  } catch (error) {
    console.error('Erro ao atualizar contato:', error);
    res.status(500).json({ error: 'Erro ao atualizar contato' });
  }
});

// Deletar contato
app.delete('/api/contacts/:id', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING id',
      [parseInt(id), req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contato não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar contato:', error);
    res.status(500).json({ error: 'Erro ao deletar contato' });
  }
});

// ============================================================================
// ENDPOINTS CRUD PARA QUICK REPLIES
// ============================================================================

// Listar respostas rápidas
app.get('/api/quick-replies', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, content FROM quick_replies WHERE user_id = $1 ORDER BY title',
      [req.user.id]
    );
    res.json(result.rows.map(row => ({
      id: row.id.toString(),
      title: row.title,
      content: row.content
    })));
  } catch (error) {
    console.error('Erro ao listar respostas rápidas:', error);
    res.status(500).json({ error: 'Erro ao listar respostas rápidas' });
  }
});

// Criar resposta rápida
app.post('/api/quick-replies', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'title e content são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO quick_replies (user_id, title, content) 
       VALUES ($1, $2, $3) 
       RETURNING id, title, content`,
      [req.user.id, title, content]
    );

    res.status(201).json({
      id: result.rows[0].id.toString(),
      title: result.rows[0].title,
      content: result.rows[0].content
    });
  } catch (error) {
    console.error('Erro ao criar resposta rápida:', error);
    res.status(500).json({ error: 'Erro ao criar resposta rápida' });
  }
});

// Atualizar resposta rápida
app.put('/api/quick-replies/:id', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    if (title) {
      updateFields.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (content) {
      updateFields.push(`content = $${paramIndex++}`);
      params.push(content);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(parseInt(id));
    params.push(req.user.id);

    const result = await pool.query(
      `UPDATE quick_replies 
       SET ${updateFields.join(', ')} 
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING id, title, content`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resposta rápida não encontrada' });
    }

    res.json({
      id: result.rows[0].id.toString(),
      title: result.rows[0].title,
      content: result.rows[0].content
    });
  } catch (error) {
    console.error('Erro ao atualizar resposta rápida:', error);
    res.status(500).json({ error: 'Erro ao atualizar resposta rápida' });
  }
});

// Deletar resposta rápida
app.delete('/api/quick-replies/:id', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM quick_replies WHERE id = $1 AND user_id = $2 RETURNING id',
      [parseInt(id), req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Resposta rápida não encontrada' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar resposta rápida:', error);
    res.status(500).json({ error: 'Erro ao deletar resposta rápida' });
  }
});

// ============================================================================
// ENDPOINTS CRUD PARA WORKFLOWS
// ============================================================================

// Listar workflows
app.get('/api/workflows', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, description, trigger_keywords, steps, target_department_id FROM workflows WHERE user_id = $1 ORDER BY title',
      [req.user.id]
    );
    res.json(result.rows.map(row => ({
      id: row.id.toString(),
      title: row.title,
      description: row.description,
      triggerKeywords: row.trigger_keywords || [],
      steps: row.steps || [],
      targetDepartmentId: row.target_department_id
    })));
  } catch (error) {
    console.error('Erro ao listar workflows:', error);
    res.status(500).json({ error: 'Erro ao listar workflows' });
  }
});

// Criar workflow
app.post('/api/workflows', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { title, description, triggerKeywords, steps, targetDepartmentId } = req.body;
    if (!title || !steps || !Array.isArray(steps)) {
      return res.status(400).json({ error: 'title e steps (array) são obrigatórios' });
    }

    const result = await pool.query(
      `INSERT INTO workflows (user_id, title, description, trigger_keywords, steps, target_department_id) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, title, description, trigger_keywords, steps, target_department_id`,
      [req.user.id, title, description || null, triggerKeywords || [], JSON.stringify(steps), targetDepartmentId || null]
    );

    res.status(201).json({
      id: result.rows[0].id.toString(),
      title: result.rows[0].title,
      description: result.rows[0].description,
      triggerKeywords: result.rows[0].trigger_keywords || [],
      steps: typeof result.rows[0].steps === 'string' ? JSON.parse(result.rows[0].steps) : result.rows[0].steps,
      targetDepartmentId: result.rows[0].target_department_id
    });
  } catch (error) {
    console.error('Erro ao criar workflow:', error);
    res.status(500).json({ error: 'Erro ao criar workflow' });
  }
});

// Atualizar workflow
app.put('/api/workflows/:id', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, triggerKeywords, steps, targetDepartmentId } = req.body;

    const updateFields = [];
    const params = [];
    let paramIndex = 1;

    if (title) {
      updateFields.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      params.push(description || null);
    }
    if (triggerKeywords !== undefined) {
      updateFields.push(`trigger_keywords = $${paramIndex++}`);
      params.push(triggerKeywords || []);
    }
    if (steps !== undefined) {
      updateFields.push(`steps = $${paramIndex++}`);
      params.push(JSON.stringify(steps));
    }
    if (targetDepartmentId !== undefined) {
      updateFields.push(`target_department_id = $${paramIndex++}`);
      params.push(targetDepartmentId || null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(parseInt(id));
    params.push(req.user.id);

    const result = await pool.query(
      `UPDATE workflows 
       SET ${updateFields.join(', ')} 
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING id, title, description, trigger_keywords, steps, target_department_id`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow não encontrado' });
    }

    res.json({
      id: result.rows[0].id.toString(),
      title: result.rows[0].title,
      description: result.rows[0].description,
      triggerKeywords: result.rows[0].trigger_keywords || [],
      steps: typeof result.rows[0].steps === 'string' ? JSON.parse(result.rows[0].steps) : result.rows[0].steps,
      targetDepartmentId: result.rows[0].target_department_id
    });
  } catch (error) {
    console.error('Erro ao atualizar workflow:', error);
    res.status(500).json({ error: 'Erro ao atualizar workflow' });
  }
});

// Deletar workflow
app.delete('/api/workflows/:id', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM workflows WHERE id = $1 AND user_id = $2 RETURNING id',
      [parseInt(id), req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow não encontrado' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar workflow:', error);
    res.status(500).json({ error: 'Erro ao deletar workflow' });
  }
});

// ============================================================================
// Rota para salvar múltiplos dados de uma vez
// ============================================================================
app.post('/api/data/:dataType/batch', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { dataType } = req.params;
    const { data } = req.body; // { key1: value1, key2: value2, ... }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'data deve ser um objeto' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const [key, value] of Object.entries(data)) {
        await client.query(
          `INSERT INTO user_data (user_id, data_type, data_key, data_value)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (COALESCE(user_id, 0), data_type, data_key)
           DO UPDATE SET data_value = $4, updated_at = CURRENT_TIMESTAMP`,
          [req.user.id, dataType, key, JSON.stringify(value)]
        );
      }

      await client.query('COMMIT');
      res.json({ success: true });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Erro ao salvar dados em lote:', error);
    res.status(500).json({ error: 'Erro ao salvar dados em lote' });
  }
});

// ============================================================================
// Endpoint para atualizar status e assignedTo de um chat específico
// ============================================================================
app.put('/api/chats/:chatId', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { status, assignedTo, departmentId, contactName, contactAvatar } = req.body;

    // Decodifica o chatId (pode vir URL encoded)
    const decodedChatId = decodeURIComponent(chatId);
    
    console.log(`[PUT /api/chats/:chatId] Atualizando chat: ${decodedChatId}, user_id: ${req.user.id}, status: ${status}, assignedTo: ${assignedTo}, departmentId: ${departmentId}`);

    // Se o chat não existe, cria um novo registro com apenas os campos fornecidos
    // Isso permite atualizar chats que ainda não foram salvos no banco
    let chatResult = await pool.query(
      `SELECT data_value FROM user_data 
       WHERE user_id = $1 AND data_type = 'chats' AND data_key = $2`,
      [req.user.id, decodedChatId]
    );

    let chatData = null;
    let isIndividualChat = false;

    if (chatResult.rows.length > 0) {
      // Chat encontrado como registro individual
      try {
        chatData = JSON.parse(chatResult.rows[0].data_value);
        isIndividualChat = true;
        console.log(`[PUT /api/chats/:chatId] Chat encontrado como registro individual`);
      } catch (parseError) {
        console.error(`[PUT /api/chats/:chatId] Erro ao fazer parse do chat individual:`, parseError);
        // Se o parse falhar, cria um novo objeto
        chatData = { id: decodedChatId };
      }
    } else {
      // Tenta buscar no array de chats (estrutura antiga/legacy)
      chatResult = await pool.query(
        `SELECT data_value FROM user_data 
         WHERE user_id = $1 AND data_type = 'chats' AND data_key = 'default'`,
        [req.user.id]
      );

      if (chatResult.rows.length > 0) {
        try {
          const chats = JSON.parse(chatResult.rows[0].data_value);
          const chatIndex = chats.findIndex((c) => c && c.id === decodedChatId);

          if (chatIndex !== -1) {
            chatData = chats[chatIndex];
            console.log(`[PUT /api/chats/:chatId] Chat encontrado no array (legacy)`);
          } else {
            // Chat não encontrado no array, cria novo
            chatData = { id: decodedChatId };
            console.log(`[PUT /api/chats/:chatId] Chat não encontrado no array, criando novo`);
          }
        } catch (parseError) {
          console.error(`[PUT /api/chats/:chatId] Erro ao fazer parse do array de chats:`, parseError);
          chatData = { id: decodedChatId };
        }
      } else {
        // Nenhum chat encontrado, cria novo
        chatData = { id: decodedChatId };
        console.log(`[PUT /api/chats/:chatId] Nenhum chat encontrado, criando novo`);
      }
    }

    // Garante que o chat tem um ID
    if (!chatData.id) {
      chatData.id = decodedChatId;
    }

    // Atualiza status, assignedTo, departmentId, contactName e contactAvatar (preserva outros campos)
    if (status !== undefined) {
      chatData.status = status;
    }
    if (assignedTo !== undefined) {
      chatData.assignedTo = assignedTo;
    }
    if (departmentId !== undefined) {
      chatData.departmentId = departmentId;
    }
    if (contactName !== undefined && contactName !== null) {
      chatData.contactName = contactName;
    }
    if (contactAvatar !== undefined && contactAvatar !== null) {
      chatData.contactAvatar = contactAvatar;
    }
    if (status === 'closed') {
      chatData.endedAt = new Date().toISOString();
    } else if (status === 'open' && chatData.endedAt) {
      chatData.endedAt = undefined;
    }

    // Garante que decodedChatId não é null/undefined
    if (!decodedChatId || decodedChatId === 'undefined' || decodedChatId === 'null') {
      console.error(`[PUT /api/chats/:chatId] ERRO: decodedChatId inválido: ${decodedChatId}`);
      return res.status(400).json({ error: 'chatId inválido' });
    }

    // Salva de volta no banco (sempre como registro individual para consistência)
    // IMPORTANTE: data_key DEVE ser o chatId (decodedChatId), nunca null/undefined
    await pool.query(
      `INSERT INTO user_data (user_id, data_type, data_key, data_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (COALESCE(user_id, 0), data_type, data_key)
       DO UPDATE SET data_value = $4, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, 'chats', decodedChatId, JSON.stringify(chatData)]
    );

    console.log(`[PUT /api/chats/:chatId] Chat atualizado com sucesso: chatId=${decodedChatId}, status=${chatData.status}, assignedTo=${chatData.assignedTo}`);
    res.json({ success: true, chat: chatData });
  } catch (error) {
    console.error('[PUT /api/chats/:chatId] Erro ao atualizar chat:', error);
    console.error('[PUT /api/chats/:chatId] Stack:', error.stack);
    console.error('[PUT /api/chats/:chatId] Params:', req.params);
    console.error('[PUT /api/chats/:chatId] Body:', req.body);
    res.status(500).json({ error: 'Erro ao atualizar chat', details: error.message });
  }
});

// ============================================================================
// Endpoint para deletar um chat (apenas ADMIN)
// Deleta do banco de dados e na Evolution API/WhatsApp
// ============================================================================
app.delete('/api/chats/:chatId', authenticateToken, dataLimiter, async (req, res) => {
  try {
    // Verifica se o usuário é admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas administradores podem deletar chats' });
    }

    const { chatId } = req.params;
    const decodedChatId = decodeURIComponent(chatId);

    console.log(`[DELETE /api/chats/:chatId] Deletando chat: ${decodedChatId} (usuário: ${req.user.username})`);

    // Busca o chat no banco para obter informações necessárias
    const chatResult = await pool.query(
      `SELECT data_value FROM user_data 
       WHERE user_id = $1 AND data_type = 'chats' AND data_key = $2`,
      [req.user.id, decodedChatId]
    );

    let chatData = null;
    if (chatResult.rows.length > 0) {
      try {
        chatData = JSON.parse(chatResult.rows[0].data_value);
      } catch (parseError) {
        console.warn(`[DELETE /api/chats/:chatId] Erro ao fazer parse do chat:`, parseError);
      }
    }

    // Obtém a instância ativa e configuração da API
    const configResult = await pool.query(
      `SELECT data_value FROM user_data 
       WHERE user_id = $1 AND data_type = 'config' AND data_key = 'default'`,
      [req.user.id]
    );

    let apiConfig = null;
    if (configResult.rows.length > 0) {
      try {
        apiConfig = JSON.parse(configResult.rows[0].data_value);
      } catch (parseError) {
        console.warn(`[DELETE /api/chats/:chatId] Erro ao fazer parse da config:`, parseError);
      }
    }

    // Deleta na Evolution API se tiver configuração
    if (apiConfig && apiConfig.baseUrl && !apiConfig.isDemo) {
      try {
        // Busca instância ativa
        const activeInstance = chatData?.instanceName || apiConfig.instanceName;
        
        if (activeInstance) {
          const authKey = apiConfig.authenticationApiKey || apiConfig.apiKey || '';
          
          // Usa fetch nativo (Node.js 18+) ou importa node-fetch se necessário
          let fetchFunction;
          try {
            // Tenta usar fetch global (Node.js 18+)
            fetchFunction = globalThis.fetch || fetch;
            if (!fetchFunction) {
              // Se não tiver, tenta importar node-fetch
              const nodeFetch = await import('node-fetch');
              fetchFunction = nodeFetch.default;
            }
          } catch (importError) {
            console.warn(`[DELETE /api/chats/:chatId] ⚠️ Não foi possível importar fetch, pulando deleção na Evolution API`);
            fetchFunction = null;
          }

          if (fetchFunction) {
            const evolutionResponse = await fetchFunction(`${apiConfig.baseUrl}/chat/delete/${activeInstance}`, {
              method: 'DELETE',
              headers: {
                'apikey': authKey,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                remoteJid: decodedChatId
              })
            });

            if (evolutionResponse.ok) {
              console.log(`[DELETE /api/chats/:chatId] ✅ Chat deletado na Evolution API: ${decodedChatId}`);
            } else {
              const errorText = await evolutionResponse.text();
              console.warn(`[DELETE /api/chats/:chatId] ⚠️ Erro ao deletar na Evolution API: ${evolutionResponse.status} - ${errorText}`);
              // Continua mesmo se falhar na Evolution API, ainda deleta do banco
            }
          }
        }
      } catch (evolutionError) {
        console.error(`[DELETE /api/chats/:chatId] ❌ Erro ao deletar na Evolution API:`, evolutionError);
        // Continua mesmo se falhar na Evolution API, ainda deleta do banco
      }
    }

    // Deleta do banco de dados
    const deleteResult = await pool.query(
      `DELETE FROM user_data 
       WHERE user_id = $1 AND data_type = 'chats' AND data_key = $2`,
      [req.user.id, decodedChatId]
    );

    if (deleteResult.rowCount > 0) {
      console.log(`[DELETE /api/chats/:chatId] ✅ Chat deletado do banco de dados: ${decodedChatId}`);
      res.json({ 
        success: true, 
        message: 'Chat deletado com sucesso',
        deletedFromDB: true,
        deletedFromEvolution: apiConfig && apiConfig.baseUrl && !apiConfig.isDemo
      });
    } else {
      console.warn(`[DELETE /api/chats/:chatId] ⚠️ Chat não encontrado no banco: ${decodedChatId}`);
      res.status(404).json({ 
        success: false, 
        error: 'Chat não encontrado' 
      });
    }
  } catch (error) {
    console.error('[DELETE /api/chats/:chatId] Erro ao deletar chat:', error);
    res.status(500).json({ 
      error: 'Erro ao deletar chat', 
      details: error.message 
    });
  }
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({ 
    service: 'Zentria Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      login: '/api/auth/login',
      data: '/api/data/:dataType'
    }
  });
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    res.status(500).json({ status: 'error', database: 'disconnected', error: error.message });
  }
});

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Health check: http://0.0.0.0:${PORT}/api/health`);
  console.log(`🌐 Acessível em: http://localhost:${PORT} e http://${process.env.SERVER_IP || 'localhost'}:${PORT}`);
});

// Tratamento de erros
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Porta ${PORT} já está em uso`);
    console.error(`💡 Para encontrar e encerrar o processo usando a porta ${PORT}, execute:`);
    console.error(`   lsof -ti:${PORT} | xargs kill -9`);
    console.error(`   ou`);
    console.error(`   fuser -k ${PORT}/tcp`);
    console.error(`   ou`);
    console.error(`   netstat -tulpn | grep :${PORT}`);
  } else {
    console.error('❌ Erro no servidor:', error);
  }
  process.exit(1);
});

// ============================================================================
// Endpoints específicos para configurações globais do sistema (ApiConfig)
// Configurações são compartilhadas entre todos os usuários
// ============================================================================

// Carregar configurações globais do sistema
app.get('/api/config', authenticateToken, dataLimiter, async (req, res) => {
  try {
    // Busca configurações globais (user_id = NULL ou user_id = 0)
    // Primeiro tenta com user_id = NULL, depois com user_id = 0
    let result = await pool.query(
      `SELECT data_value FROM user_data 
       WHERE user_id IS NULL AND data_type = 'config' AND data_key = 'apiConfig'`
    );

    // Se não encontrou com NULL, tenta com 0
    if (result.rows.length === 0) {
      result = await pool.query(
        `SELECT data_value FROM user_data 
         WHERE user_id = 0 AND data_type = 'config' AND data_key = 'apiConfig'`
      );
    }

    if (result.rows.length > 0) {
      // Parse do JSON armazenado
      const config = typeof result.rows[0].data_value === 'string' 
        ? JSON.parse(result.rows[0].data_value)
        : result.rows[0].data_value;
      res.json({ success: true, config });
    } else {
      // Retorna configuração padrão se não existir
      res.json({ 
        success: true, 
        config: {
          baseUrl: '',
          apiKey: '',
          instanceName: 'zapflow',
          isDemo: false,
          googleClientId: '',
          geminiApiKey: '',
          holidayStates: []
        }
      });
    }
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
    res.status(500).json({ error: 'Erro ao carregar configurações' });
  }
});

// Salvar configurações globais do sistema (apenas ADMIN pode salvar)
app.put('/api/config', authenticateToken, dataLimiter, async (req, res) => {
  try {
    // Verifica se o usuário é ADMIN
    const userResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0 || userResult.rows[0].role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas administradores podem salvar configurações do sistema' });
    }

    const { config } = req.body;

    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'config é obrigatório e deve ser um objeto' });
    }

    // Remove qualquer configuração global existente (NULL ou 0)
    await pool.query(
      `DELETE FROM user_data 
       WHERE (user_id IS NULL OR user_id = 0) AND data_type = 'config' AND data_key = 'apiConfig'`
    );
    
    // Insere como configuração global (user_id = NULL)
    await pool.query(
      `INSERT INTO user_data (user_id, data_type, data_key, data_value)
       VALUES (NULL, 'config', 'apiConfig', $1)`,
      [JSON.stringify(config)]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

// ============================================================================
// Endpoint para limpeza de chats inválidos (apenas ADMIN)
// ============================================================================

app.post('/api/admin/cleanup-invalid-chats', authenticateToken, dataLimiter, async (req, res) => {
  try {
    // Verifica se o usuário é ADMIN
    const userResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0 || userResult.rows[0].role !== 'ADMIN') {
      return res.status(403).json({ error: 'Apenas administradores podem executar limpeza de chats' });
    }

    // Importa dinamicamente o serviço de limpeza
    const { cleanInvalidChats } = await import('./services/chatCleanupService.js');
    
    // Executa a limpeza
    const summary = await cleanInvalidChats(pool);

    res.json({ 
      success: true, 
      message: 'Limpeza de chats inválidos concluída',
      summary 
    });
  } catch (error) {
    console.error('Erro ao executar limpeza de chats:', error);
    res.status(500).json({ error: 'Erro ao executar limpeza de chats' });
  }
});

// ============================================================================
// Rotina periódica de limpeza de chats inválidos (executa a cada 6 horas)
// ============================================================================

let cleanupInterval = null;

function startChatCleanupScheduler() {
  // Executa limpeza a cada 6 horas (21600000 ms)
  const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 horas
  
  // Executa imediatamente na inicialização (após 5 minutos para não sobrecarregar)
  setTimeout(async () => {
    try {
      console.log('[ChatCleanup] 🕐 Executando limpeza inicial de chats inválidos...');
      const { cleanInvalidChats } = await import('./services/chatCleanupService.js');
      await cleanInvalidChats(pool);
    } catch (error) {
      console.error('[ChatCleanup] ❌ Erro na limpeza inicial:', error);
    }
  }, 5 * 60 * 1000); // 5 minutos após inicialização
  
  // Agenda execuções periódicas
  cleanupInterval = setInterval(async () => {
    try {
      console.log('[ChatCleanup] 🕐 Executando limpeza periódica de chats inválidos...');
      const { cleanInvalidChats } = await import('./services/chatCleanupService.js');
      await cleanInvalidChats(pool);
    } catch (error) {
      console.error('[ChatCleanup] ❌ Erro na limpeza periódica:', error);
    }
  }, CLEANUP_INTERVAL_MS);
  
  console.log('[ChatCleanup] ✅ Agendador de limpeza de chats iniciado (executa a cada 6 horas)');
}

// Inicia o agendador quando o servidor inicia
startChatCleanupScheduler();

// ============================================================================
// Endpoints para cache de feriados municipais
// ============================================================================

// Buscar feriados municipais do cache
app.get('/api/holidays/municipal-cache', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { cityName, stateCode, year } = req.query;
    
    if (!cityName || !stateCode || !year) {
      return res.status(400).json({ error: 'cityName, stateCode e year são obrigatórios' });
    }

    const result = await pool.query(
      `SELECT holidays, last_updated 
       FROM municipal_holidays_cache 
       WHERE city_name = $1 AND state_code = $2 AND year = $3`,
      [cityName, stateCode, parseInt(year)]
    );

    if (result.rows.length > 0) {
      const cacheData = result.rows[0];
      const lastUpdated = new Date(cacheData.last_updated);
      const daysSinceUpdate = (new Date().getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
      
      // Retorna os dados se foram atualizados há menos de 10 dias
      if (daysSinceUpdate < 10) {
        return res.json({
          success: true,
          holidays: cacheData.holidays,
          lastUpdated: cacheData.last_updated,
          fromCache: true
        });
      }
    }

    // Não encontrou ou está expirado
    res.json({
      success: true,
      holidays: null,
      fromCache: false
    });
  } catch (error) {
    console.error('Erro ao buscar cache de feriados municipais:', error);
    res.status(500).json({ error: 'Erro ao buscar cache de feriados municipais' });
  }
});

// Salvar feriados municipais no cache
app.post('/api/holidays/municipal-cache', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { cityName, stateCode, year, holidays } = req.body;
    
    console.log('[HolidaysCache] 📥 Recebendo dados:', { 
      cityName: cityName?.substring(0, 50), 
      stateCode, 
      year, 
      holidaysCount: Array.isArray(holidays) ? holidays.length : 'não é array' 
    });
    
    if (!cityName || !stateCode || !year || !Array.isArray(holidays)) {
      console.error('[HolidaysCache] ❌ Dados inválidos:', { 
        cityName: !!cityName, 
        stateCode: !!stateCode, 
        year: !!year, 
        holidaysIsArray: Array.isArray(holidays) 
      });
      return res.status(400).json({ error: 'cityName, stateCode, year e holidays (array) são obrigatórios' });
    }

    // Não salva arrays vazios no cache (economiza espaço e evita problemas)
    if (holidays.length === 0) {
      console.log(`[HolidaysCache] ⚠️ Array vazio para ${cityName}/${stateCode} (${year}), não salvando no cache`);
      return res.json({ success: true, message: 'Array vazio, não salvo no cache' });
    }

    const holidaysJson = JSON.stringify(holidays);
    const yearInt = parseInt(year);
    
    if (isNaN(yearInt)) {
      console.error('[HolidaysCache] ❌ Ano inválido:', year);
      return res.status(400).json({ error: 'Ano deve ser um número válido' });
    }

    // Usa UPSERT para atualizar se já existir
    const result = await pool.query(
      `INSERT INTO municipal_holidays_cache (city_name, state_code, year, holidays, last_updated)
       VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (city_name, state_code, year)
       DO UPDATE SET holidays = $4::jsonb, last_updated = CURRENT_TIMESTAMP`,
      [cityName.trim(), stateCode.trim().toUpperCase(), yearInt, holidaysJson]
    );

    console.log(`[HolidaysCache] ✅ Cache salvo para ${cityName}/${stateCode} (${year}) - ${holidays.length} feriados`);
    res.json({ success: true, message: 'Cache de feriados municipais salvo com sucesso' });
  } catch (error) {
    console.error('[HolidaysCache] ❌ Erro ao salvar cache:', error);
    console.error('[HolidaysCache] ❌ Detalhes:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      constraint: error.constraint,
      table: error.table
    });
    res.status(500).json({ 
      error: 'Erro ao salvar cache de feriados municipais', 
      details: error.message,
      code: error.code
    });
  }
});

// Buscar múltiplos feriados do cache (otimizado para estados)
app.post('/api/holidays/municipal-cache/batch', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { cities } = req.body; // Array de {cityName, stateCode, year}
    
    if (!Array.isArray(cities) || cities.length === 0) {
      return res.status(400).json({ error: 'cities deve ser um array não vazio' });
    }

    const results = [];
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    for (const city of cities) {
      const { cityName, stateCode, year } = city;
      
      if (!cityName || !stateCode || !year) continue;

      const result = await pool.query(
        `SELECT holidays, last_updated 
         FROM municipal_holidays_cache 
         WHERE city_name = $1 AND state_code = $2 AND year = $3`,
        [cityName, stateCode, parseInt(year)]
      );

      if (result.rows.length > 0) {
        const cacheData = result.rows[0];
        const lastUpdated = new Date(cacheData.last_updated);
        
        // Retorna os dados se foram atualizados há menos de 10 dias
        if (lastUpdated >= tenDaysAgo) {
          results.push({
            cityName,
            stateCode,
            year: parseInt(year),
            holidays: cacheData.holidays,
            lastUpdated: cacheData.last_updated,
            fromCache: true
          });
          continue;
        }
      }

      // Não encontrou ou está expirado
      results.push({
        cityName,
        stateCode,
        year: parseInt(year),
        holidays: null,
        fromCache: false
      });
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Erro ao buscar cache em lote de feriados municipais:', error);
    res.status(500).json({ error: 'Erro ao buscar cache em lote de feriados municipais' });
  }
});

// ==================== Controle de Cota do Gemini ====================

// Verificar se a cota do Gemini foi excedida hoje
app.get('/api/gemini/quota/check', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    const result = await pool.query(
      `SELECT quota_exceeded_date FROM gemini_quota_control 
       WHERE quota_exceeded_date = $1`,
      [todayStr]
    );

    const isExceeded = result.rows.length > 0;
    res.json({ 
      success: true, 
      quotaExceeded: isExceeded,
      date: todayStr
    });
  } catch (error) {
    console.error('[GeminiQuota] Erro ao verificar cota:', error);
    res.status(500).json({ 
      error: 'Erro ao verificar cota do Gemini',
      details: error.message
    });
  }
});

// Marcar que a cota foi excedida hoje
app.post('/api/gemini/quota/exceeded', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // Usa UPSERT para atualizar se já existir
    await pool.query(
      `INSERT INTO gemini_quota_control (quota_exceeded_date, last_updated)
       VALUES ($1, CURRENT_TIMESTAMP)
       ON CONFLICT (quota_exceeded_date)
       DO UPDATE SET last_updated = CURRENT_TIMESTAMP`,
      [todayStr]
    );

    console.log(`[GeminiQuota] ✅ Cota excedida marcada para ${todayStr}`);
    res.json({ 
      success: true, 
      message: 'Cota excedida marcada com sucesso',
      date: todayStr
    });
  } catch (error) {
    console.error('[GeminiQuota] Erro ao marcar cota excedida:', error);
    res.status(500).json({ 
      error: 'Erro ao marcar cota excedida',
      details: error.message
    });
  }
});

// Limpar registros antigos de cota excedida (manutenção)
app.delete('/api/gemini/quota/cleanup', authenticateToken, async (req, res) => {
  try {
    // Remove registros com mais de 2 dias
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

    const result = await pool.query(
      `DELETE FROM gemini_quota_control 
       WHERE quota_exceeded_date < $1`,
      [twoDaysAgoStr]
    );

    console.log(`[GeminiQuota] 🧹 Limpeza: ${result.rowCount} registros antigos removidos`);
    res.json({ 
      success: true, 
      message: 'Limpeza concluída',
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('[GeminiQuota] Erro ao limpar registros antigos:', error);
    res.status(500).json({ 
      error: 'Erro ao limpar registros antigos',
      details: error.message
    });
  }
});

// ==================== Feriados Nacionais ====================

// Buscar feriados nacionais da BrasilAPI e salvar no banco
app.post('/api/holidays/national/sync', authenticateToken, async (req, res) => {
  try {
    const { year } = req.body;
    const targetYear = year || new Date().getFullYear();
    
    console.log(`[NationalHolidays] 🔍 Buscando feriados nacionais de ${targetYear} na BrasilAPI...`);
    
    // Busca na BrasilAPI
    const response = await fetch(`https://brasilapi.com.br/api/feriados/v1/${targetYear}`);
    
    if (!response.ok) {
      throw new Error(`BrasilAPI retornou status ${response.status}`);
    }
    
    const holidays = await response.json();
    
    if (!Array.isArray(holidays)) {
      throw new Error('Resposta da BrasilAPI não é um array');
    }
    
    console.log(`[NationalHolidays] ✅ Recebidos ${holidays.length} feriados da BrasilAPI`);
    
    // Valida e salva no banco (com validação de duplicações)
    let saved = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const holiday of holidays) {
      try {
        // Valida dados
        if (!holiday.date || !holiday.name) {
          console.warn(`[NationalHolidays] ⚠️ Feriado inválido ignorado:`, holiday);
          errors++;
          continue;
        }
        
        // Valida formato de data (BrasilAPI retorna YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(holiday.date)) {
          console.warn(`[NationalHolidays] ⚠️ Formato de data inválido ignorado: ${holiday.date}`);
          errors++;
          continue;
        }
        
        // Extrai ano da data para validar
        const holidayYear = parseInt(holiday.date.substring(0, 4));
        if (holidayYear !== targetYear) {
          console.warn(`[NationalHolidays] ⚠️ Ano da data não corresponde ao ano solicitado: ${holiday.date} (esperado: ${targetYear})`);
          // Continua mesmo assim, pois pode ser um feriado que cai no ano seguinte
        }
        
        // Tenta inserir (UNIQUE constraint previne duplicações)
        const result = await pool.query(
          `INSERT INTO national_holidays (date, name, year, type, updated_at)
           VALUES ($1, $2, $3, 'national', CURRENT_TIMESTAMP)
           ON CONFLICT (date, name) 
           DO UPDATE SET updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [holiday.date, holiday.name.trim(), holidayYear]
        );
        
        if (result.rows.length > 0) {
          saved++;
        } else {
          skipped++;
        }
      } catch (error) {
        // Se for erro de duplicação, ignora (já existe)
        if (error.code === '23505') {
          skipped++;
        } else {
          console.error(`[NationalHolidays] ❌ Erro ao salvar feriado ${holiday.name}:`, error.message);
          errors++;
        }
      }
    }
    
    console.log(`[NationalHolidays] ✅ Sincronização concluída: ${saved} salvos, ${skipped} já existiam, ${errors} erros`);
    
    res.json({
      success: true,
      message: 'Feriados nacionais sincronizados com sucesso',
      year: targetYear,
      total: holidays.length,
      saved,
      skipped,
      errors
    });
  } catch (error) {
    console.error('[NationalHolidays] ❌ Erro ao sincronizar feriados nacionais:', error);
    res.status(500).json({
      error: 'Erro ao sincronizar feriados nacionais',
      details: error.message
    });
  }
});

// Buscar feriados nacionais do banco
app.get('/api/holidays/national', authenticateToken, async (req, res) => {
  try {
    const { year, startDate, endDate } = req.query;
    
    let query = 'SELECT date, name, year, type FROM national_holidays WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (year) {
      query += ` AND year = $${paramIndex}`;
      params.push(parseInt(year));
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    query += ' ORDER BY date ASC';
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      holidays: result.rows.map(row => {
        // Garante que a data seja retornada no formato YYYY-MM-DD sem problemas de timezone
        const date = row.date instanceof Date 
          ? `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}`
          : row.date.toISOString().split('T')[0];
        return {
          date: date,
          name: row.name,
          type: row.type || 'national',
          year: row.year
        };
      })
    });
  } catch (error) {
    console.error('[NationalHolidays] ❌ Erro ao buscar feriados nacionais:', error);
    res.status(500).json({
      error: 'Erro ao buscar feriados nacionais',
      details: error.message
    });
  }
});

// Buscar feriados nacionais dos próximos N dias
app.get('/api/holidays/national/upcoming', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 15;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + days);
    
    const result = await pool.query(
      `SELECT date, name, year, type 
       FROM national_holidays 
       WHERE date >= $1 AND date <= $2 
       ORDER BY date ASC`,
      [today.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
    );
    
    res.json({
      success: true,
      holidays: result.rows.map(row => {
        // Garante que a data seja retornada no formato YYYY-MM-DD sem problemas de timezone
        const date = row.date instanceof Date 
          ? `${row.date.getFullYear()}-${String(row.date.getMonth() + 1).padStart(2, '0')}-${String(row.date.getDate()).padStart(2, '0')}`
          : row.date.toISOString().split('T')[0];
        return {
          date: date,
          name: row.name,
          type: row.type || 'national',
          year: row.year
        };
      })
    });
  } catch (error) {
    console.error('[NationalHolidays] ❌ Erro ao buscar próximos feriados nacionais:', error);
    res.status(500).json({
      error: 'Erro ao buscar próximos feriados nacionais',
      details: error.message
    });
  }
});

// Validar e remover duplicações
app.post('/api/holidays/national/validate', authenticateToken, async (req, res) => {
  try {
    console.log('[NationalHolidays] 🔍 Validando e removendo duplicações...');
    
    // Encontra duplicações (mesma data e nome)
    const duplicates = await pool.query(
      `SELECT date, name, COUNT(*) as count, array_agg(id) as ids
       FROM national_holidays
       GROUP BY date, name
       HAVING COUNT(*) > 1`
    );
    
    let removed = 0;
    
    for (const dup of duplicates.rows) {
      // Mantém o mais recente, remove os outros
      const ids = dup.ids;
      const idsToRemove = ids.slice(1); // Remove todos exceto o primeiro
      
      await pool.query(
        `DELETE FROM national_holidays WHERE id = ANY($1)`,
        [idsToRemove]
      );
      
      removed += idsToRemove.length;
      console.log(`[NationalHolidays] 🧹 Removidos ${idsToRemove.length} duplicados de ${dup.name} (${dup.date})`);
    }
    
    res.json({
      success: true,
      message: 'Validação concluída',
      duplicatesFound: duplicates.rows.length,
      removed
    });
  } catch (error) {
    console.error('[NationalHolidays] ❌ Erro ao validar duplicações:', error);
    res.status(500).json({
      error: 'Erro ao validar duplicações',
      details: error.message
    });
  }
});

