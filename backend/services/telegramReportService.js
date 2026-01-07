const CONFIG_DATA_TYPE = 'integrations';
const CONFIG_KEY = 'telegram_report';
const STATUS_KEY = 'telegram_report_status';

const DEFAULT_TIME = '08:00';
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const CHECK_INTERVAL_MS = 30 * 1000; // 30s: suficiente para acertar o minuto sem drift perceptível

let schedulerInterval = null;
let lastSentDateKey = null; // YYYY-MM-DD no timezone configurado
let isSending = false;

const safeJsonParse = (value) => {
  if (!value) return null;
  try {
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getDatePartsInTz = (date, timeZone) => {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const yyyy = map.year || '0000';
  const mm = map.month || '00';
  const dd = map.day || '00';
  const hh = map.hour || '00';
  const mi = map.minute || '00';

  return {
    dateKey: `${yyyy}-${mm}-${dd}`,
    timeKey: `${hh}:${mi}`,
    yyyy,
    mm,
    dd,
    hh,
    mi
  };
};

const normalizeTimeHHMM = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mi)) return null;
  if (hh < 0 || hh > 23) return null;
  if (mi < 0 || mi > 59) return null;
  return `${String(hh).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
};

const formatBytes = (bytes) => {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = n;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

const upsertGlobalUserData = async (pool, dataType, dataKey, valueObj) => {
  await pool.query(
    `INSERT INTO user_data (user_id, data_type, data_key, data_value)
     VALUES (NULL, $1, $2, $3)
     ON CONFLICT (COALESCE(user_id, 0), data_type, data_key)
     DO UPDATE SET data_value = EXCLUDED.data_value, updated_at = CURRENT_TIMESTAMP`,
    [dataType, dataKey, JSON.stringify(valueObj)]
  );
};

const getGlobalUserData = async (pool, dataType, dataKey) => {
  const result = await pool.query(
    `SELECT data_value FROM user_data
     WHERE data_type = $1 AND data_key = $2 AND (user_id IS NULL OR user_id = 0)
     ORDER BY (user_id IS NULL) DESC, updated_at DESC
     LIMIT 1`,
    [dataType, dataKey]
  );
  if (result.rows.length === 0) return null;
  return safeJsonParse(result.rows[0].data_value);
};

export const getTelegramReportConfig = async ({ pool }) => {
  const raw = await getGlobalUserData(pool, CONFIG_DATA_TYPE, CONFIG_KEY);
  const enabled = !!raw?.enabled;
  const time = normalizeTimeHHMM(raw?.time) || DEFAULT_TIME;
  const timezone = (typeof raw?.timezone === 'string' && raw.timezone.trim()) ? raw.timezone.trim() : DEFAULT_TIMEZONE;
  const chatId = typeof raw?.chatId === 'string' ? raw.chatId.trim() : '';
  const botToken = typeof raw?.botToken === 'string' ? raw.botToken.trim() : '';

  // Status separado (não contém token)
  const status = await getGlobalUserData(pool, CONFIG_DATA_TYPE, STATUS_KEY);

  return {
    enabled,
    time,
    timezone,
    chatId,
    botToken,
    botTokenConfigured: botToken.length > 0,
    status: status || null
  };
};

export const saveTelegramReportConfig = async ({ pool, config }) => {
  const current = await getTelegramReportConfig({ pool });

  const enabled = typeof config?.enabled === 'boolean' ? config.enabled : current.enabled;
  const time = normalizeTimeHHMM(config?.time) || current.time || DEFAULT_TIME;
  const timezone = (typeof config?.timezone === 'string' && config.timezone.trim())
    ? config.timezone.trim()
    : (current.timezone || DEFAULT_TIMEZONE);
  const chatId = typeof config?.chatId === 'string' ? config.chatId.trim() : current.chatId;

  // Token: se vier vazio, mantém o atual (não sobrescreve com vazio)
  const incomingToken = typeof config?.botToken === 'string' ? config.botToken.trim() : null;
  const botToken = incomingToken !== null && incomingToken.length > 0 ? incomingToken : current.botToken;

  const toSave = { enabled, time, timezone, chatId, botToken };
  await upsertGlobalUserData(pool, CONFIG_DATA_TYPE, CONFIG_KEY, toSave);

  return {
    enabled,
    time,
    timezone,
    chatId,
    botTokenConfigured: botToken.length > 0
  };
};

const sendTelegramMessage = async ({ botToken, chatId, text }) => {
  if (!botToken || !chatId) {
    throw new Error('Telegram não configurado (token/chatId ausentes)');
  }

  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const desc = data?.description || `HTTP ${response.status}`;
    throw new Error(`Falha ao enviar Telegram: ${desc}`);
  }
};

const safeQuerySingleNumber = async (pool, sql, params = [], field = 'value') => {
  try {
    const result = await pool.query(sql, params);
    const v = result?.rows?.[0]?.[field];
    if (v === undefined || v === null) return null;
    const n = typeof v === 'string' ? Number(v) : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch (e) {
    return null;
  }
};

const safeQueryRows = async (pool, sql, params = []) => {
  try {
    const result = await pool.query(sql, params);
    return result?.rows || [];
  } catch {
    return [];
  }
};

const buildDailyReportText = async ({ pool, now = new Date(), tz }) => {
  const parts = getDatePartsInTz(now, tz);

  const dbBytes = await safeQuerySingleNumber(pool, 'SELECT pg_database_size(current_database()) AS value', [], 'value');
  const usersCount = await safeQuerySingleNumber(pool, 'SELECT COUNT(*)::int AS value FROM users', [], 'value');
  const contactsCount = await safeQuerySingleNumber(pool, 'SELECT COUNT(*)::int AS value FROM contacts', [], 'value');
  const departmentsCount = await safeQuerySingleNumber(pool, 'SELECT COUNT(*)::int AS value FROM departments', [], 'value');
  const workflowsCount = await safeQuerySingleNumber(pool, 'SELECT COUNT(*)::int AS value FROM workflows', [], 'value');
  const quickRepliesCount = await safeQuerySingleNumber(pool, 'SELECT COUNT(*)::int AS value FROM quick_replies', [], 'value');
  const userDataCount = await safeQuerySingleNumber(pool, 'SELECT COUNT(*)::int AS value FROM user_data', [], 'value');

  // Quota Gemini (se tabela existir)
  const geminiExceededToday = await safeQuerySingleNumber(
    pool,
    `SELECT COUNT(*)::int AS value FROM gemini_quota_control WHERE quota_exceeded_date = CURRENT_DATE`,
    [],
    'value'
  );

  const lastGeminiExceeded = await safeQueryRows(
    pool,
    `SELECT quota_exceeded_date::text AS date FROM gemini_quota_control ORDER BY quota_exceeded_date DESC LIMIT 1`
  );

  const topTypes = await safeQueryRows(
    pool,
    `SELECT data_type, COUNT(*)::int AS count
     FROM user_data
     GROUP BY data_type
     ORDER BY count DESC
     LIMIT 8`
  );

  const lines = [];
  lines.push(`📊 Zentria — Relatório diário (${parts.dateKey})`);
  lines.push(`🕘 Horário (${tz}): ${parts.timeKey}`);
  lines.push('');

  if (dbBytes !== null) lines.push(`🗄️ Banco: ${formatBytes(dbBytes)}`);
  if (usersCount !== null) lines.push(`👤 Usuários: ${usersCount}`);
  if (contactsCount !== null) lines.push(`📇 Contatos: ${contactsCount}`);
  if (departmentsCount !== null) lines.push(`🏷️ Setores: ${departmentsCount}`);
  if (workflowsCount !== null) lines.push(`🧩 Workflows: ${workflowsCount}`);
  if (quickRepliesCount !== null) lines.push(`⚡ Respostas rápidas: ${quickRepliesCount}`);
  if (userDataCount !== null) lines.push(`📦 user_data (linhas): ${userDataCount}`);

  lines.push('');
  if (topTypes.length > 0) {
    lines.push('📌 Top data_types:');
    for (const row of topTypes) {
      const type = row?.data_type || 'unknown';
      const count = row?.count ?? 0;
      lines.push(`- ${type}: ${count}`);
    }
    lines.push('');
  }

  if (geminiExceededToday !== null) {
    const exceeded = geminiExceededToday > 0;
    const last = lastGeminiExceeded?.[0]?.date ? ` (último: ${lastGeminiExceeded[0].date})` : '';
    lines.push(`🤖 Gemini quota excedida hoje: ${exceeded ? 'SIM' : 'NÃO'}${last}`);
  }

  // Limite do Telegram: 4096 chars
  let text = lines.join('\n').trim();
  if (text.length > 3900) {
    text = text.slice(0, 3900) + '\n...\n(Resumo truncado)';
  }
  return text;
};

export const sendTelegramDailyReport = async ({ pool, reason = 'scheduled' }) => {
  const { enabled, botToken, chatId, timezone } = await getTelegramReportConfig({ pool });
  if (!enabled) {
    return { success: false, skipped: true, reason: 'disabled' };
  }

  if (!botToken || !chatId) {
    return { success: false, skipped: true, reason: 'missing_config' };
  }

  const startedAt = Date.now();
  const tz = timezone || DEFAULT_TIMEZONE;
  const text = await buildDailyReportText({ pool, tz });

  try {
    await sendTelegramMessage({ botToken, chatId, text });
    const durationMs = Date.now() - startedAt;
    await upsertGlobalUserData(pool, CONFIG_DATA_TYPE, STATUS_KEY, {
      lastSentAt: new Date().toISOString(),
      lastReason: reason,
      lastDurationMs: durationMs,
      lastErrorAt: null,
      lastError: null
    });
    return { success: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    await upsertGlobalUserData(pool, CONFIG_DATA_TYPE, STATUS_KEY, {
      lastSentAt: null,
      lastReason: reason,
      lastDurationMs: durationMs,
      lastErrorAt: new Date().toISOString(),
      lastError: error?.message || String(error)
    });
    return { success: false, error: error?.message || String(error), durationMs };
  }
};

// Envia o relatório imediatamente (independente de estar "enabled" ou não).
// Útil para botão "Enviar agora" no painel de configurações.
export const sendTelegramReportNow = async ({ pool, reason = 'manual' }) => {
  const { botToken, chatId, timezone } = await getTelegramReportConfig({ pool });

  if (!botToken || !chatId) {
    return { success: false, skipped: true, reason: 'missing_config' };
  }

  const startedAt = Date.now();
  const tz = timezone || DEFAULT_TIMEZONE;
  const text = await buildDailyReportText({ pool, tz });

  try {
    await sendTelegramMessage({ botToken, chatId, text });
    const durationMs = Date.now() - startedAt;
    await upsertGlobalUserData(pool, CONFIG_DATA_TYPE, STATUS_KEY, {
      lastSentAt: new Date().toISOString(),
      lastReason: reason,
      lastDurationMs: durationMs,
      lastErrorAt: null,
      lastError: null
    });
    return { success: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    await upsertGlobalUserData(pool, CONFIG_DATA_TYPE, STATUS_KEY, {
      lastSentAt: null,
      lastReason: reason,
      lastDurationMs: durationMs,
      lastErrorAt: new Date().toISOString(),
      lastError: error?.message || String(error)
    });
    return { success: false, error: error?.message || String(error), durationMs };
  }
};

export const sendTelegramTestMessage = async ({ pool, botToken, chatId }) => {
  const text = '✅ Zentria — teste de integração Telegram (relatório diário).';
  await sendTelegramMessage({ botToken, chatId, text });
  return { success: true };
};

const shouldSendNow = ({ enabled, time, timezone }) => {
  if (!enabled) return { should: false };
  const tz = timezone || DEFAULT_TIMEZONE;
  const parts = getDatePartsInTz(new Date(), tz);
  const target = normalizeTimeHHMM(time) || DEFAULT_TIME;

  if (parts.timeKey !== target) return { should: false };
  if (lastSentDateKey === parts.dateKey) return { should: false };
  return { should: true, dateKey: parts.dateKey };
};

export const stopTelegramReportScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  isSending = false;
  lastSentDateKey = null;
};

export const ensureTelegramReportSchedulerConfigured = async ({ pool }) => {
  // Sempre reinicia com config atual (simplifica consistência quando admin altera config)
  stopTelegramReportScheduler();

  const cfg = await getTelegramReportConfig({ pool });
  if (!cfg?.enabled) {
    return { started: false, enabled: false };
  }

  schedulerInterval = setInterval(async () => {
    if (isSending) return;
    const decision = shouldSendNow({ enabled: cfg.enabled, time: cfg.time, timezone: cfg.timezone });
    if (!decision.should) return;

    isSending = true;
    try {
      const result = await sendTelegramDailyReport({ pool, reason: 'scheduled' });
      if (result?.success) {
        lastSentDateKey = decision.dateKey;
      }
    } finally {
      isSending = false;
    }
  }, CHECK_INTERVAL_MS);

  return { started: true, enabled: true };
};


