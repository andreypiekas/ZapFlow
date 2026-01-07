import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import dns from 'dns';
import net from 'net';
import os from 'os';
import { ensureEvolutionWebhookConfigured } from './services/evolutionWebhookService.js';
import {
  ensureTelegramReportSchedulerConfigured,
  getTelegramReportConfig,
  saveTelegramReportConfig,
  sendTelegramReportNow,
  sendTelegramTestMessage
} from './services/telegramReportService.js';

dotenv.config();

const { Pool } = pg;
const app = express();

// ============================================================================
// Segurança - Flags e validações básicas de ambiente
// ============================================================================
const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';

const parseBoolEnv = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return defaultValue;
};

// Rate limiting: habilitado por padrão em produção (pode desabilitar via env)
const ENABLE_RATE_LIMITING = process.env.ENABLE_RATE_LIMITING !== undefined
  ? parseBoolEnv(process.env.ENABLE_RATE_LIMITING, false)
  : isProd;

// HSTS: só faz sentido quando há HTTPS; browsers ignoram header em HTTP
const ENABLE_HSTS = process.env.ENABLE_HSTS !== undefined
  ? parseBoolEnv(process.env.ENABLE_HSTS, true)
  : isProd;
const HSTS_MAX_AGE = Number.parseInt(process.env.HSTS_MAX_AGE || '15552000', 10); // 180 dias

// JWT: em produção, JWT_SECRET é obrigatório (não usar fallback)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (isProd) {
    console.error('[SECURITY] ❌ JWT_SECRET não definido. Em produção este valor é obrigatório.');
    process.exit(1);
  }
  console.warn('[SECURITY] ⚠️ JWT_SECRET não definido. Usando fallback inseguro APENAS para dev.');
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'insecure_dev_fallback_change_me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_ALGORITHM = 'HS256';

// Trust proxy: por segurança, NÃO confiamos em X-Forwarded-* por padrão.
// Em produção com Nginx/Proxy, configure TRUST_PROXY=1 (ou true).
const TRUST_PROXY = process.env.TRUST_PROXY;
if (TRUST_PROXY !== undefined) {
  if (parseBoolEnv(TRUST_PROXY, false)) {
    app.set('trust proxy', 1);
  } else {
    const n = Number(TRUST_PROXY);
    app.set('trust proxy', Number.isFinite(n) ? n : false);
  }
}

// Remove header que revela tecnologia
app.disable('x-powered-by');

const PORT = process.env.PORT || 3001;
const dnsPromises = dns.promises;

// Configuração do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 
    `postgresql://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || ''}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'zentria'}`
});

// Middleware CORS
const corsOrigins = (process.env.CORS_ORIGIN?.split(',').map(o => o.trim()).filter(Boolean)) || ['http://localhost:5173', 'http://localhost:3000'];
// Em dev, permitir origens na rede privada (LAN) por conveniência; em prod, desabilitado por padrão.
const allowPrivateNetworkCors = process.env.CORS_ALLOW_PRIVATE_NETWORK !== undefined
  ? parseBoolEnv(process.env.CORS_ALLOW_PRIVATE_NETWORK, false)
  : !isProd;
// IP do servidor (opcional): usado para liberar CORS do IP do host quando não for localhost.
// Se não estiver definido, tentamos detectar automaticamente (zero configuração manual).
const detectServerIp = () => {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      const iface = nets[name] || [];
      for (const addr of iface) {
        if (!addr) continue;
        // Node 18+: addr.family pode ser number (4/6) ou string ('IPv4'/'IPv6')
        const isV4 = addr.family === 4 || addr.family === 'IPv4';
        if (isV4 && !addr.internal && addr.address && !addr.address.startsWith('169.254.')) {
          return addr.address;
        }
      }
    }
  } catch {
    // noop
  }
  return null;
};

const serverIP = process.env.SERVER_IP || detectServerIp();

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requisições sem origin (Postman, curl, webhooks da Evolution API, etc)
    if (!origin) {
      return callback(null, true);
    }

    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      return callback(null, false);
    }

    const originHost = parsedOrigin.hostname;
    
    // Verificar se origin está na lista permitida
    if (corsOrigins.includes(origin) || corsOrigins.includes('*')) {
      return callback(null, true);
    }
    
    // Permitir se origin contém localhost
    if (originHost === 'localhost' || originHost === '127.0.0.1' || originHost === '::1') {
      return callback(null, true);
    }
    
    // Permitir se origin contém o IP do servidor (frontend e outros serviços na mesma rede)
    if (serverIP && originHost === serverIP) {
      return callback(null, true);
    }
    
    // Permitir requisições na rede privada (LAN) APENAS se explicitamente habilitado (ou dev default)
    if (allowPrivateNetworkCors) {
      const kind = net.isIP(originHost);
      if (kind === 4) {
        if (
          originHost.startsWith('10.') ||
          originHost.startsWith('192.168.') ||
          originHost.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
        ) {
          return callback(null, true);
        }
      }
      if (kind === 6) {
        const normalized = originHost.toLowerCase();
        if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80')) {
          return callback(null, true);
        }
      }
    }
    
    // Se chegou aqui, rejeita (mas não loga como erro para evitar spam)
    callback(null, false); // Retorna false ao invés de Error para evitar stack trace
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'apikey', 'X-Webhook-Secret']
}));

// Headers básicos de segurança (evita dependência externa; CSP/HSTS completos ficam para o item 13)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

  const isHttps = !!req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  if (ENABLE_HSTS && isHttps && Number.isFinite(HSTS_MAX_AGE) && HSTS_MAX_AGE > 0) {
    res.setHeader('Strict-Transport-Security', `max-age=${HSTS_MAX_AGE}; includeSubDomains`);
  }

  next();
});
// Aumentar limite do body parser para permitir payloads grandes (chats com muitas mensagens)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================================================
// RATE LIMITING - Prevenção de Brute Force e abuso de API
// ============================================================================
// - Por padrão: habilitado quando NODE_ENV=production
// - Ajustes via env:
//   ENABLE_RATE_LIMITING=true|false
//   RATE_LIMIT_WINDOW_MINUTES, RATE_LIMIT_MAX
//   LOGIN_RATE_LIMIT_WINDOW_MINUTES, LOGIN_RATE_LIMIT_MAX
//   DATA_RATE_LIMIT_WINDOW_SECONDS, DATA_RATE_LIMIT_MAX
//   WEBHOOK_RATE_LIMIT_WINDOW_SECONDS, WEBHOOK_RATE_LIMIT_MAX
// ============================================================================

const noopLimiter = (req, res, next) => next();

const generalLimiter = ENABLE_RATE_LIMITING ? rateLimit({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15', 10) * 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_MAX || '1000', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições deste IP, tente novamente mais tarde.' },
  skip: (req) => req.path === '/api/health' || req.path === '/',
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json({ error: 'Muitas requisições. Tente novamente mais tarde.', retryAfter: `${retryAfter}s` });
  }
}) : noopLimiter;

const loginLimiter = ENABLE_RATE_LIMITING ? rateLimit({
  windowMs: Number.parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES || '15', 10) * 60 * 1000,
  max: Number.parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : 'unknown';
    return `login:${req.ip}:${username}`;
  },
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : 'unknown';
    console.warn(`[SECURITY] Rate limit login - ip=${req.ip} username=${username} hits=${req.rateLimit.totalHits}`);
    res.status(429).json({
      error: 'Muitas tentativas de login. Tente novamente mais tarde.',
      retryAfter: `${Math.ceil(retryAfter / 60)} minutos`
    });
  }
}) : noopLimiter;

