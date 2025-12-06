import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
app.use(express.json());

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
app.post('/api/auth/login', async (req, res) => {
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
app.get('/api/data/:dataType', authenticateToken, async (req, res) => {
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

app.post('/api/data/:dataType', authenticateToken, async (req, res) => {
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

app.put('/api/data/:dataType/:key', authenticateToken, async (req, res) => {
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

app.delete('/api/data/:dataType/:key', authenticateToken, async (req, res) => {
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
app.post('/api/data/:dataType/batch', authenticateToken, async (req, res) => {
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

