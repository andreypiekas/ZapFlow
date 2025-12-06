
import React, { useState, useEffect } from 'react';
import { ApiConfig, User, UserRole } from '../types';
import { Save, Server, Shield, Globe, User as UserIcon, Bell, Lock, RefreshCw } from 'lucide-react';
import { fetchAllInstances, fetchInstanceDetails, InstanceInfo } from '../services/whatsappService';

interface SettingsProps {
  config: ApiConfig;
  onSave: (config: ApiConfig) => void;
  currentUser?: User | null;
}

const Settings: React.FC<SettingsProps> = ({ config, onSave, currentUser }) => {
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const [formData, setFormData] = useState<ApiConfig>(config);
  const [showSuccess, setShowSuccess] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [selectedInstanceName, setSelectedInstanceName] = useState<string>(config.instanceName || '');
  const [isLoadingInstances, setIsLoadingInstances] = useState(false);

  // Sincroniza formData quando config muda (importante para carregar dados salvos)
  useEffect(() => {
    setFormData(config);
    setSelectedInstanceName(config.instanceName || '');
  }, [config]);

  // Carrega lista de instâncias quando a tela é aberta e não está em modo demo
  useEffect(() => {
    if (isAdmin && !config.isDemo && config.baseUrl && (config.authenticationApiKey || config.apiKey)) {
      loadInstances();
    }
  }, [isAdmin, config.isDemo, config.baseUrl, config.authenticationApiKey, config.apiKey]);

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
    
    // Busca detalhes da instância selecionada e preenche o token automaticamente
    if (instanceName && !config.isDemo && config.baseUrl) {
      try {
        const details = await fetchInstanceDetails(config, instanceName);
        if (details) {
          setFormData({
            ...formData,
            instanceName: details.instanceName,
            apiKey: details.token || formData.apiKey // Preenche o token se disponível
          });
        } else {
          // Se não encontrou detalhes, apenas atualiza o nome
          setFormData({
            ...formData,
            instanceName: instanceName
          });
        }
      } catch (error) {
        console.error('[Settings] Erro ao buscar detalhes da instância:', error);
        setFormData({
          ...formData,
          instanceName: instanceName
        });
      }
    } else {
      setFormData({
        ...formData,
        instanceName: instanceName
      });
    }
  };


  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
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

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800">Configurações</h2>
          <p className="text-slate-500 text-sm mt-1">
            {isAdmin 
              ? 'Configure a conexão com sua instância do WhatsApp e integrações externas.'
              : 'Gerencie suas preferências de notificações.'}
          </p>
        </div>

        {/* Configurações do Sistema - Apenas para Admin */}
        {isAdmin && (
          <form onSubmit={handleSubmit} className="p-8 space-y-8">
          
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
                <span className="ml-3 text-sm font-medium text-slate-700">Modo Demonstração (Simulação)</span>
              </label>
            </div>

            <div className={`space-y-6 transition-opacity ${formData.isDemo ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="col-span-1 md:col-span-2">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Evolution API</h3>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <Globe size={16} /> URL da API
                    </label>
                    <input 
                      type="text" 
                      value={formData.baseUrl}
                      onChange={(e) => setFormData({...formData, baseUrl: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="https://api.seudominio.com.br"
                    />
                    <p className="text-xs text-slate-400 mt-1">Endereço base onde a API está instalada.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <Shield size={16} /> AUTHENTICATION_API_KEY (Servidor)
                    </label>
                    <input 
                      type="password" 
                      value={formData.authenticationApiKey || ''}
                      onChange={(e) => setFormData({...formData, authenticationApiKey: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="B8349283-F143-429D-B6C2-9386E8016558"
                    />
                    <p className="text-xs text-slate-400 mt-1">Chave de autenticação do servidor (do docker-compose.yml). Usada para autenticar requisições HTTP.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <Shield size={16} /> Token da Instância (Opcional)
                    </label>
                    <input 
                      type="password" 
                      value={formData.apiKey}
                      onChange={(e) => setFormData({...formData, apiKey: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="Deixe vazio para gerar automaticamente"
                    />
                    <p className="text-xs text-slate-400 mt-1">Token específico da instância. Se deixado vazio, será gerado automaticamente ao criar a instância.</p>
                  </div>

                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <Server size={16} /> Selecionar Instância
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={selectedInstanceName}
                        onChange={(e) => handleInstanceSelect(e.target.value)}
                        disabled={isLoadingInstances}
                        className="flex-1 px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none bg-white disabled:bg-slate-100 disabled:cursor-not-allowed"
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
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nome da Instância</label>
                    <input 
                      type="text" 
                      value={formData.instanceName}
                      onChange={(e) => setFormData({...formData, instanceName: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="Ex: hostgator_whatsapp"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                      Nome da instância que será usada. Se você selecionou uma instância acima, o token foi preenchido automaticamente.
                    </p>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  <div className="col-span-1 md:col-span-2">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Google Integration</h3>
                  </div>
                  
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-2">
                      <UserIcon size={16} /> Google Client ID (OAuth 2.0)
                    </label>
                    <input 
                      type="text" 
                      value={formData.googleClientId || ''}
                      onChange={(e) => setFormData({...formData, googleClientId: e.target.value})}
                      className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                      placeholder="ex: 123456789-abcdefgh.apps.googleusercontent.com"
                    />
                    <p className="text-xs text-slate-400 mt-1">
                        Necessário para sincronizar contatos. Crie em <a href="https://console.cloud.google.com/apis/credentials" target="_blank" className="text-blue-500 underline">Google Cloud Console</a>.
                    </p>
                  </div>
              </div>

            </div>
          </div>

            {/* Notificações do Navegador */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Notificações</h3>
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
            {/* Mensagem de Acesso Restrito */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <Lock className="text-amber-600 mt-1 flex-shrink-0" size={20} />
              <div>
                <h4 className="font-semibold text-amber-800 text-sm">Acesso Restrito</h4>
                <p className="text-amber-700 text-xs mt-1 leading-relaxed">
                  Apenas administradores podem alterar as configurações do sistema. Você pode gerenciar suas preferências de notificações abaixo.
                </p>
              </div>
            </div>

            {/* Notificações do Navegador */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Notificações</h3>
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
        )}
      </div>
    </div>
  );
};

export default Settings;