const dataLimiter = ENABLE_RATE_LIMITING ? rateLimit({
  windowMs: Number.parseInt(process.env.DATA_RATE_LIMIT_WINDOW_SECONDS || '60', 10) * 1000,
  max: Number.parseInt(process.env.DATA_RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.id) return `data:user:${req.user.id}`;
    return `data:ip:${req.ip}`;
  },
  handler: (req, res) => {
    const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);
    res.status(429).json({ error: 'Muitas requisições. Aguarde um momento antes de continuar.', retryAfter: `${retryAfter}s` });
  }
}) : noopLimiter;

// Webhook pode receber bursts; por isso limites mais altos (ajustável via env)
const webhookLimiter = ENABLE_RATE_LIMITING ? rateLimit({
  windowMs: Number.parseInt(process.env.WEBHOOK_RATE_LIMIT_WINDOW_SECONDS || '60', 10) * 1000,
  max: Number.parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '2000', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `webhook:ip:${req.ip}`,
  handler: (req, res) => {
    res.status(429).json({ error: 'Webhook rate limit excedido. Tente novamente mais tarde.' });
  }
}) : noopLimiter;

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
    const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET, { algorithms: [JWT_ALGORITHM] });
    const userId = decoded?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const result = await pool.query('SELECT id, username, name, email, role FROM users WHERE id = $1', [userId]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(403).json({ error: 'Token inválido' });
  }
};

// ============================================================================
// Utilidades para Link Preview (SSRF-safe)
// ============================================================================
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PREVIEW_MAX_CONTENT_LENGTH = 500_000; // 500 KB
const PREVIEW_MAX_HTML = 200_000; // 200 KB
const PREVIEW_TIMEOUT = 7000; // 7s

const isPrivateIp = (ip) => {
  if (!ip) return true;
  const kind = net.isIP(ip);
  if (kind === 4) {
    return ip.startsWith('10.') ||
           ip.startsWith('127.') ||
           ip.startsWith('192.168.') ||
           ip.startsWith('169.254.') ||
           ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./);
  }
  if (kind === 6) {
    const normalized = ip.toLowerCase();
    return normalized === '::1' ||
           normalized.startsWith('fc') ||
           normalized.startsWith('fd') ||
           normalized.startsWith('fe80');
  }
  return true;
};

const normalizeUrlForPreview = (rawUrl) => {
  if (!rawUrl) return null;
  try {
    const trimmed = String(rawUrl).trim();
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch (e) {
    return null;
  }
};

const resolveHostToIp = async (hostname) => {
  if (!hostname) return null;
  if (net.isIP(hostname)) return hostname;
  const lookupResult = await dnsPromises.lookup(hostname, { family: 0 });
  return lookupResult?.address;
};

const extractMeta = (html, attr, value) => {
  if (!html) return undefined;
  const regex = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
  const match = html.match(regex);
  return match ? match[1] : undefined;
};

const parseLinkPreview = (html, targetUrl) => {
  if (!html) return { url: targetUrl };
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  const ogTitle = extractMeta(html, 'property', 'og:title') || extractMeta(html, 'name', 'twitter:title');
  const ogDescription = extractMeta(html, 'property', 'og:description') ||
                        extractMeta(html, 'name', 'twitter:description') ||
                        extractMeta(html, 'name', 'description');
  let ogImage = extractMeta(html, 'property', 'og:image') || extractMeta(html, 'name', 'twitter:image');

  try {
    if (ogImage) {
      ogImage = new URL(ogImage, targetUrl).toString();
    }
  } catch (e) {
    ogImage = undefined;
  }

  return {
    url: targetUrl,
    title: (ogTitle || titleTag || '').trim().substring(0, 180) || undefined,
    description: (ogDescription || '').trim().substring(0, 400) || undefined,
    image: ogImage,
    fetchedAt: new Date().toISOString()
  };
};

class PreviewFetchError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'PreviewFetchError';
  }
}

const PREVIEW_MAX_REDIRECTS = Number.parseInt(process.env.PREVIEW_MAX_REDIRECTS || '4', 10);
const isRedirectStatus = (status) => [301, 302, 303, 307, 308].includes(status);

// Lê o body com limite real (evita baixar HTML gigante quando content-length não existe)
const readResponseTextLimited = async (response, maxBytes) => {
  try {
    if (!response?.body || typeof response.body.getReader !== 'function') {
      const t = await response.text();
      return t.length > maxBytes ? t.slice(0, maxBytes) : t;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let received = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      received += value.byteLength || 0;
      if (received > maxBytes) {
        // Cancela para parar o download (best-effort)
        try { await reader.cancel(); } catch {}
        break;
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    chunks.push(decoder.decode());
    return chunks.join('');
  } catch {
    return '';
  }
};

// Fetch SSRF-safe com validação de redirects (não pode redirecionar para IP privado)
const fetchUrlForPreview = async (startUrl) => {
  let currentUrl = startUrl;

  for (let i = 0; i <= PREVIEW_MAX_REDIRECTS; i++) {
    // Valida destino antes de conectar
    let parsed;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new PreviewFetchError('invalid_url', 'URL inválida');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new PreviewFetchError('invalid_url', 'Protocolo não permitido');
    }

    const hostname = parsed.hostname;
    if (!hostname || hostname.toLowerCase() === 'localhost') {
      throw new PreviewFetchError('blocked_host', 'Host não permitido');
    }

    let resolvedIp = null;
    try {
      resolvedIp = await resolveHostToIp(hostname);
    } catch {
      throw new PreviewFetchError('resolve_failed', 'Host inválido ou não resolvido');
    }

    if (isPrivateIp(resolvedIp)) {
      throw new PreviewFetchError('private_ip', 'URL não permitida (IP interno/privado)');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PREVIEW_TIMEOUT);

    let response;
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Zentria-LinkPreview/1.0',
          'Accept': 'text/html,application/xhtml+xml'
        }
      });
    } catch (err) {
      throw new PreviewFetchError('fetch_failed', err?.message || 'Falha ao buscar URL');
    } finally {
      clearTimeout(timeoutId);
    }

    // Se houver redirect, valida o próximo destino (evita SSRF via redirect)
    if (isRedirectStatus(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        return { response, finalUrl: currentUrl };
      }

      if (i === PREVIEW_MAX_REDIRECTS) {
        throw new PreviewFetchError('redirect_limit', 'Muitos redirects');
      }

      const next = normalizeUrlForPreview(new URL(location, currentUrl).toString());
      if (!next) {
        throw new PreviewFetchError('invalid_redirect', 'Redirect inválido');
      }

      currentUrl = next;
      continue;
    }

    return { response, finalUrl: currentUrl };
  }

  throw new PreviewFetchError('redirect_limit', 'Muitos redirects');
};

// ============================================================================
// Validações simples de input (evita dados inesperados e abusos fáceis)
// ============================================================================
const MAX_DATA_TYPE_LEN = 64;
const MAX_DATA_KEY_LEN = 256;

