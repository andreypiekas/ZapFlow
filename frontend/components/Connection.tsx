import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, CheckCircle, WifiOff, Loader2, AlertTriangle, Clock, Activity, Plus, Trash2, RefreshCw, X, Settings } from 'lucide-react';
import { ApiConfig } from '../types';
import { fetchRealQRCode, logoutInstance, getDetailedInstanceStatus, fetchAllInstances, createInstance, deleteInstance, getInstanceQRCode, InstanceInfo } from '../services/whatsappService';

interface ConnectionProps {
  config: ApiConfig;
  onNavigateToSettings: () => void;
  onUpdateConfig?: (newConfig: ApiConfig) => void;
}

const Connection: React.FC<ConnectionProps> = ({ config, onNavigateToSettings, onUpdateConfig }) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [detailedStatus, setDetailedStatus] = useState<string>('unknown');
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTimer, setRefreshTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>(config.instanceName);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [isCreatingInstance, setIsCreatingInstance] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const isConfigured = config.baseUrl && (config.authenticationApiKey || config.apiKey);

  const loadInstances = async () => {
    if (config.isDemo || !isConfigured) return;
    setIsLoading(true);
    const allInstances = await fetchAllInstances(config);
    setInstances(allInstances);
    
    // Se a instância selecionada não existe mais, seleciona a primeira disponível
    if (allInstances.length > 0 && !allInstances.find(i => i.instanceName === selectedInstance)) {
      const firstInstance = allInstances[0];
      setSelectedInstance(firstInstance.instanceName);
      if (onUpdateConfig) {
        onUpdateConfig({ ...config, instanceName: firstInstance.instanceName });
      }
    }
    setIsLoading(false);
  };

  const checkStatus = async () => {
    if (config.isDemo || !isConfigured || !selectedInstance) return;
    
    // Atualiza lista de instâncias
    const allInstances = await fetchAllInstances(config);
    setInstances(allInstances);

    // Se existir alguma instância conectada (open) diferente da selecionada, sugere correção.
    // Isso evita o cenário confuso: UI mostra "close" mas mensagens ainda são enviadas porque
    // o sistema pode auto-detectar uma instância ativa para os endpoints de envio.
    const connectedInstance = allInstances.find(i => i && i.status === 'open');
    
    // Verifica status da instância selecionada
    const currentConfig = { ...config, instanceName: selectedInstance };
    const details = await getDetailedInstanceStatus(currentConfig);
    
    // Mapeia o status para um formato mais amigável
    const statusMap: Record<string, string> = {
        'open': 'Conectado',
        'connecting': 'Conectando...',
        'close': 'Desconectado',
        'qrcode': 'Aguardando QR Code',
        'not_found': 'Não Encontrado',
        'error': 'Erro na API'
    };
    
    // Sugestão de instância (prioriza a conectada)
    const suggestedInstanceName =
        (connectedInstance?.instanceName && connectedInstance.instanceName !== selectedInstance)
          ? connectedInstance.instanceName
          : (details?.isMismatch && details.name ? details.name : null);
    setDetectedName(suggestedInstanceName);

    if (details && details.state) {
        const friendlyStatus = statusMap[details.state] || details.state || 'unknown';
        setDetailedStatus(friendlyStatus);

        if (details.state === 'open') {
            setStatus('connected');
            setQrCode(null); // Limpa QR code apenas quando conectado
        } else if (details.state === 'connecting') {
            setStatus('connecting');
            // Mantém o QR code se já existir, não limpa
        } else {
            // Para qualquer outro status (close, qrcode, etc), mantém como desconectado
            setStatus('disconnected');
            // Se não houver QR code e o status indicar que precisa de QR, busca um
            if (!qrCode && (details.state === 'qrcode' || details.state === 'close')) {
                // Força busca de QR code se não houver um
                setQrCode(null);
            }
        }
    } else {
        // Se não conseguiu buscar o status, tenta buscar da lista de instâncias
        const instance = allInstances.find(i => i.instanceName === selectedInstance);
        if (instance) {
            const friendlyStatus = statusMap[instance.status] || instance.status || 'unknown';
            setDetailedStatus(friendlyStatus);
            // Se não estiver conectado e não houver QR code, mantém status desconectado
            if (instance.status !== 'open') {
                setStatus('disconnected');
            }
        } else {
            setDetailedStatus('unknown');
            setStatus('disconnected');
        }
    }
  };

  useEffect(() => {
    const initConnection = async () => {
        if (!config.isDemo && isConfigured) {
            await loadInstances(); // Garante que instances esteja populado
            await checkStatus(); // Verifica status imediatamente
        }
    };
    
    initConnection();
    
    if (!config.isDemo && isConfigured && selectedInstance) {
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }
  }, [config, isConfigured, selectedInstance]); // Removido 'status' das dependências para evitar loops

  useEffect(() => {
    const loadQR = async () => {
      if (status === 'connected' || config.isDemo || !isConfigured || !selectedInstance) return;
      // Não retorna se estiver "connecting" - permite buscar QR mesmo durante sincronização

      setIsLoading(true);
      const currentConfig = { ...config, instanceName: selectedInstance };
      const qrData = await getInstanceQRCode(currentConfig, selectedInstance) || await fetchRealQRCode(currentConfig);
      setIsLoading(false);
      
      if (qrData) {
        setQrCode(qrData);
        // Não força status para 'disconnected' se já estiver em outro estado
        if (status !== 'connected') {
          setStatus('disconnected');
        }
        setRefreshTimer(40); 
      } else {
        // Se não conseguiu buscar QR code, verifica o status novamente
        await checkStatus();
      }
    };

    // Busca QR code se não houver um já definido E o status não for 'connected'
    // Isso garante que o QR code seja mantido enquanto não estiver conectado
    if (!config.isDemo && isConfigured && selectedInstance && !qrCode && status !== 'connected') {
        loadQR();
    }
  }, [config, isConfigured, selectedInstance, qrCode, status]); // Adicionado status para reagir a mudanças

  useEffect(() => {
      if (refreshTimer > 0) {
          timerRef.current = setInterval(() => setRefreshTimer(prev => prev - 1), 1000);
      } else if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          // Quando o timer chega a zero, busca novo QR code sem limpar o antigo primeiro
          // Isso mantém o QR code visível até que um novo seja obtido
          if (status !== 'connected' && selectedInstance) {
              // Busca novo QR code mantendo o antigo até obter um novo
              const fetchNewQR = async () => {
                  const currentConfig = { ...config, instanceName: selectedInstance };
                  const qrData = await getInstanceQRCode(currentConfig, selectedInstance) || await fetchRealQRCode(currentConfig);
                  if (qrData) {
                      setQrCode(qrData);
                      setRefreshTimer(40);
                  } else {
                      // Se não conseguiu novo QR, verifica status mas mantém o QR antigo
                      await checkStatus();
                  }
              };
              fetchNewQR();
          }
      }
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshTimer, status, selectedInstance, config]);

  const handleLogout = async () => {
    if (!confirm('Tem certeza que deseja desconectar esta instância?')) return;
    setIsLoading(true);
    const currentConfig = { ...config, instanceName: selectedInstance };
    await logoutInstance(currentConfig);
    setStatus('disconnected');
    setQrCode(null);
    await loadInstances();
    setIsLoading(false);
  };

  const handleFixName = () => {
      if (detectedName && onUpdateConfig) {
          onUpdateConfig({ ...config, instanceName: detectedName });
          setSelectedInstance(detectedName);
          setDetectedName(null);
          alert(`Corrigido para: ${detectedName}`);
      }
  };

  const handleCreateInstance = async () => {
    if (!newInstanceName.trim()) {
      alert('Digite um nome para a instância');
      return;
    }
    
    setIsCreatingInstance(true);
    const newInstance = await createInstance(config, newInstanceName.trim(), true);
    setIsCreatingInstance(false);
    
    if (newInstance) {
      setSelectedInstance(newInstance.instanceName);
      if (onUpdateConfig) {
        onUpdateConfig({ ...config, instanceName: newInstance.instanceName });
      }
      setNewInstanceName('');
      setShowCreateForm(false);
      await loadInstances();
      if (newInstance.qrcode) {
        setQrCode(newInstance.qrcode);
        setStatus('disconnected');
        setRefreshTimer(40);
      } else {
        // Se não veio QR code na resposta, tenta buscar
        setStatus('disconnected');
      }
    } else {
      alert('Erro ao criar instância. Verifique se o nome já existe ou se a API está acessível.');
    }
  };

  const handleDeleteInstance = async (instanceName: string) => {
    if (!confirm(`Tem certeza que deseja deletar a instância "${instanceName}"? Esta ação não pode ser desfeita.`)) {
      return;
    }
    
    setIsLoading(true);
    const success = await deleteInstance(config, instanceName);
    setIsLoading(false);
    
    if (success) {
      await loadInstances();
      if (selectedInstance === instanceName && instances.length > 1) {
        const remaining = instances.filter(i => i.instanceName !== instanceName);
        if (remaining.length > 0) {
          setSelectedInstance(remaining[0].instanceName);
          if (onUpdateConfig) {
            onUpdateConfig({ ...config, instanceName: remaining[0].instanceName });
          }
        }
      } else if (selectedInstance === instanceName) {
        setSelectedInstance('');
      }
    } else {
      alert('Erro ao deletar instância');
    }
  };

  const handleSelectInstance = (instanceName: string) => {
    setSelectedInstance(instanceName);
    if (onUpdateConfig) {
      onUpdateConfig({ ...config, instanceName });
    }
    setQrCode(null); // Limpa QR code ao trocar de instância
    setStatus('disconnected');
  };

  const getStatusLabel = (instanceStatus?: string) => {
      if (instanceStatus === 'open') return 'Conectado';
      if (instanceStatus === 'connecting') return 'Conectando';
      if (instanceStatus === 'qrcode') return 'Aguardando QR';
      return 'Desconectado';
  };

  const getStatusColor = (instanceStatus?: string) => {
      if (instanceStatus === 'open') return 'bg-[#00E0D1]/20 text-[#00E0D1] border-[#00E0D1]/30';
      if (instanceStatus === 'connecting') return 'bg-[#0074FF]/20 text-[#0074FF] border-[#0074FF]/30';
      if (instanceStatus === 'qrcode') return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  };

  const getCurrentStatusLabel = () => {
      if (status === 'connected') return 'SESSÃO ATIVA';
      if (status === 'connecting') return 'SINCRONIZANDO...';
      return 'DESCONECTADO';
  };

  const getCurrentStatusColor = () => {
      if (status === 'connected') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      if (status === 'connecting') return 'bg-blue-100 text-blue-700 border-blue-200';
      return 'bg-slate-200 text-slate-600 border-slate-300';
  };

  const selectedInstanceData = instances.find(i => i.instanceName === selectedInstance);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="bg-[#16191F] rounded-xl shadow-lg neon-border overflow-hidden">
        {/* Header */}
        <div className="bg-[#0D0F13] p-6 border-b border-[#111316] circuit-line flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-xl font-futuristic text-slate-200 flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20">
                  <Smartphone size={24} strokeWidth={2} />
                </div>
                Gerenciamento de Instâncias WhatsApp
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {config.isDemo ? 'Modo Simulação' : `Evolution API: ${config.baseUrl || 'Não configurado'}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!config.isDemo && isConfigured && (
              <button
                onClick={loadInstances}
                disabled={isLoading}
                className="px-4 py-2 bg-[#111316] hover:bg-[#16191F] border border-[#0D0F13] text-slate-300 hover:text-[#00E0D1] hover:border-[#00E0D1]/30 text-sm rounded-lg flex items-center gap-2 disabled:opacity-50 transition-all"
              >
                <RefreshCw size={16} strokeWidth={2} className={isLoading ? 'animate-spin' : ''} />
                Atualizar
              </button>
            )}
            <div className={`px-4 py-1.5 rounded-full text-sm font-tech flex items-center gap-2 border ${getCurrentStatusColor()}`}>
              {status === 'connected' ? <div className="w-2 h-2 rounded-full bg-[#00E0D1] animate-pulse" /> : 
               status === 'connecting' ? <Clock size={14} strokeWidth={2} className="animate-spin" /> : 
               <div className="w-2 h-2 rounded-full bg-slate-500" />}
              {getCurrentStatusLabel()}
            </div>
          </div>
        </div>

        {config.isDemo ? (
          <div className="p-8 text-center py-12">
            <h3 className="font-futuristic text-slate-200 mb-2">Modo Demonstração</h3>
            <p className="text-sm text-slate-400">QR Code simulado.</p>
          </div>
        ) : !isConfigured ? (
          <div className="p-8 text-center py-12">
            <AlertTriangle className="text-amber-400 mx-auto mb-4" size={48} strokeWidth={2} />
            <h3 className="font-futuristic text-slate-200 mb-2">Configuração Necessária</h3>
            <p className="text-sm text-slate-400 mb-4">Configure a URL e API Key do Evolution API nas configurações.</p>
            <button
              onClick={onNavigateToSettings}
              className="px-6 py-2 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] rounded-lg transition-all shadow-lg glow-gradient font-medium"
            >
              Ir para Configurações
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            {/* Left Panel - Instance List */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-futuristic text-slate-200">Instâncias ({instances.length})</h3>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="px-3 py-1.5 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] text-sm rounded-lg transition-all shadow-lg glow-gradient font-medium flex items-center gap-1"
                >
                  <Plus size={16} strokeWidth={2.5} />
                  Nova Instância
                </button>
              </div>

              {showCreateForm && (
                <div className="p-4 bg-[#0D0F13] rounded-xl border border-[#111316] neon-border">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-futuristic text-slate-200">Criar Nova Instância</h4>
                    <button
                      onClick={() => { setShowCreateForm(false); setNewInstanceName(''); }}
                      className="text-slate-400 hover:text-[#00E0D1] transition-colors"
                    >
                      <X size={18} strokeWidth={2} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                    placeholder="Nome da instância (ex: Zentria)"
                    className="w-full px-3 py-2 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded-lg text-sm mb-3 focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateInstance()}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateInstance}
                      disabled={isCreatingInstance}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] text-sm rounded-lg transition-all shadow-lg glow-gradient font-medium disabled:opacity-50"
                    >
                      {isCreatingInstance ? 'Criando...' : 'Criar Instância'}
                    </button>
                    <button
                      onClick={() => { setShowCreateForm(false); setNewInstanceName(''); }}
                      className="px-4 py-2 bg-[#111316] hover:bg-[#16191F] border border-[#0D0F13] text-slate-300 hover:text-[#00E0D1] hover:border-[#00E0D1]/30 text-sm rounded-lg transition-all"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {instances.map((instance) => {
                  const isSelected = selectedInstance === instance.instanceName;
                  return (
                    <div
                      key={instance.instanceName}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all neon-border ${
                        isSelected
                          ? 'border-[#00E0D1] bg-[#00E0D1]/10 shadow-lg glow-cyan'
                          : 'border-[#0D0F13] bg-[#111316] hover:border-[#00E0D1]/30 hover:bg-[#16191F]'
                      }`}
                      onClick={() => handleSelectInstance(instance.instanceName)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Smartphone className={isSelected ? 'text-[#00E0D1]' : 'text-slate-400'} size={18} strokeWidth={2} />
                          <h4 className="font-futuristic text-slate-200">{instance.instanceName}</h4>
                        </div>
                        {!isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteInstance(instance.instanceName);
                            }}
                            className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Deletar instância"
                          >
                            <Trash2 size={16} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {instances.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <Smartphone className="mx-auto mb-2 text-slate-500" size={32} strokeWidth={1.5} />
                    <p className="text-sm">Nenhuma instância encontrada</p>
                    <p className="text-xs mt-1">Crie uma nova instância para começar</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - QR Code and Connection */}
            <div className="space-y-4">
              {selectedInstance ? (
                <>
                  <div>
                    <h3 className="text-lg font-futuristic text-slate-200 mb-2">
                      Instância: {selectedInstance}
                    </h3>
                  </div>

                  {detectedName && detectedName !== config.instanceName && (
                    <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-xl neon-border">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="text-amber-400" size={18} strokeWidth={2} />
                        <p className="text-sm text-amber-400 font-futuristic">Instância Ativa Detectada</p>
                      </div>
                      <p className="text-xs text-amber-300 mb-2">
                        Existe uma instância <strong>conectada</strong> diferente da selecionada: <strong>{detectedName}</strong>.
                        <br />
                        Se você estiver enviando mensagens normalmente, é bem provável que o sistema esteja usando essa instância ativa.
                      </p>
                      <button 
                        onClick={handleFixName} 
                        className="w-full px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 text-sm rounded-lg transition-all"
                      >
                        Corrigir para {detectedName}
                      </button>
                    </div>
                  )}

                  {status === 'connected' ? (
                    <div className="bg-[#111316] p-8 rounded-xl border-2 border-[#00E0D1]/30 text-center neon-border">
                      <CheckCircle size={64} className="text-[#00E0D1] mx-auto mb-4" strokeWidth={2} />
                      <h3 className="text-2xl font-futuristic text-slate-200 mb-2">WhatsApp Conectado</h3>
                      <p className="text-sm text-slate-400 mb-6">Esta instância está conectada e pronta para uso.</p>
                      <button 
                        onClick={handleLogout} 
                        className="px-6 py-2 border-2 border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 text-sm font-semibold transition-all"
                      >
                        Desconectar
                      </button>
                    </div>
                  ) : (
                    <div className="bg-[#111316] p-6 rounded-xl border-2 border-[#0D0F13] neon-border">
                      <h4 className="font-futuristic text-slate-200 mb-4">Conectar WhatsApp</h4>
                      
                      <div className="mb-4">
                        <div className="bg-[#0D0F13] p-4 rounded-lg border border-[#111316] w-full aspect-square max-w-[300px] mx-auto flex items-center justify-center relative">
                          {isLoading && !qrCode ? (
                            <div className="flex flex-col items-center gap-3">
                              <Loader2 className="animate-spin text-[#00E0D1]" size={40} strokeWidth={2} />
                              <span className="text-sm text-slate-400">Carregando QR Code...</span>
                            </div>
                          ) : qrCode ? (
                            <>
                              <img src={qrCode} className="w-full h-full object-contain" alt="QR Code" />
                              {refreshTimer > 0 && (
                                <div className="absolute top-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                                  {refreshTimer}s
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-center">
                              <WifiOff className="text-slate-500 mx-auto mb-2" size={40} strokeWidth={2} />
                              <p className="text-sm text-slate-400">QR Code indisponível</p>
                              <button 
                                onClick={() => checkStatus()} 
                                className="text-[#00E0D1] underline text-xs mt-2 hover:text-[#00C3FF] transition-colors"
                              >
                                Recarregar
                              </button>
                            </div>
                          )}
                        </div>
                        {status === 'connecting' && qrCode && (
                          <div className="mt-2 max-w-[300px] mx-auto bg-[#0074FF]/90 text-white text-xs px-3 py-1.5 rounded-lg text-center">
                            Sincronizando...
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 text-sm text-slate-300">
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 rounded-full flex items-center justify-center font-bold text-[#00E0D1] text-xs flex-shrink-0 mt-0.5 border border-[#00E0D1]/30">1</div>
                          <p>Abra o WhatsApp no celular</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 rounded-full flex items-center justify-center font-bold text-[#00E0D1] text-xs flex-shrink-0 mt-0.5 border border-[#00E0D1]/30">2</div>
                          <p>Menu → Aparelhos Conectados</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 rounded-full flex items-center justify-center font-bold text-[#00E0D1] text-xs flex-shrink-0 mt-0.5 border border-[#00E0D1]/30">3</div>
                          <p>Escaneie o QR Code acima</p>
                        </div>
                      </div>

                      <div className="mt-4 p-3 bg-[#0D0F13] rounded-lg text-xs text-slate-400 border border-[#111316]">
                        <div className="flex items-center gap-2 mb-2 font-futuristic text-slate-300 border-b border-[#111316] pb-2">
                          <Activity size={14} strokeWidth={2} /> DIAGNÓSTICO
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="block uppercase text-slate-500 text-[10px]">Status API</span>
                            <span className="font-mono text-xs text-slate-300">{detailedStatus}</span>
                          </div>
                          <div>
                            <span className="block uppercase text-slate-500 text-[10px]">Instância</span>
                            <span className="font-mono text-xs text-slate-300">{selectedInstance}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-[#0D0F13] p-8 rounded-xl border-2 border-dashed border-[#111316] text-center">
                  <Smartphone className="text-slate-500 mx-auto mb-4" size={48} strokeWidth={1.5} />
                  <h3 className="text-lg font-futuristic text-slate-300 mb-2">Nenhuma Instância Selecionada</h3>
                  <p className="text-sm text-slate-400 mb-4">Selecione uma instância da lista ao lado ou crie uma nova.</p>
                  {instances.length === 0 && (
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="px-6 py-2 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] rounded-lg transition-all shadow-lg glow-gradient font-medium"
                    >
                      Criar Primeira Instância
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Connection;
