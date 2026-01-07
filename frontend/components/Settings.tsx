
import React, { useEffect, useMemo, useState } from 'react';
import { ApiConfig, User, UserRole } from '../types';
import { Save, Server, Shield, Globe, User as UserIcon, Bell, Lock, RefreshCw, Database, HardDrive, Sparkles, Trash2, AlertTriangle, CheckCircle, Calendar, Bug, Send, MessageCircle, Clock, BookOpen } from 'lucide-react';
import { fetchAllInstances, fetchInstanceDetails, InstanceInfo } from '../services/whatsappService';
import { checkApiHealth, getAuthToken, cleanupInvalidChats, loadTelegramReportConfig, saveTelegramReportConfig, sendTelegramReportNow, testTelegramReportConfig, TelegramReportConfig } from '../services/apiService';
import { BRAZILIAN_STATES } from '../services/holidaysService';
import { storageService } from '../services/storageService';

interface SettingsProps {
  config: ApiConfig;
  onSave: (config: ApiConfig) => void | Promise<void>;
  currentUser?: User | null;
}

type SettingsTab = 'system' | 'integrations' | 'notifications' | 'maintenance';

const SETTINGS_ACTIVE_TAB_STORAGE_KEY = 'zentria_settings_activeTab';

const Settings: React.FC<SettingsProps> = ({ config, onSave, currentUser }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const [formData, setFormData] = useState<ApiConfig>(config);
  const [integrationTab, setIntegrationTab] = useState<'google' | 'telegram'>('google');
  const [showSuccess, setShowSuccess] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [selectedInstanceName, setSelectedInstanceName] = useState<string>(config.instanceName || '');
  const [isLoadingInstances, setIsLoadingInstances] = useState(false);
  const [storageStatus, setStorageStatus] = useState<'api' | 'localstorage' | 'checking'>('checking');
  const [apiUrl, setApiUrl] = useState<string>('');
  const [useOnlyPostgreSQL, setUseOnlyPostgreSQL] = useState<boolean>(storageService.getUseOnlyPostgreSQL());
  const [isCleaningChats, setIsCleaningChats] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{ success: boolean; summary?: any; message?: string } | null>(null);

  const allowedTabs = useMemo<SettingsTab[]>(() => {
    return isAdmin ? ['system', 'integrations', 'notifications', 'maintenance'] : ['notifications'];
  }, [isAdmin]);

  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    const defaultTab: SettingsTab = isAdmin ? 'system' : 'notifications';
    try {
      if (typeof window === 'undefined') return defaultTab;
      const saved = window.localStorage.getItem(SETTINGS_ACTIVE_TAB_STORAGE_KEY) as SettingsTab | null;
      if (saved && (isAdmin ? ['system', 'integrations', 'notifications', 'maintenance'] : ['notifications']).includes(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return defaultTab;
  });

  // Telegram (relatório diário)
  const [telegramConfig, setTelegramConfig] = useState<TelegramReportConfig>({
    enabled: false,
    time: '08:00',
    timezone: 'America/Sao_Paulo',
    chatId: '',
    botTokenConfigured: false,
    status: null
  });
  const [telegramBotTokenDraft, setTelegramBotTokenDraft] = useState<string>('');
  const [isLoadingTelegramConfig, setIsLoadingTelegramConfig] = useState(false);
  const [isSavingTelegramConfig, setIsSavingTelegramConfig] = useState(false);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [isSendingTelegramNow, setIsSendingTelegramNow] = useState(false);
  const [telegramFeedback, setTelegramFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Garante que a aba ativa é válida quando o papel muda (ADMIN vs não-admin)
  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0]);
    }
    try {
      if (typeof window === 'undefined') return;
      const saved = window.localStorage.getItem(SETTINGS_ACTIVE_TAB_STORAGE_KEY) as SettingsTab | null;
      if (saved && allowedTabs.includes(saved)) {
        setActiveTab(saved);
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Persiste a aba selecionada (UX: manter última aba aberta)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(SETTINGS_ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch {
      // ignore
    }
  }, [activeTab]);

  // Sincroniza formData quando config muda (importante para carregar dados salvos)
  useEffect(() => {
    setFormData(config);
    setSelectedInstanceName(config.instanceName || '');
  }, [config]);

  // Carrega config do Telegram (relatório diário) — apenas ADMIN
  useEffect(() => {
    if (!isAdmin) return;

    const loadTelegram = async () => {
      setIsLoadingTelegramConfig(true);
      try {
        const cfg = await loadTelegramReportConfig();
        if (cfg) {
          setTelegramConfig(cfg);
        }
      } finally {
        setIsLoadingTelegramConfig(false);
      }
    };

    loadTelegram();
  }, [isAdmin]);

  // Carrega lista de instâncias quando a tela é aberta e não está em modo demo
  useEffect(() => {
    if (isAdmin && !config.isDemo && config.baseUrl && (config.authenticationApiKey || config.apiKey)) {
      loadInstances();
    }
  }, [isAdmin, config.isDemo, config.baseUrl, config.authenticationApiKey, config.apiKey]);

  // Busca automaticamente o token da instância configurada quando a página carrega
  useEffect(() => {
    const fetchTokenForConfiguredInstance = async () => {
      // Se já tem instância configurada mas não tem token (ou token está vazio), busca automaticamente
      if (
        isAdmin && 
        !config.isDemo && 
        config.baseUrl && 
        config.instanceName && 
        (!config.apiKey || config.apiKey.trim() === '') &&
        (config.authenticationApiKey || config.apiKey)
      ) {
        try {
          const details = await fetchInstanceDetails(config, config.instanceName);
          if (details && details.token) {
            // Atualiza o formData com o token encontrado
            setFormData(prev => ({
              ...prev,
              apiKey: details.token
            }));
            // Salva automaticamente nas configurações
            onSave({
              ...config,
              apiKey: details.token
            });
          }
        } catch (error) {
          console.error('[Settings] Erro ao buscar token automaticamente:', error);
        }
      }
    };

    fetchTokenForConfiguredInstance();
  }, [isAdmin, config.isDemo, config.baseUrl, config.instanceName, config.authenticationApiKey]);

  const loadInstances = async () => {
    if (config.isDemo || !config.baseUrl) return;
    
    setIsLoadingInstances(true);
    try {
      const allInstances = await fetchAllInstances(config);
      setInstances(allInstances);
      
      // Se a instância selecionada não existe mais, seleciona a primeira disponível
      if (allInstances.length > 0 && !allInstances.find(i => i.instanceName === selectedInstanceName)) {
        const firstInstance = allInstances[0];
        setSelectedInstanceName(firstInstance.instanceName);
        handleInstanceSelect(firstInstance.instanceName);
      }
    } catch (error) {
      console.error('[Settings] Erro ao carregar instâncias:', error);
    } finally {
      setIsLoadingInstances(false);
    }
  };

  const handleInstanceSelect = async (instanceName: string) => {
    setSelectedInstanceName(instanceName);
    
    // Busca detalhes da instância selecionada e preenche o token e nome automaticamente
    if (instanceName && !config.isDemo && config.baseUrl) {
      try {
        const details = await fetchInstanceDetails(config, instanceName);
        if (details) {
          const updatedConfig = {
            ...formData,
            instanceName: details.instanceName, // Preenche o nome automaticamente
            apiKey: details.token || formData.apiKey // Preenche o token se disponível
          };
          setFormData(updatedConfig);
          
          // Se encontrou um token, salva automaticamente nas configurações
          if (details.token) {
            onSave(updatedConfig);
          }
        } else {
          // Se não encontrou detalhes, apenas atualiza o nome
          const updatedConfig = {
            ...formData,
            instanceName: instanceName
          };
          setFormData(updatedConfig);
          onSave(updatedConfig);
        }
      } catch (error) {
        console.error('[Settings] Erro ao buscar detalhes da instância:', error);
        const updatedConfig = {
          ...formData,
          instanceName: instanceName
        };
        setFormData(updatedConfig);
        onSave(updatedConfig);
      }
    } else {
      const updatedConfig = {
        ...formData,
        instanceName: instanceName
      };
      setFormData(updatedConfig);
      onSave(updatedConfig);
    }
  };


  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Verificar status do armazenamento (API vs localStorage)
  useEffect(() => {
    const checkStorageStatus = async () => {
      // Obter URL da API do ambiente
      const apiBaseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
      const apiUrlClean = apiBaseUrl.replace('/api', '');
      setApiUrl(apiUrlClean);

      // Verificar se há token de autenticação
      const hasToken = getAuthToken() !== null;
      
      if (hasToken) {
        // Se tem token, verificar se API está respondendo
        try {
          const isHealthy = await checkApiHealth();
          setStorageStatus(isHealthy ? 'api' : 'localstorage');
        } catch (error) {
          setStorageStatus('localstorage');
        }
      } else {
        // Sem token, usando localStorage
        setStorageStatus('localstorage');
      }
    };

    checkStorageStatus();
    // Verificar a cada 10 segundos
    const interval = setInterval(checkStorageStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestNotificationPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
        if (permission === 'granted') {
          setShowSuccess(true);
          setTimeout(() => setShowSuccess(false), 3000);
        }
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const handleCleanupInvalidChats = async () => {
    if (!isAdmin) return;
    
    if (!confirm('Tem certeza que deseja limpar os chats inválidos? Esta ação não pode ser desfeita.')) {
      return;
    }

    setIsCleaningChats(true);
    setCleanupResult(null);

    try {
      const result = await cleanupInvalidChats();
      setCleanupResult(result);
      
      if (result.success) {
        console.log('[Settings] ✅ Limpeza de chats inválidos concluída:', result.summary);
      } else {
        console.error('[Settings] ❌ Erro na limpeza:', result.message);
      }
    } catch (error) {
      console.error('[Settings] ❌ Erro ao executar limpeza:', error);
      setCleanupResult({ 
        success: false, 
        message: 'Erro ao executar limpeza de chats inválidos' 
      });
    } finally {
      setIsCleaningChats(false);
      // Limpa o resultado após 5 segundos
      setTimeout(() => setCleanupResult(null), 5000);
    }
  };

  const refreshTelegramConfig = async () => {
    if (!isAdmin) return;
    setIsLoadingTelegramConfig(true);
    try {
      const cfg = await loadTelegramReportConfig();
      if (cfg) setTelegramConfig(cfg);
    } finally {
      setIsLoadingTelegramConfig(false);
    }
  };

  const handleSaveTelegramConfig = async () => {
    if (!isAdmin) return;

    setIsSavingTelegramConfig(true);
    setTelegramFeedback(null);

    try {
      const payload = {
        enabled: !!telegramConfig.enabled,
        time: telegramConfig.time || '08:00',
        timezone: telegramConfig.timezone || 'America/Sao_Paulo',
        chatId: telegramConfig.chatId || '',
        botToken: telegramBotTokenDraft.trim() ? telegramBotTokenDraft.trim() : undefined
      };

      const result = await saveTelegramReportConfig(payload);

      if (result.success && result.config) {
        setTelegramConfig(result.config);
        setTelegramBotTokenDraft('');
        setTelegramFeedback({ type: 'success', message: '✅ Telegram configurado com sucesso.' });
        await refreshTelegramConfig();
      } else {
        setTelegramFeedback({ type: 'error', message: result.error || 'Erro ao salvar Telegram.' });
      }
    } catch (error: any) {
      setTelegramFeedback({ type: 'error', message: error?.message || 'Erro ao salvar Telegram.' });
    } finally {
      setIsSavingTelegramConfig(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!isAdmin) return;

    const botToken = telegramBotTokenDraft.trim();
    const chatId = (telegramConfig.chatId || '').trim();

    if (!botToken) {
      setTelegramFeedback({
        type: 'info',
        message: 'Para testar, informe o BOT TOKEN. Por segurança o token não é exibido depois.'
      });
      return;
    }

    if (!chatId) {
      setTelegramFeedback({ type: 'error', message: 'Informe o Chat ID para testar.' });
      return;
    }

    setIsTestingTelegram(true);
    setTelegramFeedback(null);

    try {
      const result = await testTelegramReportConfig(botToken, chatId);
      if (result.success) {
        setTelegramFeedback({ type: 'success', message: '✅ Mensagem de teste enviada no Telegram.' });
      } else {
        setTelegramFeedback({ type: 'error', message: result.error || 'Falha ao enviar teste.' });
      }
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleSendTelegramReportNow = async () => {
    if (!isAdmin) return;

    setIsSendingTelegramNow(true);
    setTelegramFeedback(null);

    try {
      const result = await sendTelegramReportNow();
      if (result.success) {
        setTelegramFeedback({ type: 'success', message: '✅ Relatório enviado agora.' });
        await refreshTelegramConfig();
      } else {
        setTelegramFeedback({ type: 'error', message: result.error || 'Falha ao enviar relatório.' });
      }
    } finally {
      setIsSendingTelegramNow(false);
    }
  };

  const TabButton = ({ tab, label, icon: Icon }: { tab: SettingsTab; label: string; icon: any }) => {
    const isActive = activeTab === tab;
    return (
      <button
        type="button"
        onClick={() => setActiveTab(tab)}
        role="tab"
        aria-selected={isActive}
        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-2 ${
          isActive
            ? 'bg-[#16191F] text-[#00E0D1] glow-cyan'
            : 'text-slate-300 hover:bg-[#16191F] hover:text-slate-100'
        }`}
      >
        <Icon size={14} />
        <span className="whitespace-nowrap">{label}</span>
      </button>
    );
  };

  const BrowserNotificationsSection = ({ showRestrictedNote }: { showRestrictedNote?: boolean }) => (
    <div className="space-y-4">
      {showRestrictedNote && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <Lock className="text-amber-600 mt-1 flex-shrink-0" size={20} />
          <div>
            <h4 className="font-semibold text-amber-800 text-sm">Acesso Restrito</h4>
            <p className="text-amber-700 text-xs mt-1 leading-relaxed">
              Apenas administradores podem alterar as configurações do sistema. Você pode gerenciar suas preferências de notificações abaixo.
            </p>
          </div>
        </div>
      )}

      {showSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-800 text-sm font-medium">
          ✅ Ação concluída com sucesso!
        </div>
      )}

      <div>
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4">Notificações</h3>
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="text-slate-600" size={20} />
              <div>
                <h4 className="font-semibold text-slate-800 text-sm">Notificações do Navegador</h4>
                <p className="text-slate-600 text-xs mt-1">
                  {notificationPermission === 'granted' && '✅ Notificações ativadas - Você receberá alertas quando novas mensagens chegarem.'}
                  {notificationPermission === 'denied' && '❌ Notificações bloqueadas - Desbloqueie nas configurações do navegador.'}
                  {notificationPermission === 'default' && 'Permita notificações para receber alertas de novas mensagens mesmo quando a página não estiver em foco.'}
                </p>
              </div>
            </div>
            {notificationPermission !== 'granted' && (
              <button
                type="button"
                onClick={handleRequestNotificationPermission}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center gap-2 text-sm"
              >
                <Bell size={16} />
                {notificationPermission === 'denied' ? 'Ver Configurações' : 'Ativar Notificações'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const MaintenanceSection = () => (
    <div>
      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4">Manutenção do Banco de Dados</h3>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="text-amber-600 mt-0.5 flex-shrink-0" size={20} />
          <div>
            <h4 className="font-semibold text-amber-800 text-sm">Limpar Chats Inválidos</h4>
            <p className="text-amber-700 text-xs mt-1 leading-relaxed">
              Remove chats com números inválidos (menos de 11 dígitos) e corrige data_keys de chats com contactNumber válido.
              Esta ação é executada automaticamente a cada 6 horas, mas você pode executá-la manualmente aqui.
            </p>
          </div>
        </div>
        
        {cleanupResult && (
          <div className={`mb-4 p-3 rounded-md flex items-start gap-2 ${
            cleanupResult.success 
              ? 'bg-emerald-50 border border-emerald-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {cleanupResult.success ? (
              <>
                <CheckCircle className="text-emerald-600 mt-0.5 flex-shrink-0" size={18} />
                <div className="flex-1">
                  <p className="text-emerald-800 font-semibold text-sm">Limpeza concluída com sucesso!</p>
                  {cleanupResult.summary && (
                    <div className="text-emerald-700 text-xs mt-1">
                      <p>• Total de chats: {cleanupResult.summary.total}</p>
                      <p>• Chats inválidos encontrados: {cleanupResult.summary.invalid}</p>
                      <p>• Chats deletados: {cleanupResult.summary.deleted}</p>
                      <p>• Chats corrigidos: {cleanupResult.summary.fixed}</p>
                      <p>• Chats válidos mantidos: {cleanupResult.summary.valid}</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="text-red-600 mt-0.5 flex-shrink-0" size={18} />
                <div className="flex-1">
                  <p className="text-red-800 font-semibold text-sm">Erro na limpeza</p>
                  <p className="text-red-700 text-xs mt-1">{cleanupResult.message || 'Erro desconhecido'}</p>
                </div>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={handleCleanupInvalidChats}
          disabled={isCleaningChats}
          className={`font-medium py-2 px-4 rounded-md transition-colors flex items-center gap-2 text-sm ${
            isCleaningChats
              ? 'bg-slate-400 text-white cursor-not-allowed'
              : 'bg-amber-600 hover:bg-amber-700 text-white'
          }`}
        >
          {isCleaningChats ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              Limpando...
            </>
          ) : (
            <>
              <Trash2 size={16} />
              Limpar Chats Inválidos
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="bg-[#16191F] rounded-xl shadow-lg neon-border overflow-hidden">
        <div className="p-6 border-b border-[#0D0F13] circuit-line">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-futuristic text-slate-200">Configurações</h2>
              <p className="text-slate-400 text-sm mt-1">
                {isAdmin 
                  ? 'Configure a conexão com sua instância do WhatsApp e integrações externas.'
                  : 'Gerencie suas preferências de notificações.'}
              </p>
            </div>
            {/* Indicador de Armazenamento */}
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              storageStatus === 'api' 
                ? 'bg-[#00E0D1]/20 text-[#00E0D1] border-[#00E0D1]/30 glow-cyan' 
                : storageStatus === 'checking'
                ? 'bg-[#0074FF]/20 text-[#0074FF] border-[#0074FF]/30'
                : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
            }`}>
              {storageStatus === 'api' ? (
                <>
                  <Database size={14} />
                  <span>Banco de Dados</span>
                </>
              ) : storageStatus === 'checking' ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Verificando...</span>
                </>
              ) : (
                <>
                  <HardDrive size={14} />
                  <span>LocalStorage</span>
                </>
              )}
            </div>
          </div>
          {/* Informação detalhada sobre armazenamento */}
          {storageStatus !== 'checking' && (
            <div className={`mt-3 p-2 rounded-lg text-xs neon-border ${
              storageStatus === 'api' 
                ? 'bg-[#00E0D1]/10 text-[#00E0D1] border-[#00E0D1]/30' 
                : 'bg-orange-500/10 text-orange-400 border-orange-500/30'
            }`}>
              {storageStatus === 'api' ? (
                <div className="flex items-start gap-2">
                  <Database size={14} className="mt-0.5 flex-shrink-0" strokeWidth={2} />
                  <div>
                    <p className="font-semibold text-slate-200">Dados salvos no PostgreSQL</p>
                    <p className="text-[#00E0D1]">Seus dados estão sendo persistidos no banco de dados e estarão disponíveis em qualquer navegador após login.</p>
                    {apiUrl && <p className="text-[#00E0D1] mt-1">API: {apiUrl}</p>}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <HardDrive size={14} className="mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold">Dados salvos no LocalStorage</p>
                    <p className="text-amber-600">Seus dados estão sendo salvos apenas no navegador atual. Para usar o banco de dados, configure o backend e faça login.</p>
                    {apiUrl && <p className="text-amber-600 mt-1">API não disponível: {apiUrl}</p>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Abas */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              aria-label="Abas de configurações"
              className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-[#0D0F13] bg-[#111316] p-1"
            >
              {isAdmin && (
                <>
                  <TabButton tab="system" label="Sistema / Evolution" icon={Server} />
                  <TabButton tab="integrations" label="Integrações" icon={Sparkles} />
                  <TabButton tab="notifications" label="Notificações" icon={Bell} />
                  <TabButton tab="maintenance" label="Manutenção" icon={Database} />
                </>
              )}
              {!isAdmin && <TabButton tab="notifications" label="Notificações" icon={Bell} />}
            </div>
          </div>
        </div>

        {/* Configurações do Sistema - Apenas para Admin */}
        {isAdmin && (
          <form onSubmit={handleSubmit} className="p-8 space-y-8">
          
          {activeTab === 'system' && (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <Server className="text-blue-600 mt-1 flex-shrink-0" size={20} />
                <div>
                  <h4 className="font-semibold text-blue-800 text-sm">Sobre a Integração Real</h4>
                  <p className="text-blue-700 text-xs mt-1 leading-relaxed">
                    Para conectar um número real, você precisa de uma API Gateway rodando em seu servidor (Hostgator VPS ou Node.js). 
                    Recomendamos o uso da <b>Evolution API</b>. Insira os dados da sua instalação abaixo.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-center gap-4 mb-6">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={formData.isDemo} 
                      onChange={(e) => setFormData({...formData, isDemo: e.target.checked})}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    <span className="ml-3 text-sm font-medium text-slate-200">Modo Demonstração (Simulação)</span>
                  </label>
                </div>

                <div className={`space-y-6 transition-opacity ${formData.isDemo ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="col-span-1 md:col-span-2">
                      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 border-b border-[#0D0F13] pb-2">Evolution API</h3>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <Globe size={16} /> URL da API
                      </label>
                      <input 
                        type="text" 
                        value={formData.baseUrl}
                        onChange={(e) => setFormData({...formData, baseUrl: e.target.value})}
                        className="w-full px-4 py-2.5 border border-[#0D0F13] bg-[#111316] text-slate-100 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500 text-base"
                        placeholder="https://api.seudominio.com.br"
                      />
                      <p className="text-xs text-slate-400 mt-1">Endereço base onde a API está instalada.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <Shield size={16} /> AUTHENTICATION_API_KEY (Servidor)
                      </label>
                      <input 
                        type="password" 
                        value={formData.authenticationApiKey || ''}
                        onChange={(e) => setFormData({...formData, authenticationApiKey: e.target.value})}
                        className="w-full px-4 py-2.5 border border-[#0D0F13] bg-[#111316] text-slate-100 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500 text-base"
                        placeholder="B8349283-F143-429D-B6C2-9386E8016558"
                      />
                      <p className="text-xs text-slate-400 mt-1">Chave de autenticação do servidor (do docker-compose.yml). Usada para autenticar requisições HTTP.</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <Shield size={16} /> Token da Instância (Opcional)
                      </label>
                      <input 
                        type="password" 
                        value={formData.apiKey}
                        onChange={(e) => setFormData({...formData, apiKey: e.target.value})}
                        className="w-full px-4 py-2.5 border border-[#0D0F13] bg-[#111316] text-slate-100 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500 text-base"
                        placeholder="Deixe vazio para gerar automaticamente"
                      />
                      <p className="text-xs text-slate-400 mt-1">Token específico da instância. Se deixado vazio, será gerado automaticamente ao criar a instância.</p>
                    </div>

                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <Server size={16} /> Selecionar Instância
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={selectedInstanceName}
                          onChange={(e) => handleInstanceSelect(e.target.value)}
                          disabled={isLoadingInstances}
                          className="flex-1 px-4 py-2.5 border border-[#0D0F13] bg-[#111316] text-slate-100 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none disabled:bg-[#0D0F13] disabled:text-slate-500 disabled:cursor-not-allowed text-base"
                        >
                          <option value="">-- Selecione uma instância --</option>
                          {instances.map((instance) => (
                            <option key={instance.instanceName} value={instance.instanceName}>
                              {instance.instanceName} ({instance.status})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={loadInstances}
                          disabled={isLoadingInstances}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          title="Atualizar lista de instâncias"
                        >
                          <RefreshCw size={16} className={isLoadingInstances ? 'animate-spin' : ''} />
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {instances.length === 0 
                          ? 'Nenhuma instância encontrada. Crie uma nova instância na tela de Conexões.'
                          : `Selecione uma instância para usar. O token será preenchido automaticamente.`}
                      </p>
                    </div>

                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-300 mb-2">Nome da Instância</label>
                      <input 
                        type="text" 
                        value={formData.instanceName}
                        readOnly
                        disabled
                        className="w-full px-4 py-2.5 border border-[#0D0F13] bg-[#0D0F13] text-slate-400 rounded-lg cursor-not-allowed text-base"
                        placeholder="Selecione uma instância acima"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Nome da instância selecionada. Este campo é preenchido automaticamente quando você seleciona uma instância acima.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <div className="col-span-1 md:col-span-2">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 border-b border-[#0D0F13] pb-2">Atendimento / Setores</h3>
                </div>

                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                    <MessageCircle size={16} /> Mensagem após seleção de setor (automática)
                  </label>
                  <textarea
                    value={formData.departmentSelectionConfirmationTemplate || ''}
                    onChange={(e) => setFormData({ ...formData, departmentSelectionConfirmationTemplate: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#0D0F13] bg-[#111316] text-slate-100 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500 text-base min-h-[110px]"
                    placeholder="Perfeito! Seu atendimento foi encaminhado para o setor {{department}}. Em instantes você será atendido."
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Use <span className="font-mono">{'{{department}}'}</span> para inserir o nome do setor automaticamente.
                  </p>
                </div>
              </div>
            </>
          )}

          {activeTab === 'integrations' && (
            <div className={`space-y-6 transition-opacity ${formData.isDemo ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-1 md:col-span-2">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 border-b border-[#0D0F13] pb-2">Integrações</h3>
                  <div className="inline-flex items-center gap-1 rounded-lg border border-[#0D0F13] bg-[#111316] p-1">
                    <button
                      type="button"
                      onClick={() => setIntegrationTab('google')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        integrationTab === 'google'
                          ? 'bg-[#16191F] text-[#00E0D1]'
                          : 'text-slate-300 hover:bg-[#16191F] hover:text-slate-100'
                      }`}
                    >
                      Google / IA
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntegrationTab('telegram')}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        integrationTab === 'telegram'
                          ? 'bg-[#16191F] text-[#00E0D1]'
                          : 'text-slate-300 hover:bg-[#16191F] hover:text-slate-100'
                      }`}
                    >
                      Telegram
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 flex items-center gap-2">
                    <BookOpen size={14} />
                    Tutorial do relatório diário: <span className="font-mono">docs/TELEGRAM_RELATORIO_DIARIO.md</span>
                  </p>
                </div>

                {integrationTab === 'google' && (
                  <>
                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <UserIcon size={16} /> Google Client ID (OAuth 2.0)
                      </label>
                      <input 
                        type="text" 
                        value={formData.googleClientId || ''}
                        onChange={(e) => setFormData({...formData, googleClientId: e.target.value})}
                        className="w-full px-4 py-2.5 border border-[#0D0F13] bg-[#111316] text-slate-100 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500 text-base"
                        placeholder="ex: 123456789-abcdefgh.apps.googleusercontent.com"
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Necessário para sincronizar contatos. Crie em <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-blue-500 underline">Google Cloud Console</a>.
                      </p>
                    </div>

                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                        <Sparkles size={16} /> Google Gemini API Key
                      </label>
                      <input 
                        type="password" 
                        value={formData.geminiApiKey || ''}
                        onChange={(e) => setFormData({...formData, geminiApiKey: e.target.value})}
                        className="w-full px-4 py-2.5 border border-[#0D0F13] bg-[#111316] text-slate-100 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500 text-base"
                        placeholder="ex: AIzaSy..."
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Necessário para respostas inteligentes de IA. Obtenha em <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-500 underline">Google AI Studio</a>.
                      </p>
                    </div>

                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm font-medium text-slate-200 mb-2 flex items-center gap-2">
                        <Calendar size={16} /> Estados para Feriados Municipais no Dashboard
                      </label>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                        <p className="text-xs text-slate-600 mb-3">
                          Selecione os estados para buscar feriados municipais. <strong>SC, PR e RS</strong> são sempre buscados primeiro (prioridade).
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                          {BRAZILIAN_STATES.map(state => {
                            const isSelected = (formData.holidayStates || []).includes(state.code);
                            const isPriority = ['SC', 'PR', 'RS'].includes(state.code);
                            
                            return (
                              <label
                                key={state.code}
                                className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors border ${
                                  isPriority
                                    ? 'bg-blue-50 border-blue-300'
                                    : isSelected
                                    ? 'bg-emerald-50 border-emerald-300'
                                    : 'bg-white border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected || isPriority}
                                  disabled={isPriority}
                                  onChange={(e) => {
                                    const currentStates = formData.holidayStates || [];
                                    if (e.target.checked) {
                                      if (!currentStates.includes(state.code) && !isPriority) {
                                        setFormData({...formData, holidayStates: [...currentStates, state.code]});
                                      }
                                    } else {
                                      if (!isPriority) {
                                        setFormData({...formData, holidayStates: currentStates.filter(s => s !== state.code)});
                                      }
                                    }
                                  }}
                                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 disabled:opacity-50"
                                />
                                <span className={`text-sm ${isPriority ? 'font-semibold text-blue-700' : 'text-slate-700'}`}>
                                  {state.code}
                                </span>
                                {isPriority && (
                                  <span className="text-xs text-blue-600">(Prioridade)</span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                        <p className="text-xs text-slate-500 mt-3">
                          <strong>Estados principais (SC, PR, RS):</strong> Sempre buscados primeiro. <br />
                          <strong>Outros estados:</strong> Buscados depois, apenas se selecionados acima.
                        </p>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="col-span-1 md:col-span-2">
                        <label className="block text-sm font-medium text-slate-200 mb-2 flex items-center gap-2">
                          <Bug size={16} /> Debug do Dev (logs no console)
                        </label>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                          <label className="relative inline-flex items-center cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={!!formData.debugLogsEnabled}
                              onChange={(e) => setFormData({ ...formData, debugLogsEnabled: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                            <span className="ml-3 text-sm font-medium text-slate-700">
                              {formData.debugLogsEnabled ? 'Ativado' : 'Desativado'}
                            </span>
                          </label>
                          <p className="text-xs text-slate-600 mt-2">
                            Quando ativado, habilita logs de <strong>debug</strong> no F12 para diagnóstico (reduz ruído para usuário final).
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {integrationTab === 'telegram' && (
                  <>
                    <div className="col-span-1 md:col-span-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-4">
                        <div className="flex items-start gap-3">
                          <MessageCircle className="text-slate-600 mt-0.5 flex-shrink-0" size={20} />
                          <div>
                            <h4 className="font-semibold text-slate-800 text-sm">Relatório diário via Telegram</h4>
                            <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                              Envia um resumo diário com métricas do banco (tamanho/contagens/top data_types) e status de quota do Gemini.
                              O token do bot não é exibido por segurança.
                            </p>
                          </div>
                        </div>

                        {telegramFeedback && (
                          <div className={`p-3 rounded-md border text-xs ${
                            telegramFeedback.type === 'success'
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              : telegramFeedback.type === 'info'
                              ? 'bg-blue-50 border-blue-200 text-blue-800'
                              : 'bg-red-50 border-red-200 text-red-800'
                          }`}>
                            {telegramFeedback.message}
                          </div>
                        )}

                        {isLoadingTelegramConfig ? (
                          <div className="text-xs text-slate-600 flex items-center gap-2">
                            <RefreshCw size={14} className="animate-spin" />
                            Carregando configuração do Telegram...
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="col-span-1 md:col-span-2">
                              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                                <Bell size={16} /> Ativar relatório diário
                              </label>
                              <div className="bg-white border border-slate-200 rounded-lg p-4">
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={!!telegramConfig.enabled}
                                    onChange={(e) => setTelegramConfig({ ...telegramConfig, enabled: e.target.checked })}
                                    className="sr-only peer"
                                  />
                                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                                  <span className="ml-3 text-sm font-medium text-slate-700">
                                    {telegramConfig.enabled ? 'Ativado' : 'Desativado'}
                                  </span>
                                </label>
                                <p className="text-xs text-slate-600 mt-2">
                                  O backend envia automaticamente quando o relógio bater o horário configurado (no timezone escolhido).
                                </p>
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                                <Clock size={16} /> Horário (HH:MM)
                              </label>
                              <input
                                type="time"
                                value={telegramConfig.time || '08:00'}
                                onChange={(e) => setTelegramConfig({ ...telegramConfig, time: e.target.value })}
                                className="w-full px-4 py-2.5 border border-slate-200 bg-white text-slate-900 rounded-lg focus:ring-2 focus:ring-emerald-300 focus:border-emerald-500 outline-none text-base"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                                <Globe size={16} /> Timezone (IANA)
                              </label>
                              <input
                                type="text"
                                value={telegramConfig.timezone || 'America/Sao_Paulo'}
                                onChange={(e) => setTelegramConfig({ ...telegramConfig, timezone: e.target.value })}
                                className="w-full px-4 py-2.5 border border-slate-200 bg-white text-slate-900 rounded-lg focus:ring-2 focus:ring-emerald-300 focus:border-emerald-500 outline-none placeholder:text-slate-400 text-base"
                                placeholder="America/Sao_Paulo"
                              />
                              <p className="text-xs text-slate-500 mt-1">Ex.: America/Sao_Paulo</p>
                            </div>

                            <div className="col-span-1 md:col-span-2">
                              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                                <MessageCircle size={16} /> Chat ID (destino)
                              </label>
                              <input
                                type="text"
                                value={telegramConfig.chatId || ''}
                                onChange={(e) => setTelegramConfig({ ...telegramConfig, chatId: e.target.value })}
                                className="w-full px-4 py-2.5 border border-slate-200 bg-white text-slate-900 rounded-lg focus:ring-2 focus:ring-emerald-300 focus:border-emerald-500 outline-none placeholder:text-slate-400 text-base"
                                placeholder="ex: 123456789 ou -1001234567890"
                              />
                              <p className="text-xs text-slate-500 mt-1">
                                Para grupos, geralmente começa com <span className="font-mono">-100...</span>.
                              </p>
                            </div>

                            <div className="col-span-1 md:col-span-2">
                              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                                <Shield size={16} /> Bot Token (não é exibido depois)
                              </label>
                              <input
                                type="password"
                                value={telegramBotTokenDraft}
                                onChange={(e) => setTelegramBotTokenDraft(e.target.value)}
                                className="w-full px-4 py-2.5 border border-slate-200 bg-white text-slate-900 rounded-lg focus:ring-2 focus:ring-emerald-300 focus:border-emerald-500 outline-none placeholder:text-slate-400 text-base"
                                placeholder={telegramConfig.botTokenConfigured ? '•••••• (já configurado) — preencha para trocar' : 'Cole o token do BotFather'}
                              />
                              <p className="text-xs text-slate-500 mt-1">
                                {telegramConfig.botTokenConfigured
                                  ? 'Token já configurado. Para trocar, informe um novo token e salve.'
                                  : 'Crie um bot no BotFather e cole o token aqui.'}
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={handleSaveTelegramConfig}
                            disabled={isSavingTelegramConfig || isLoadingTelegramConfig}
                            className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors ${
                              isSavingTelegramConfig || isLoadingTelegramConfig
                                ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }`}
                          >
                            <Save size={16} />
                            {isSavingTelegramConfig ? 'Salvando...' : 'Salvar Telegram'}
                          </button>

                          <button
                            type="button"
                            onClick={handleSendTelegramReportNow}
                            disabled={isSendingTelegramNow || isLoadingTelegramConfig}
                            className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors ${
                              isSendingTelegramNow || isLoadingTelegramConfig
                                ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                          >
                            <Send size={16} />
                            {isSendingTelegramNow ? 'Enviando...' : 'Enviar agora'}
                          </button>

                          <button
                            type="button"
                            onClick={handleTestTelegram}
                            disabled={isTestingTelegram}
                            className={`px-4 py-2 rounded-md text-sm font-semibold flex items-center gap-2 transition-colors ${
                              isTestingTelegram
                                ? 'bg-slate-300 text-slate-600 cursor-not-allowed'
                                : 'bg-slate-800 hover:bg-slate-900 text-white'
                            }`}
                            title="Envia mensagem simples de teste usando o token digitado (não salva)."
                          >
                            <MessageCircle size={16} />
                            {isTestingTelegram ? 'Testando...' : 'Enviar teste'}
                          </button>
                        </div>

                        {!!telegramConfig.status && (
                          <div className="text-xs text-slate-600 space-y-1">
                            <p><strong>Status:</strong></p>
                            <p>• Último envio: {telegramConfig.status?.lastSentAt || '—'}</p>
                            {telegramConfig.status?.lastErrorAt && (
                              <p className="text-red-700">• Erro: {telegramConfig.status?.lastErrorAt} — {telegramConfig.status?.lastError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'notifications' && <BrowserNotificationsSection />}

          {activeTab === 'maintenance' && <MaintenanceSection />}

            <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
              {showSuccess && <span className="text-emerald-600 text-sm font-medium animate-pulse">Configurações salvas com sucesso!</span>}
              <button 
                type="submit"
                className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-6 rounded-md transition-colors flex items-center gap-2"
              >
                <Save size={18} />
                Salvar Alterações
              </button>
            </div>
          </form>
        )}

        {/* Apenas Notificações para Não-Admin */}
        {!isAdmin && (
          <div className="p-8 space-y-8">
            {activeTab === 'notifications' && <BrowserNotificationsSection showRestrictedNote />}
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