const coerceFirstQueryValue = (value) => (Array.isArray(value) ? value[0] : value);

const normalizeDataTypeParam = (value) => {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > MAX_DATA_TYPE_LEN) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(v)) return null;
  return v;
};

const normalizeDataKeyParam = (value) => {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.length > MAX_DATA_KEY_LEN) return null;
  // Permite IDs comuns (chatId, messageId, etc) sem abrir demais
  if (!/^[\w@.+:-]+$/.test(v)) return null;
  return v;
};

const parsePositiveIntParam = (value) => {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

// Rotas de autenticação
// Aplicar rate limiting restritivo na rota de login
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const usernameRaw = req.body?.username;
    const passwordRaw = req.body?.password;
    const username = typeof usernameRaw === 'string' ? usernameRaw.trim() : '';
    const password = typeof passwordRaw === 'string' ? passwordRaw : '';

    if (!username || !password) {
      return res.status(400).json({ error: 'Username e password são obrigatórios' });
    }

    if (username.length > 80 || password.length > 200) {
      return res.status(400).json({ error: 'Credenciais inválidas' });
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
      EFFECTIVE_JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN, algorithm: JWT_ALGORITHM }
    );

    // Carrega departamentos (multi) para o usuário logado
    let deptIds = [];
    try {
      const deptRes = await pool.query(
        'SELECT department_id::text AS id FROM user_departments WHERE user_id = $1 ORDER BY department_id',
        [user.id]
      );
      deptIds = deptRes.rows.map(r => String(r.id));
    } catch {
      deptIds = [];
    }
    const legacyDept = user.department_id ? String(user.department_id) : null;
    if (legacyDept && !deptIds.includes(legacyDept)) deptIds.push(legacyDept);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        departmentId: user.department_id || undefined,
        departmentIds: deptIds
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
    const safeDataType = normalizeDataTypeParam(req.params.dataType);
    if (!safeDataType) {
      return res.status(400).json({ error: 'dataType inválido' });
    }

    const rawKey = coerceFirstQueryValue(req.query.key);
    const hasKey = rawKey !== undefined && rawKey !== null && String(rawKey).trim().length > 0;
    const safeKey = hasKey ? normalizeDataKeyParam(String(rawKey)) : null;
    if (hasKey && !safeKey) {
      return res.status(400).json({ error: 'key inválido' });
    }

    // ⚠️ IMPORTANTE (mídia/base64 via webhook):
    // `webhook_messages` é salvo pelo webhook sem contexto de usuário (user_id = NULL).
    // Para exibir imagens antigas (onde `imageMessage: {}` vem vazio via REST), o frontend consulta:
    //   GET /api/data/webhook_messages?key=<messageId>
    // Portanto, para `webhook_messages` precisamos permitir leitura do registro global (user_id IS NULL)
    // mantendo autenticação (apenas usuários logados).
    const isWebhookMessages = safeDataType === 'webhook_messages';

    let query;
    let params;

    if (isWebhookMessages) {
      // Evita vazar um dump inteiro de webhooks: exige key e retorna no máximo 1 registro
      if (!safeKey) {
        return res.status(400).json({ error: 'key é obrigatório para webhook_messages' });
      }

      query = `
        SELECT data_value, data_key
        FROM user_data
        WHERE data_type = $1
          AND data_key = $2
          AND (user_id = $3 OR user_id IS NULL)
        ORDER BY (user_id IS NULL) ASC, updated_at DESC
        LIMIT 1
      `;
      params = [safeDataType, safeKey, req.user.id];
    } else {
      query = 'SELECT data_value, data_key FROM user_data WHERE user_id = $1 AND data_type = $2';
      params = [req.user.id, safeDataType];

      if (safeKey) {
        query += ' AND data_key = $3';
        params.push(safeKey);
      }
    }

    const result = await pool.query(query, params);

    if (safeKey && result.rows.length > 0) {
      // Se há key, retorna o valor parseado
      try {
        const parsed = typeof result.rows[0].data_value === 'string' 
          ? JSON.parse(result.rows[0].data_value) 
          : result.rows[0].data_value;
        res.json(parsed);
      } catch (e) {
        res.json(result.rows[0].data_value);
      }
    } else if (!safeKey) {
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
          if (!dataKey && safeDataType === 'chats' && parsedValue && parsedValue.id) {
            dataKey = parsedValue.id;
            console.log(`[GET /api/data/:dataType] Corrigindo data_key null/undefined para chat ${parsedValue.id}`);
          }
          
          // Se ainda não tem chave válida, ignora este registro
          if (!dataKey) {
            console.warn(`[GET /api/data/:dataType] Ignorando registro sem data_key válido para ${safeDataType}`);
            return;
          }
          
          data[dataKey] = parsedValue;
        } catch (e) {
          // Se não conseguiu parsear, tenta usar data_key diretamente
          let dataKey = row.data_key;
          if (!dataKey && safeDataType === 'chats') {
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
    const safeDataType = normalizeDataTypeParam(req.params.dataType);
    if (!safeDataType) {
      return res.status(400).json({ error: 'dataType inválido' });
    }

    const keyRaw = req.body?.key;
    const keyStr = keyRaw !== undefined && keyRaw !== null ? String(keyRaw) : '';
    const safeKey = keyStr ? normalizeDataKeyParam(keyStr) : null;
    const value = req.body?.value;

    if (!safeKey || value === undefined) {
      return res.status(400).json({ error: 'key e value são obrigatórios' });
    }

    // Usa a expressão do índice funcional no ON CONFLICT
    // O índice é: (COALESCE(user_id, 0), data_type, data_key)
    await pool.query(
      `INSERT INTO user_data (user_id, data_type, data_key, data_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (COALESCE(user_id, 0), data_type, data_key)
       DO UPDATE SET data_value = $4, updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, safeDataType, safeKey, JSON.stringify(value)]
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
    const safeDataType = normalizeDataTypeParam(req.params.dataType);
    const keyStr = req.params.key !== undefined && req.params.key !== null ? String(req.params.key) : '';
    const safeKey = keyStr ? normalizeDataKeyParam(keyStr) : null;
    const value = req.body?.value;

    if (!safeDataType) {
      return res.status(400).json({ error: 'dataType inválido' });
    }

    if (!safeKey) {
      return res.status(400).json({ error: 'key inválido' });
    }

    if (value === undefined) {
      return res.status(400).json({ error: 'value é obrigatório' });
    }

    await pool.query(
      `UPDATE user_data 
       SET data_value = $1, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2 AND data_type = $3 AND data_key = $4`,
      [JSON.stringify(value), req.user.id, safeDataType, safeKey]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao atualizar dados:', error);
    res.status(500).json({ error: 'Erro ao atualizar dados' });
  }
});

app.delete('/api/data/:dataType/:key', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const safeDataType = normalizeDataTypeParam(req.params.dataType);
    const keyStr = req.params.key !== undefined && req.params.key !== null ? String(req.params.key) : '';
    const safeKey = keyStr ? normalizeDataKeyParam(keyStr) : null;

    if (!safeDataType) {
      return res.status(400).json({ error: 'dataType inválido' });
    }

    if (!safeKey) {
      return res.status(400).json({ error: 'key inválido' });
    }

    await pool.query(
      'DELETE FROM user_data WHERE user_id = $1 AND data_type = $2 AND data_key = $3',
      [req.user.id, safeDataType, safeKey]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar dados:', error);
    res.status(500).json({ error: 'Erro ao deletar dados' });
  }
});

// Link Preview SSRF-safe com cache global em user_data (user_id NULL, data_type = 'link_previews')
app.get('/api/link-preview', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const rawUrl = req.query.url;
    const normalizedUrl = normalizeUrlForPreview(rawUrl);

    if (!normalizedUrl) {
      return res.status(400).json({ error: 'URL inválida. Use http(s) e inclua domínio válido.' });
    }

    const parsed = new URL(normalizedUrl);
    const hostname = parsed.hostname;

    if (!hostname || hostname.toLowerCase() === 'localhost') {
      return res.status(400).json({ error: 'Host não permitido' });
    }

    let resolvedIp = null;
    try {
      resolvedIp = await resolveHostToIp(hostname);
    } catch (err) {
      console.error('[link-preview] Falha ao resolver host:', hostname, err?.message);
      return res.status(400).json({ error: 'Host inválido ou não resolvido' });
    }

    if (isPrivateIp(resolvedIp)) {
      return res.status(400).json({ error: 'URL não permitida (IP interno/privado)' });
    }

    const cacheKey = normalizedUrl.toLowerCase();
    const cached = await pool.query(
      `SELECT data_value FROM user_data WHERE data_type = $1 AND data_key = $2 AND user_id IS NULL LIMIT 1`,
      ['link_previews', cacheKey]
    );

    if (cached.rows.length > 0) {
      const cachedValue = typeof cached.rows[0].data_value === 'string'
        ? JSON.parse(cached.rows[0].data_value)
        : cached.rows[0].data_value;
      const fetchedAt = cachedValue?.fetchedAt ? new Date(cachedValue.fetchedAt).getTime() : 0;
      if (fetchedAt && (Date.now() - fetchedAt) < PREVIEW_TTL_MS) {
        return res.json({ success: true, preview: cachedValue });
      }
    }

    let response;
    let finalUrl = normalizedUrl;

    try {
      const fetched = await fetchUrlForPreview(normalizedUrl);
      response = fetched.response;
      finalUrl = fetched.finalUrl || normalizedUrl;
    } catch (err) {
      const code = err?.code;
      const message = err?.message || 'Falha ao buscar URL';

      // Erros de bloqueio/SSRF/redirect inválido viram 400 (input não permitido)
      if (['private_ip', 'blocked_host', 'invalid_redirect', 'redirect_limit', 'invalid_url', 'resolve_failed'].includes(code)) {
        return res.status(400).json({ error: message });
      }

      console.error('[link-preview] Erro ao buscar URL:', normalizedUrl, message);
      return res.status(502).json({ error: 'Falha ao buscar URL para preview' });
    }

    if (!response.ok) {
      return res.status(502).json({ error: `Falha ao obter preview (HTTP ${response.status})` });
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLengthHeader = Number(response.headers.get('content-length') || 0);

    if (contentLengthHeader > PREVIEW_MAX_CONTENT_LENGTH) {
      return res.status(400).json({ error: 'Conteúdo muito grande para gerar preview' });
    }

    let html = '';
    if (contentType.includes('text/html')) {
      html = await readResponseTextLimited(response, PREVIEW_MAX_HTML);
      if (!html) {
        console.warn('[link-preview] Não foi possível ler HTML, prosseguindo com preview parcial.');
      }
    }

    const preview = parseLinkPreview(html, finalUrl);

    await pool.query(
      `INSERT INTO user_data (user_id, data_type, data_key, data_value)
       VALUES (NULL, $1, $2, $3)
       ON CONFLICT (COALESCE(user_id, 0), data_type, data_key)
       DO UPDATE SET data_value = EXCLUDED.data_value, updated_at = CURRENT_TIMESTAMP`,
      ['link_previews', cacheKey, JSON.stringify(preview)]
    );

    res.json({ success: true, preview });
  } catch (error) {
    console.error('[link-preview] Erro inesperado:', error);
    res.status(500).json({ error: 'Erro ao gerar preview' });
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
      `
        SELECT
          u.id,
          u.username,
          u.name,
          u.email,
          u.role,
          u.department_id,
          COALESCE(
            ARRAY_AGG(ud.department_id::text) FILTER (WHERE ud.department_id IS NOT NULL),
            '{}'
          ) AS department_ids
        FROM users u
        LEFT JOIN user_departments ud ON ud.user_id = u.id
        GROUP BY u.id, u.username, u.name, u.email, u.role, u.department_id
        ORDER BY u.name
      `,
      []
    );

    res.json(result.rows.map(row => ({
      id: row.id.toString(),
      username: row.username,
      name: row.name,
      email: row.email || row.username,
      role: row.role,
      departmentId: row.department_id || undefined,
      departmentIds: (() => {
        const ids = Array.isArray(row.department_ids) ? row.department_ids.filter(Boolean).map(String) : [];
        const legacy = row.department_id ? String(row.department_id) : null;
        if (legacy && !ids.includes(legacy)) ids.push(legacy);
        return ids;
      })()
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

    const { username, password, name, email, role, departmentId, departmentIds } = req.body;

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

    // Normaliza departamentos (novo: departmentIds; compat: departmentId)
    const normalizedDepartmentIds = (() => {
      const effectiveRole = (role || 'AGENT');
      if (effectiveRole === 'ADMIN') return [];
      if (Array.isArray(departmentIds)) return departmentIds.map(String).map(s => s.trim()).filter(Boolean);
      if (departmentId) return [String(departmentId).trim()].filter(Boolean);
      return [];
    })();

    const deptInts = normalizedDepartmentIds
      .map(v => Number.parseInt(String(v), 10))
      .filter(n => Number.isFinite(n) && n > 0);

    // Valida IDs de departamentos (somente departamentos do admin criador)
    if (deptInts.length > 0) {
      const deptCheck = await pool.query(
        'SELECT id FROM departments WHERE user_id = $1 AND id = ANY($2::int[])',
        [req.user.id, deptInts]
      );
      if (deptCheck.rows.length !== deptInts.length) {
        return res.status(400).json({ error: 'departmentIds inválidos ou não pertencem ao usuário administrador' });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const primaryDept = deptInts.length > 0 ? String(deptInts[0]) : null;

      // Criar usuário (mantém department_id como compat / "primário")
      const result = await client.query(
        `INSERT INTO users (username, password_hash, name, email, role, department_id) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING id, username, name, email, role, department_id`,
        [username, hashedPassword, name, email || username, role || 'AGENT', primaryDept]
      );

      const newUserId = result.rows[0].id;

      if (deptInts.length > 0) {
        const values = deptInts.map((_, i) => `($1, $${i + 2})`).join(', ');
        await client.query(
          `INSERT INTO user_departments (user_id, department_id)
           VALUES ${values}
           ON CONFLICT (user_id, department_id) DO NOTHING`,
          [newUserId, ...deptInts]
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        success: true,
        user: {
          id: result.rows[0].id,
          username: result.rows[0].username,
          name: result.rows[0].name,
          email: result.rows[0].email,
          role: result.rows[0].role,
          departmentId: result.rows[0].department_id || undefined,
          departmentIds: deptInts.map(String)
        }
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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

    const { name, email, role, password, departmentId, departmentIds } = req.body;

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

    // Carrega role atual para decidir regras de departamento (ex.: ADMIN não usa departamentos)
    const existingUserRes = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (existingUserRes.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    const existingRole = existingUserRes.rows[0].role;
    const finalRole = role || existingRole;

    const wantsDepartmentUpdate = departmentIds !== undefined || departmentId !== undefined || finalRole === 'ADMIN';

    // Normaliza departamentos (novo: departmentIds; compat: departmentId)
    let normalizedDeptIds = null; // null => não altera
    if (wantsDepartmentUpdate) {
      if (finalRole === 'ADMIN') {
        normalizedDeptIds = [];
      } else if (departmentIds !== undefined) {
        if (departmentIds === null) {
          normalizedDeptIds = [];
        } else if (Array.isArray(departmentIds)) {
          normalizedDeptIds = departmentIds.map(String).map(s => s.trim()).filter(Boolean);
        } else {
          return res.status(400).json({ error: 'departmentIds deve ser um array' });
        }
      } else if (departmentId !== undefined) {
        normalizedDeptIds = departmentId ? [String(departmentId).trim()].filter(Boolean) : [];
      }
    }

    const deptInts = Array.isArray(normalizedDeptIds)
      ? normalizedDeptIds
          .map(v => Number.parseInt(String(v), 10))
          .filter(n => Number.isFinite(n) && n > 0)
      : [];

    // Se estamos alterando departamentos, valida e atualiza coluna legacy `department_id`
    if (normalizedDeptIds !== null) {
      if (deptInts.length > 0) {
        const deptCheck = await pool.query(
          'SELECT id FROM departments WHERE user_id = $1 AND id = ANY($2::int[])',
          [req.user.id, deptInts]
        );
        if (deptCheck.rows.length !== deptInts.length) {
          return res.status(400).json({ error: 'departmentIds inválidos ou não pertencem ao usuário administrador' });
        }
      }

      updateFields.push(`department_id = $${paramIndex++}`);
      params.push(deptInts.length > 0 ? String(deptInts[0]) : null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(userId);

    // Usa transação quando também atualiza user_departments (many-to-many)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, username, name, email, role, department_id`,
        params
      );

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      let finalDeptIds = [];
      if (normalizedDeptIds !== null) {
        // Replace set de departamentos
        await client.query('DELETE FROM user_departments WHERE user_id = $1', [userId]);
        if (deptInts.length > 0) {
          const values = deptInts.map((_, i) => `($1, $${i + 2})`).join(', ');
          await client.query(
            `INSERT INTO user_departments (user_id, department_id)
             VALUES ${values}
             ON CONFLICT (user_id, department_id) DO NOTHING`,
            [userId, ...deptInts]
          );
        }
        finalDeptIds = deptInts.map(String);
      } else {
        // Sem alteração explícita: retorna departamentos atuais (best-effort)
        const deptRes = await client.query(
          'SELECT department_id::text AS id FROM user_departments WHERE user_id = $1 ORDER BY department_id',
          [userId]
        );
        finalDeptIds = deptRes.rows.map(r => String(r.id));
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        user: {
          id: result.rows[0].id,
          username: result.rows[0].username,
          name: result.rows[0].name,
          email: result.rows[0].email,
          role: result.rows[0].role,
          departmentId: result.rows[0].department_id || undefined,
          departmentIds: finalDeptIds
        }
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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
    // Para AGENT: retorna departamentos atribuídos (user_departments) + departamentos próprios (se houver).
    // Para ADMIN: mantém comportamento atual (departamentos do próprio admin).
    const result = req.user.role === 'ADMIN'
      ? await pool.query(
          'SELECT id, name, description, color FROM departments WHERE user_id = $1 ORDER BY name',
          [req.user.id]
        )
      : await pool.query(
          `
            SELECT DISTINCT d.id, d.name, d.description, d.color
            FROM departments d
            LEFT JOIN user_departments ud
              ON ud.department_id = d.id AND ud.user_id = $1
            WHERE d.user_id = $1 OR ud.user_id = $1
            ORDER BY d.name
          `,
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

    const departmentId = parsePositiveIntParam(id);
    if (!departmentId) {
      return res.status(400).json({ error: 'ID inválido' });
    }

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
    params.push(departmentId);
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
    const departmentId = parsePositiveIntParam(id);
    if (!departmentId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const result = await pool.query(
      'DELETE FROM departments WHERE id = $1 AND user_id = $2 RETURNING id',
      [departmentId, req.user.id]
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

    const contactId = parsePositiveIntParam(id);
    if (!contactId) {
      return res.status(400).json({ error: 'ID inválido' });
    }

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
    params.push(contactId);
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
    const contactId = parsePositiveIntParam(id);
    if (!contactId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const result = await pool.query(
      'DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING id',
      [contactId, req.user.id]
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

    const quickReplyId = parsePositiveIntParam(id);
    if (!quickReplyId) {
      return res.status(400).json({ error: 'ID inválido' });
    }

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
    params.push(quickReplyId);
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
    const quickReplyId = parsePositiveIntParam(id);
    if (!quickReplyId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const result = await pool.query(
      'DELETE FROM quick_replies WHERE id = $1 AND user_id = $2 RETURNING id',
      [quickReplyId, req.user.id]
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

    const workflowId = parsePositiveIntParam(id);
    if (!workflowId) {
      return res.status(400).json({ error: 'ID inválido' });
    }

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
    params.push(workflowId);
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
    const workflowId = parsePositiveIntParam(id);
    if (!workflowId) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const result = await pool.query(
      'DELETE FROM workflows WHERE id = $1 AND user_id = $2 RETURNING id',
      [workflowId, req.user.id]
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
    const safeDataType = normalizeDataTypeParam(req.params.dataType);
    if (!safeDataType) {
      return res.status(400).json({ error: 'dataType inválido' });
    }

    const data = req.body?.data; // { key1: value1, key2: value2, ... }

    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'data deve ser um objeto' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const [key, value] of Object.entries(data)) {
        const keyStr = key !== undefined && key !== null ? String(key) : '';
        const safeKey = keyStr ? normalizeDataKeyParam(keyStr) : null;
        if (!safeKey) {
          throw new Error(`Chave inválida no batch: ${keyStr}`);
        }
        await client.query(
          `INSERT INTO user_data (user_id, data_type, data_key, data_value)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (COALESCE(user_id, 0), data_type, data_key)
           DO UPDATE SET data_value = $4, updated_at = CURRENT_TIMESTAMP`,
          [req.user.id, safeDataType, safeKey, JSON.stringify(value)]
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

// ============================================================================
// WEBHOOK ENDPOINT - Evolution API Events
// ============================================================================
// Recebe eventos da Evolution API quando webhook está habilitado
// Quando "Webhook Base64" está ativado, a mídia vem em base64 no payload
// Isso resolve o problema de imageMessage vazio em mensagens antigas do banco
// 
// Suporta duas formas de URL:
// - /api/webhook/evolution (quando "Webhook by Events" está OFF)
// - /api/webhook/evolution/:eventName (quando "Webhook by Events" está ON)
// ============================================================================
const handleWebhookEvolution = async (req, res) => {
  try {
    const event = req.body;
    const eventType = event.event || event.type || req.params.eventName || 'unknown';

    // Segurança opcional: se WEBHOOK_SECRET/EVOLUTION_WEBHOOK_SECRET estiver definido,
    // exige header "X-Webhook-Secret" (para evitar spam/abuso externo).
    // IMPORTANTE: mantemos resposta 200 mesmo quando inválido para evitar retries infinitos da Evolution.
    const expectedSecret = process.env.EVOLUTION_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET;
    if (expectedSecret) {
      const provided = req.headers['x-webhook-secret'];
      const providedValue = Array.isArray(provided) ? provided[0] : provided;
      if (!providedValue || String(providedValue) !== String(expectedSecret)) {
        console.warn('[WEBHOOK] ⚠️ Secret inválido/ausente. Ignorando payload.');
        return res.status(200).json({ received: true, ignored: true, reason: 'invalid_secret' });
      }
    }
    
    // Log detalhado para debug
    const eventNameFromUrl = req.params.eventName ? ` (URL: ${req.params.eventName})` : '';
    console.log(`[WEBHOOK] Evento recebido: ${eventType}${eventNameFromUrl}`);
    console.log(`[WEBHOOK] Payload keys: ${Object.keys(event).join(', ')}`);
    
    // Se for evento de mensagens, log adicional
    if (eventType?.toLowerCase().includes('messages') || event.event?.toLowerCase().includes('messages')) {
      console.log(`[WEBHOOK] Evento de mensagens detectado: ${eventType}`);
      if (event.data) {
        console.log(`[WEBHOOK] event.data existe, tipo: ${typeof event.data}, é array: ${Array.isArray(event.data)}`);
      }
      if (event.messages) {
        console.log(`[WEBHOOK] event.messages existe, tipo: ${typeof event.messages}, é array: ${Array.isArray(event.messages)}, length: ${Array.isArray(event.messages) ? event.messages.length : 'N/A'}`);
      }
    }
    
    // Processa eventos de mensagens
    // A Evolution API pode enviar eventos em diferentes formatos:
    // - eventType: 'messages.upsert', 'MESSAGES_UPSERT', etc.
    // - event.event: 'messages.upsert'
    // - Estrutura: event.data?.messages ou event.messages ou event.data
    const isMessagesEvent = eventType?.toLowerCase().includes('messages.upsert') || 
                           eventType?.toUpperCase().includes('MESSAGES_UPSERT') ||
                           event.event?.toLowerCase() === 'messages.upsert' ||
                           event.event?.toUpperCase() === 'MESSAGES_UPSERT';
    
    if (isMessagesEvent) {
      // Tenta extrair mensagens de diferentes estruturas possíveis
      const messages = event.data?.messages || 
                      event.messages || 
                      event.data?.data?.messages ||
                      (event.data && !Array.isArray(event.data) ? [event.data] : []) ||
                      (Array.isArray(event.data) ? event.data : []);
      
      if (!Array.isArray(messages)) {
        return res.status(200).json({ received: true, processed: 0 });
      }
      
      let processed = 0;
      
      for (const messageData of messages) {
        try {
          // Extrai informações da mensagem
          const messageObj = messageData.message || messageData;
          const key = messageObj.key || messageData.key;
          
          if (!key || !key.remoteJid) {
            continue;
          }
          
          const remoteJid = key.remoteJid;
          const messageId = key.id;
          
          // Verifica se é mensagem de mídia
          const imageMsg = messageObj.imageMessage || messageObj.message?.imageMessage;
          const videoMsg = messageObj.videoMessage || messageObj.message?.videoMessage;
          const audioMsg = messageObj.audioMessage || messageObj.message?.audioMessage;
          const documentMsg = messageObj.documentMessage || messageObj.message?.documentMessage;
          
          // Log para debug de mídia
          if (imageMsg || videoMsg || audioMsg || documentMsg) {
            console.log(`[WEBHOOK] Mensagem de mídia encontrada - messageId: ${messageId}, imageMsg: ${imageMsg ? 'sim' : 'não'}, base64: ${imageMsg?.base64 ? 'presente' : 'ausente'}`);
          }
          
          // Se for mensagem de mídia, tenta extrair base64 (quando Webhook Base64 está habilitado)
          // IMPORTANTE: algumas versões/formatos podem enviar base64 fora do imageMessage.base64
          // (ex.: no nível superior do payload). Então fazemos extração mais robusta.
          if (imageMsg || videoMsg || audioMsg || documentMsg) {
            const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
            const isDataUrl = (v) => isNonEmptyString(v) && v.trim().startsWith('data:') && v.includes('base64,');

            // Candidatos comuns (estrutura varia por versão e configuração)
            const base64Candidate =
              imageMsg?.base64 ||
              videoMsg?.base64 ||
              audioMsg?.base64 ||
              documentMsg?.base64 ||
              // Alguns payloads colocam base64 no topo
              messageObj?.base64 ||
              messageData?.base64 ||
              // Alguns payloads podem encapsular em `data`
              messageData?.data?.base64 ||
              messageData?.data?.message?.imageMessage?.base64 ||
              messageData?.data?.message?.videoMessage?.base64 ||
              messageData?.data?.message?.audioMessage?.base64 ||
              messageData?.data?.message?.documentMessage?.base64 ||
              messageData?.data?.imageMessage?.base64 ||
              messageData?.data?.videoMessage?.base64 ||
              messageData?.data?.audioMessage?.base64 ||
              messageData?.data?.documentMessage?.base64 ||
              // Alguns formatos usam `media` em vez de `base64`
              imageMsg?.media ||
              videoMsg?.media ||
              audioMsg?.media ||
              documentMsg?.media;

            // mimeType: tenta pegar do objeto específico, senão fallback genérico
            let mimeType =
              imageMsg?.mimetype ||
              videoMsg?.mimetype ||
              audioMsg?.mimetype ||
              documentMsg?.mimetype ||
              messageObj?.mimetype ||
              messageData?.mimetype ||
              (imageMsg ? 'image/jpeg' : videoMsg ? 'video/mp4' : audioMsg ? 'audio/ogg; codecs=opus' : 'application/octet-stream');

            let dataUrl = null;
            if (isDataUrl(base64Candidate)) {
              dataUrl = base64Candidate.trim();
              // Se vier como dataURL, tenta inferir o mime
              try {
                const header = dataUrl.split(',')[0] || '';
                const inferred = header.split(':')[1]?.split(';')[0];
                if (inferred) mimeType = inferred;
              } catch {
                // ignore
              }
            } else if (isNonEmptyString(base64Candidate)) {
              dataUrl = `data:${mimeType};base64,${base64Candidate.trim()}`;
            }

            if (dataUrl) {
              // Salva base64 independente de chat existir (pode ser usado depois quando chat for criado)
              // Salva a mensagem completa com base64 para uso posterior
              try {
                await pool.query(
                  `INSERT INTO user_data (user_id, data_type, data_key, data_value)
                   VALUES (NULL, 'webhook_messages', $1, $2)
                   ON CONFLICT (COALESCE(user_id, 0), data_type, data_key)
                   DO UPDATE SET data_value = $2, updated_at = CURRENT_TIMESTAMP`,
                  [messageId, JSON.stringify({
                    messageId,
                    remoteJid,
                    dataUrl,
                    mimeType,
                    timestamp: new Date().toISOString(),
                    rawMessage: messageData
                  })]
                );

                processed++;
                console.log(`[WEBHOOK] ✅ Mensagem com base64 salva: ${messageId} (${mimeType}) para remoteJid: ${remoteJid}`);
              } catch (dbError) {
                console.error(`[WEBHOOK] Erro ao salvar base64 no banco para ${messageId}:`, dbError);
              }
            } else {
              console.log(`[WEBHOOK] ⚠️ Mensagem de mídia sem base64 - messageId: ${messageId}, imageMsg: ${imageMsg ? 'existe' : 'não'}, videoMsg: ${videoMsg ? 'existe' : 'não'}, audioMsg: ${audioMsg ? 'existe' : 'não'}, documentMsg: ${documentMsg ? 'existe' : 'não'}`);
            }
          }
        } catch (msgError) {
          console.error('[WEBHOOK] Erro ao processar mensagem:', msgError);
          // Continua processando outras mensagens
        }
      }
      
      return res.status(200).json({ 
        received: true, 
        processed,
        event: eventType 
      });
    }
    
    // Para outros eventos, apenas confirma recebimento
    res.status(200).json({ received: true, event: eventType });
  } catch (error) {
    console.error('[WEBHOOK] Erro ao processar webhook:', error);
    // Sempre retorna 200 para não causar retry infinito na Evolution API
    res.status(200).json({ 
      received: true, 
      error: 'Erro interno (ignorado)' 
    });
  }
};

// Rota base para webhook (sem nome de evento)
app.post('/api/webhook/evolution', webhookLimiter, handleWebhookEvolution);

// Rota com nome de evento (quando "Webhook by Events" está ON)
// Aceita qualquer nome de evento: /api/webhook/evolution/messages.upsert, /api/webhook/evolution/contacts-update, etc.
app.post('/api/webhook/evolution/:eventName', webhookLimiter, handleWebhookEvolution);

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
  console.log(`🌐 Acessível em: http://localhost:${PORT} e http://${serverIP || 'localhost'}:${PORT}`);

  // ========================================================================
  // Webhook persistente (Evolution) — tenta garantir configuração no startup
  // Fonte de verdade: .env (EVOLUTION_*) e/ou config global no PostgreSQL (/api/config)
  // ========================================================================
  setTimeout(() => {
    ensureEvolutionWebhookConfigured({ pool, serverIP, port: PORT })
      .catch(() => {});
  }, 4000);

  // ========================================================================
  // Relatório diário via Telegram — scheduler (best-effort)
  // ========================================================================
  setTimeout(() => {
    ensureTelegramReportSchedulerConfigured({ pool })
      .catch(() => {});
  }, 6000);
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
      
      console.log(`[GET /api/config] ✅ Configuração encontrada no banco:`, {
        hasBaseUrl: !!config.baseUrl,
        hasApiKey: !!config.apiKey,
        instanceName: config.instanceName || 'não definido'
      });
      
      res.json({ success: true, config });
    } else {
      console.log(`[GET /api/config] ℹ️ Nenhuma configuração encontrada no banco, retornando padrão`);
      // Retorna configuração padrão se não existir
      res.json({ 
        success: true, 
        config: {
          baseUrl: '',
          apiKey: '',
          instanceName: 'zentria',
          isDemo: false,
          googleClientId: '',
          geminiApiKey: '',
          holidayStates: [],
          debugLogsEnabled: false
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
    const deleteResult = await pool.query(
      `DELETE FROM user_data 
       WHERE (user_id IS NULL OR user_id = 0) AND data_type = 'config' AND data_key = 'apiConfig'`
    );
    console.log(`[PUT /api/config] Removidas ${deleteResult.rowCount} configuração(ões) existente(s)`);
    
    // Insere como configuração global (user_id = NULL)
    const insertResult = await pool.query(
      `INSERT INTO user_data (user_id, data_type, data_key, data_value)
       VALUES (NULL, 'config', 'apiConfig', $1)`,
      [JSON.stringify(config)]
    );
    
    console.log(`[PUT /api/config] ✅ Configuração salva com sucesso:`, {
      hasBaseUrl: !!config.baseUrl,
      hasApiKey: !!config.apiKey,
      instanceName: config.instanceName || 'não definido'
    });

    // Reaplica webhook automaticamente quando a configuração global muda
    setTimeout(() => {
      ensureEvolutionWebhookConfigured({ pool, serverIP, port: PORT, overrideConfig: config })
        .catch(() => {});
    }, 1000);

    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

// ============================================================================
// Integração: Telegram (Relatório diário)
// Configs ficam no banco (user_data global) e NÃO fazem parte do /api/config,
// para evitar expor token em clientes não-admin.
// ============================================================================

const requireAdminRole = async (req, res) => {
  const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [req.user.id]);
  if (userResult.rows.length === 0 || userResult.rows[0].role !== 'ADMIN') {
    res.status(403).json({ error: 'Apenas administradores podem configurar o Telegram' });
    return false;
  }
  return true;
};

// Buscar configuração do relatório Telegram (ADMIN)
app.get('/api/integrations/telegram-report', authenticateToken, dataLimiter, async (req, res) => {
  try {
    if (!(await requireAdminRole(req, res))) return;

    const cfg = await getTelegramReportConfig({ pool });

    // Não retorna o token (apenas se está configurado)
    res.json({
      success: true,
      config: {
        enabled: cfg.enabled,
        time: cfg.time,
        timezone: cfg.timezone,
        chatId: cfg.chatId,
        botTokenConfigured: cfg.botTokenConfigured,
        status: cfg.status
      }
    });
  } catch (error) {
    console.error('[TelegramReport] Erro ao carregar config:', error);
    res.status(500).json({ error: 'Erro ao carregar configuração do Telegram' });
  }
});

// Salvar configuração do relatório Telegram (ADMIN)
app.put('/api/integrations/telegram-report', authenticateToken, dataLimiter, async (req, res) => {
  try {
    if (!(await requireAdminRole(req, res))) return;

    const config = req.body?.config;
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'config é obrigatório e deve ser um objeto' });
    }

    const saved = await saveTelegramReportConfig({ pool, config });

    // Recarrega scheduler com a config atual
    await ensureTelegramReportSchedulerConfigured({ pool });

    res.json({ success: true, config: saved });
  } catch (error) {
    console.error('[TelegramReport] Erro ao salvar config:', error);
    res.status(500).json({ error: 'Erro ao salvar configuração do Telegram' });
  }
});

// Enviar mensagem de teste (ADMIN) — usa token/chatId do body (não salva)
app.post('/api/integrations/telegram-report/test', authenticateToken, dataLimiter, async (req, res) => {
  try {
    if (!(await requireAdminRole(req, res))) return;

    const botToken = typeof req.body?.botToken === 'string' ? req.body.botToken.trim() : '';
    const chatId = typeof req.body?.chatId === 'string' ? req.body.chatId.trim() : '';

    if (!botToken || !chatId) {
      return res.status(400).json({ error: 'botToken e chatId são obrigatórios para teste' });
    }

    await sendTelegramTestMessage({ pool, botToken, chatId });
    res.json({ success: true });
  } catch (error) {
    console.error('[TelegramReport] Erro no teste:', error);
    res.status(400).json({ error: error?.message || 'Falha ao enviar mensagem de teste' });
  }
});

// Enviar relatório agora (ADMIN)
app.post('/api/integrations/telegram-report/send-now', authenticateToken, dataLimiter, async (req, res) => {
  try {
    if (!(await requireAdminRole(req, res))) return;

    const result = await sendTelegramReportNow({ pool, reason: 'manual' });

    if (result?.success) {
      return res.json({ success: true, durationMs: result.durationMs });
    }

    if (result?.skipped && result?.reason === 'missing_config') {
      return res.status(400).json({ error: 'Telegram não configurado (token/chatId ausentes)' });
    }

    return res.status(500).json({ error: result?.error || 'Falha ao enviar relatório agora' });
  } catch (error) {
    console.error('[TelegramReport] Erro ao enviar agora:', error);
    res.status(500).json({ error: 'Erro ao enviar relatório agora' });
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

    // Permite salvar array vazio no cache ("cache negativo") para evitar re-pesquisas
    // repetidas por 10 dias quando a cidade não tem feriados municipais.
    // Ainda atualiza last_updated via UPSERT.

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
    
    // Também salva na tabela permanente (se houver feriados)
    try {
      let savedToDB = 0;
      let skippedInDB = 0;
      
      if (!Array.isArray(holidays) || holidays.length === 0) {
        console.log(`[HolidaysCache] ℹ️ Cache negativo salvo para ${cityName}/${stateCode} (${year}) - 0 feriados`);
        return res.json({ success: true, message: 'Cache de feriados municipais salvo com sucesso (vazio)' });
      }

      for (const holiday of holidays) {
        try {
          if (!holiday.date || !holiday.name) continue;
          
          const holidayYear = parseInt(holiday.date.substring(0, 4)) || yearInt;
          
          const dbResult = await pool.query(
            `INSERT INTO municipal_holidays (date, name, city, state, year, type, updated_at)
             VALUES ($1, $2, $3, $4, $5, 'municipal', CURRENT_TIMESTAMP)
             ON CONFLICT (date, name, city, state) 
             DO UPDATE SET updated_at = CURRENT_TIMESTAMP
             RETURNING id`,
            [
              holiday.date,
              holiday.name.trim(),
              cityName.trim(),
              stateCode.trim().toUpperCase(),
              holidayYear
            ]
          );
          
          if (dbResult.rows.length > 0) {
            savedToDB++;
          } else {
            skippedInDB++;
          }
        } catch (dbError) {
          if (dbError.code !== '23505') { // Ignora duplicatas
            console.warn(`[HolidaysCache] ⚠️ Erro ao salvar feriado ${holiday.name} na tabela permanente:`, dbError.message);
          } else {
            skippedInDB++;
          }
        }
      }
      
      console.log(`[HolidaysCache] 💾 Tabela permanente: ${savedToDB} salvos, ${skippedInDB} já existiam`);
    } catch (dbError) {
      console.warn('[HolidaysCache] ⚠️ Erro ao salvar na tabela permanente (continuando):', dbError.message);
    }
    
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

// ==================== Feriados Municipais (Tabela Permanente) ====================

// Salvar feriados municipais na tabela permanente
app.post('/api/holidays/municipal', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { holidays } = req.body; // Array de {date, name, city, state, year}
    
    if (!Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({ error: 'holidays deve ser um array não vazio' });
    }

    console.log(`[MunicipalHolidays] 📥 Recebendo ${holidays.length} feriados municipais para salvar`);

    let saved = 0;
    let skipped = 0;
    let errors = 0;

    for (const holiday of holidays) {
      try {
        // Valida dados obrigatórios
        if (!holiday.date || !holiday.name || !holiday.city || !holiday.state) {
          console.warn(`[MunicipalHolidays] ⚠️ Feriado inválido ignorado:`, holiday);
          errors++;
          continue;
        }

        // Valida formato de data (YYYY-MM-DD)
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(holiday.date)) {
          console.warn(`[MunicipalHolidays] ⚠️ Formato de data inválido ignorado: ${holiday.date}`);
          errors++;
          continue;
        }

        // Extrai ano da data
        const holidayYear = parseInt(holiday.date.substring(0, 4));
        if (isNaN(holidayYear)) {
          console.warn(`[MunicipalHolidays] ⚠️ Ano inválido: ${holiday.date}`);
          errors++;
          continue;
        }

        // Tenta inserir (UNIQUE constraint previne duplicações)
        const result = await pool.query(
          `INSERT INTO municipal_holidays (date, name, city, state, year, type, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'municipal', CURRENT_TIMESTAMP)
           ON CONFLICT (date, name, city, state) 
           DO UPDATE SET updated_at = CURRENT_TIMESTAMP
           RETURNING id`,
          [
            holiday.date,
            holiday.name.trim(),
            holiday.city.trim(),
            holiday.state.trim().toUpperCase(),
            holidayYear
          ]
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
          console.error(`[MunicipalHolidays] ❌ Erro ao salvar feriado ${holiday.name}:`, error.message);
          errors++;
        }
      }
    }

    console.log(`[MunicipalHolidays] ✅ Salvos: ${saved}, Já existiam: ${skipped}, Erros: ${errors}`);

    res.json({
      success: true,
      saved,
      skipped,
      errors,
      total: holidays.length
    });
  } catch (error) {
    console.error('[MunicipalHolidays] ❌ Erro ao salvar feriados municipais:', error);
    res.status(500).json({
      error: 'Erro ao salvar feriados municipais',
      details: error.message
    });
  }
});

// Buscar feriados municipais da tabela permanente
app.get('/api/holidays/municipal', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const { startDate, endDate, city, state, year } = req.query;

    let query = 'SELECT date, name, city, state, year, type FROM municipal_holidays WHERE 1=1';
    const params = [];
    let paramIndex = 1;

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

    if (city) {
      query += ` AND LOWER(city) = LOWER($${paramIndex})`;
      params.push(city);
      paramIndex++;
    }

    if (state) {
      query += ` AND UPPER(state) = UPPER($${paramIndex})`;
      params.push(state);
      paramIndex++;
    }

    if (year) {
      query += ` AND year = $${paramIndex}`;
      params.push(parseInt(year));
      paramIndex++;
    }

    query += ' ORDER BY date ASC, city ASC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      holidays: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('[MunicipalHolidays] ❌ Erro ao buscar feriados municipais:', error);
    res.status(500).json({
      error: 'Erro ao buscar feriados municipais',
      details: error.message
    });
  }
});

// Buscar feriados municipais próximos (similar ao getUpcomingNationalHolidays)
app.get('/api/holidays/municipal/upcoming', authenticateToken, dataLimiter, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 15;
    const { state } = req.query; // Opcional: filtrar por estado

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + days);

    let query = `
      SELECT date, name, city, state, year, type 
      FROM municipal_holidays 
      WHERE date >= $1 AND date <= $2
    `;
    const params = [today.toISOString().split('T')[0], endDate.toISOString().split('T')[0]];

    if (state) {
      query += ' AND UPPER(state) = UPPER($3)';
      params.push(state);
    }

    query += ' ORDER BY date ASC, city ASC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      holidays: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('[MunicipalHolidays] ❌ Erro ao buscar feriados municipais próximos:', error);
    res.status(500).json({
      error: 'Erro ao buscar feriados municipais próximos',
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

