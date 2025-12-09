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

// Rate limiter geral para todas as rotas (proteção básica)
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '15') * 60 * 1000, // 15 minutos por padrão
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'), // 100 requisições por janela
  message: {
    error: 'Muitas requisições deste IP, tente novamente mais tarde.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true, // Retorna informações de rate limit nos headers `RateLimit-*`
  legacyHeaders: false, // Desabilita headers `X-RateLimit-*`
  // Função para obter o IP do cliente (considera proxies/load balancers)
  keyGenerator: (req) => {
    return req.ip || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           'unknown';
  },
  // Handler customizado para erros
  handler: (req, res) => {
    res.status(429).json({
      error: 'Muitas requisições deste IP, tente novamente mais tarde.',
      retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) + ' segundos'
    });
  },
  // Skip rate limiting para health checks (não conta no limite)
  skip: (req) => {
    return req.path === '/api/health' || req.path === '/';
  }
});

// Rate limiter RESTRITIVO para login (prevenção de brute force)
const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '15') * 60 * 1000, // 15 minutos
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5'), // Apenas 5 tentativas de login por 15 minutos
  message: {
    error: 'Muitas tentativas de login. Por segurança, tente novamente em alguns minutos.',
    retryAfter: '15 minutos'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Para login, também considerar o username para rate limiting mais inteligente
    const username = req.body?.username || 'unknown';
    const ip = req.ip || 
               req.headers['x-forwarded-for']?.split(',')[0] || 
               req.headers['x-real-ip'] || 
               req.connection.remoteAddress || 
               'unknown';
    return `login:${ip}:${username}`;
  },
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json({
      error: 'Muitas tentativas de login. Por segurança, sua conta foi temporariamente bloqueada.',
      retryAfter: `${Math.ceil(retryAfter / 60)} minutos`,
      message: 'Por favor, aguarde antes de tentar novamente. Se você esqueceu sua senha, entre em contato com o administrador.'
    });
  },
  // Log de tentativas bloqueadas para auditoria
  onLimitReached: (req, res, options) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
    const username = req.body?.username || 'unknown';
    console.warn(`[SECURITY] Rate limit atingido para login - IP: ${ip}, Username: ${username}, Tentativas: ${req.rateLimit.totalHits}`);
  }
});

// Rate limiter para rotas de dados (proteção contra abuso de API)
const dataLimiter = rateLimit({
  windowMs: parseInt(process.env.DATA_RATE_LIMIT_WINDOW_MS || '1') * 60 * 1000, // 1 minuto
  max: parseInt(process.env.DATA_RATE_LIMIT_MAX || '60'), // 60 requisições por minuto
  message: {
    error: 'Muitas requisições de dados. Aguarde um momento antes de continuar.',
    retryAfter: '1 minuto'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Para rotas autenticadas, usar user ID se disponível
    if (req.user?.id) {
      return `data:user:${req.user.id}`;
    }
    return req.ip || 
           req.headers['x-forwarded-for']?.split(',')[0] || 
           req.headers['x-real-ip'] || 
           req.connection.remoteAddress || 
           'unknown';
  },
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json({
      error: 'Muitas requisições. Aguarde um momento antes de continuar.',
      retryAfter: `${retryAfter} segundos`
    });
  }
});

// Aplicar rate limiting geral em todas as rotas
app.use(generalLimiter);

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

    let query = 'SELECT data_value FROM user_data WHERE user_id = $1 AND data_type = $2';
    const params = [req.user.id, dataType];

    if (key) {
      query += ' AND data_key = $3';
      params.push(key);
    }

    const result = await pool.query(query, params);

    if (key && result.rows.length > 0) {
      res.json(result.rows[0].data_value);
    } else if (!key) {
      const data = {};
      result.rows.forEach(row => {
        data[row.data_key] = row.data_value;
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

    await pool.query(
      `INSERT INTO user_data (user_id, data_type, data_key, data_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, data_type, data_key)
       DO UPDATE SET data_value = $4, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, dataType, key, JSON.stringify(value)]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar dados:', error);
    res.status(500).json({ error: 'Erro ao salvar dados' });
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

// Rota para salvar múltiplos dados de uma vez
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
           ON CONFLICT (user_id, data_type, data_key)
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

// Rota raiz
app.get('/', (req, res) => {
  res.json({ 
    service: 'ZapFlow Backend API',
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
  } else {
    console.error('❌ Erro no servidor:', error);
  }
  process.exit(1);
});

