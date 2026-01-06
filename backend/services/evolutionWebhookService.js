// Serviço: garantir Webhook configurado na Evolution API (best-effort)
// Objetivo: remover dependência de configuração "por máquina" e reaplicar no startup.

const DEFAULT_EVENTS = [
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'CHATS_UPSERT',
  'CHATS_UPDATE',
  'CONTACTS_UPSERT',
  'CONNECTION_UPDATE'
];

const isTruthy = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  if (!s) return false;
  return ['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(s);
};

const normalizeUrl = (raw) => {
  if (!raw) return '';
  return String(raw).trim().replace(/\/+$/, '');
};

export const loadGlobalApiConfig = async (pool) => {
  try {
    // Busca configurações globais (user_id = NULL ou user_id = 0)
    let result = await pool.query(
      `SELECT data_value FROM user_data 
       WHERE user_id IS NULL AND data_type = 'config' AND data_key = 'apiConfig'`
    );

    if (result.rows.length === 0) {
      result = await pool.query(
        `SELECT data_value FROM user_data 
         WHERE user_id = 0 AND data_type = 'config' AND data_key = 'apiConfig'`
      );
    }

    if (result.rows.length === 0) return null;

    const config = typeof result.rows[0].data_value === 'string'
      ? JSON.parse(result.rows[0].data_value)
      : result.rows[0].data_value;

    return config && typeof config === 'object' ? config : null;
  } catch {
    return null;
  }
};

let inFlight = null;

export const ensureEvolutionWebhookConfigured = async ({
  pool,
  serverIP,
  port,
  overrideConfig
}) => {
  // Deduplicação simples (evita múltiplas execuções concorrentes)
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const config = overrideConfig || (pool ? await loadGlobalApiConfig(pool) : null) || null;

    const evolutionBaseUrl = normalizeUrl(process.env.EVOLUTION_BASE_URL || config?.baseUrl);
    const evolutionAuthKey = String(
      process.env.EVOLUTION_AUTH_KEY ||
      config?.authenticationApiKey ||
      config?.apiKey ||
      ''
    ).trim();
    const instanceName = String(process.env.EVOLUTION_INSTANCE_NAME || config?.instanceName || '').trim();

    if (!evolutionBaseUrl || !evolutionAuthKey) {
      console.log('[ensureWebhook] ℹ️ Evolution API não configurada (sem baseUrl/apikey). Pulando auto-webhook.');
      return { success: false, skipped: true, reason: 'missing_evolution_config' };
    }

    const backendPublicUrl = normalizeUrl(
      process.env.BACKEND_PUBLIC_URL ||
      process.env.PUBLIC_BASE_URL ||
      process.env.PUBLIC_URL ||
      (serverIP ? `http://${serverIP}:${port}` : `http://localhost:${port}`)
    );

    const webhookUrl = normalizeUrl(process.env.EVOLUTION_WEBHOOK_URL || `${backendPublicUrl}/api/webhook/evolution`);

    const enabled = process.env.EVOLUTION_WEBHOOK_ENABLED == null ? true : isTruthy(process.env.EVOLUTION_WEBHOOK_ENABLED);
    const base64 = process.env.EVOLUTION_WEBHOOK_BASE64 == null ? true : isTruthy(process.env.EVOLUTION_WEBHOOK_BASE64);
    const byEvents = process.env.EVOLUTION_WEBHOOK_BY_EVENTS == null ? true : isTruthy(process.env.EVOLUTION_WEBHOOK_BY_EVENTS);

    const events = String(process.env.EVOLUTION_WEBHOOK_EVENTS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const desiredEvents = events.length ? events : DEFAULT_EVENTS;

    const headers = {
      'Content-Type': 'application/json',
      'apikey': evolutionAuthKey
    };

    // Payloads com chaves alternativas (Evolution varia por versão)
    const payload = {
      enabled,
      url: webhookUrl,
      webhookUrl,
      webhook_by_events: byEvents,
      webhookByEvents: byEvents,
      byEvents,
      webhook_base64: base64,
      webhookBase64: base64,
      base64,
      events: desiredEvents
    };

    const payloadWrapped = { webhook: payload, instanceName: instanceName || undefined };

    const makeAttempt = async (method, path, body, label) => {
      const fullUrl = `${evolutionBaseUrl}${path}`;
      try {
        const res = await fetch(fullUrl, {
          method,
          headers,
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          return { ok: false, status: res.status, text, url: fullUrl, label };
        }
        const json = await res.json().catch(() => null);
        return { ok: true, status: res.status, json, url: fullUrl, label };
      } catch (err) {
        return { ok: false, status: 0, text: String(err?.message || err), url: fullUrl, label };
      }
    };

    // Endpoints candidatos (best-effort)
    const attempts = [];
    // Formato global
    attempts.push(['POST', '/webhook/set', payload, 'POST /webhook/set']);
    attempts.push(['PUT', '/webhook/set', payload, 'PUT /webhook/set']);
    attempts.push(['POST', '/webhook', payload, 'POST /webhook']);
    attempts.push(['PUT', '/webhook', payload, 'PUT /webhook']);
    attempts.push(['POST', '/events/webhook', payload, 'POST /events/webhook']);
    attempts.push(['PUT', '/events/webhook', payload, 'PUT /events/webhook']);
    // Formato com wrapper
    attempts.push(['POST', '/webhook/set', payloadWrapped, 'POST /webhook/set (wrapped)']);
    attempts.push(['PUT', '/webhook/set', payloadWrapped, 'PUT /webhook/set (wrapped)']);
    attempts.push(['POST', '/events/webhook', payloadWrapped, 'POST /events/webhook (wrapped)']);
    // Alguns builds usam /webhook/setWebhook
    attempts.push(['POST', '/webhook/setWebhook', payload, 'POST /webhook/setWebhook']);
    attempts.push(['PUT', '/webhook/setWebhook', payload, 'PUT /webhook/setWebhook']);

    // Alguns endpoints podem ser por instância
    if (instanceName) {
      attempts.push(['POST', `/webhook/set/${encodeURIComponent(instanceName)}`, payload, 'POST /webhook/set/:instance']);
      attempts.push(['PUT', `/webhook/set/${encodeURIComponent(instanceName)}`, payload, 'PUT /webhook/set/:instance']);
      attempts.push(['POST', `/webhook/${encodeURIComponent(instanceName)}`, payload, 'POST /webhook/:instance']);
      attempts.push(['PUT', `/webhook/${encodeURIComponent(instanceName)}`, payload, 'PUT /webhook/:instance']);
    }

    console.log('[ensureWebhook] 🔧 Garantindo webhook na Evolution...', {
      evolutionBaseUrl,
      hasAuthKey: !!evolutionAuthKey,
      instanceName: instanceName || 'n/a',
      webhookUrl,
      enabled,
      base64,
      byEvents,
      events: desiredEvents
    });

    let lastFailure = null;
    for (const [method, path, body, label] of attempts) {
      // eslint-disable-next-line no-await-in-loop
      const result = await makeAttempt(method, path, body, label);
      if (result.ok) {
        console.log('[ensureWebhook] ✅ Webhook configurado com sucesso:', {
          attempt: label,
          url: result.url,
          status: result.status
        });
        return { success: true, attempt: label };
      }
      lastFailure = result;
    }

    console.warn('[ensureWebhook] ⚠️ Não foi possível configurar webhook automaticamente. Configure manualmente na Evolution (Events → Webhook).', {
      lastAttempt: lastFailure?.label,
      status: lastFailure?.status,
      url: lastFailure?.url
    });

    return { success: false, skipped: false, reason: 'no_supported_endpoint' };
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
};


