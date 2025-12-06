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
    
    if (details && details.state) {
        const friendlyStatus = statusMap[details.state] || details.state || 'unknown';
        setDetailedStatus(friendlyStatus);
        
        if (details.isMismatch && details.name) {
            setDetectedName(details.name);
        }

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
      if (instanceStatus === 'open') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      if (instanceStatus === 'connecting') return 'bg-blue-100 text-blue-700 border-blue-200';
      if (instanceStatus === 'qrcode') return 'bg-amber-100 text-amber-700 border-amber-200';
      return 'bg-slate-200 text-slate-600 border-slate-300';
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
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50 p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Smartphone className="text-emerald-600" />
                Gerenciamento de Instâncias WhatsApp
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {config.isDemo ? 'Modo Simulação' : `Evolution API: ${config.baseUrl || 'Não configurado'}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!config.isDemo && isConfigured && (
              <button
                onClick={loadInstances}
                disabled={isLoading}
                className="px-4 py-2 bg-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-300 flex items-center gap-2 disabled:opacity-50"
              >
                <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                Atualizar
              </button>
            )}
            <div className={`px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 border ${getCurrentStatusColor()}`}>
              {status === 'connected' ? <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> : 
               status === 'connecting' ? <Clock size={14} className="animate-spin" /> : 
               <div className="w-2 h-2 rounded-full bg-slate-500" />}
              {getCurrentStatusLabel()}
            </div>
          </div>
        </div>

        {config.isDemo ? (
          <div className="p-8 text-center py-12">
            <h3 className="font-bold mb-2">Modo Demonstração</h3>
            <p className="text-sm text-slate-500">QR Code simulado.</p>
          </div>
        ) : !isConfigured ? (
          <div className="p-8 text-center py-12">
            <AlertTriangle className="text-amber-500 mx-auto mb-4" size={48} />
            <h3 className="font-bold mb-2">Configuração Necessária</h3>
            <p className="text-sm text-slate-500 mb-4">Configure a URL e API Key do Evolution API nas configurações.</p>
            <button
              onClick={onNavigateToSettings}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
            >
              Ir para Configurações
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
            {/* Left Panel - Instance List */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800">Instâncias ({instances.length})</h3>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 flex items-center gap-1"
                >
                  <Plus size={16} />
                  Nova Instância
                </button>
              </div>

              {showCreateForm && (
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="font-semibold text-slate-800">Criar Nova Instância</h4>
                    <button
                      onClick={() => { setShowCreateForm(false); setNewInstanceName(''); }}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newInstanceName}
                    onChange={(e) => setNewInstanceName(e.target.value)}
                    placeholder="Nome da instância (ex: ZapFlow)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateInstance()}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateInstance}
                      disabled={isCreatingInstance}
                      className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isCreatingInstance ? 'Criando...' : 'Criar Instância'}
                    </button>
                    <button
                      onClick={() => { setShowCreateForm(false); setNewInstanceName(''); }}
                      className="px-4 py-2 bg-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-300"
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
                      className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50 shadow-md'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                      }`}
                      onClick={() => handleSelectInstance(instance.instanceName)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Smartphone className={isSelected ? 'text-emerald-600' : 'text-slate-400'} size={18} />
                          <h4 className="font-bold text-slate-800">{instance.instanceName}</h4>
                        </div>
                        {!isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteInstance(instance.instanceName);
                            }}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title="Deletar instância"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                      <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold border ${getStatusColor(instance.status)}`}>
                        {instance.status === 'open' ? <CheckCircle size={12} /> : 
                         instance.status === 'connecting' ? <Clock size={12} className="animate-spin" /> : 
                         <WifiOff size={12} />}
                        {getStatusLabel(instance.status)}
                      </div>
                    </div>
                  );
                })}
                {instances.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <Smartphone className="mx-auto mb-2 text-slate-300" size={32} />
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
                    <h3 className="text-lg font-bold text-slate-800 mb-2">
                      Instância: {selectedInstance}
                    </h3>
                    {selectedInstanceData && (
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${getStatusColor(selectedInstanceData.status)}`}>
                        {selectedInstanceData.status === 'open' ? <CheckCircle size={14} /> : 
                         selectedInstanceData.status === 'connecting' ? <Clock size={14} className="animate-spin" /> : 
                         <WifiOff size={14} />}
                        {getStatusLabel(selectedInstanceData.status)}
                      </div>
                    )}
                  </div>

                  {detectedName && detectedName !== config.instanceName && (
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="text-amber-600" size={18} />
                        <p className="text-sm text-amber-800 font-bold">Nome Incorreto Detectado</p>
                      </div>
                      <p className="text-xs text-amber-700 mb-2">A API detectou um nome diferente: <strong>{detectedName}</strong></p>
                      <button 
                        onClick={handleFixName} 
                        className="w-full px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
                      >
                        Corrigir para {detectedName}
                      </button>
                    </div>
                  )}

                  {status === 'connected' ? (
                    <div className="bg-white p-8 rounded-xl border-2 border-emerald-200 text-center">
                      <CheckCircle size={64} className="text-emerald-600 mx-auto mb-4" />
                      <h3 className="text-2xl font-bold text-slate-800 mb-2">WhatsApp Conectado</h3>
                      <p className="text-sm text-slate-500 mb-6">Esta instância está conectada e pronta para uso.</p>
                      <button 
                        onClick={handleLogout} 
                        className="px-6 py-2 border-2 border-red-200 text-red-600 rounded-lg hover:bg-red-50 text-sm font-semibold"
                      >
                        Desconectar
                      </button>
                    </div>
                  ) : (
                    <div className="bg-white p-6 rounded-xl border-2 border-slate-200">
                      <h4 className="font-semibold text-slate-800 mb-4">Conectar WhatsApp</h4>
                      
                      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 w-full aspect-square max-w-[300px] mx-auto flex items-center justify-center relative mb-4">
                        {isLoading && !qrCode ? (
                          <div className="flex flex-col items-center gap-3">
                            <Loader2 className="animate-spin text-emerald-600" size={40} />
                            <span className="text-sm text-slate-500">Carregando QR Code...</span>
                          </div>
                        ) : qrCode ? (
                          <>
                            <img src={qrCode} className="w-full h-full object-contain" alt="QR Code" />
                            {refreshTimer > 0 && (
                              <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                                {refreshTimer}s
                              </div>
                            )}
                            {status === 'connecting' && (
                              <div className="absolute bottom-2 left-2 right-2 bg-blue-500/90 text-white text-xs px-2 py-1 rounded text-center">
                                Sincronizando...
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="text-center">
                            <WifiOff className="text-slate-300 mx-auto mb-2" size={40} />
                            <p className="text-sm text-slate-400">QR Code indisponível</p>
                            <button 
                              onClick={() => checkStatus()} 
                              className="text-emerald-600 underline text-xs mt-2"
                            >
                              Recarregar
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 text-sm text-slate-600">
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center font-bold text-emerald-700 text-xs flex-shrink-0 mt-0.5">1</div>
                          <p>Abra o WhatsApp no celular</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center font-bold text-emerald-700 text-xs flex-shrink-0 mt-0.5">2</div>
                          <p>Menu → Aparelhos Conectados</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center font-bold text-emerald-700 text-xs flex-shrink-0 mt-0.5">3</div>
                          <p>Escaneie o QR Code acima</p>
                        </div>
                      </div>

                      <div className="mt-4 p-3 bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-200">
                        <div className="flex items-center gap-2 mb-2 font-bold text-slate-700 border-b border-slate-200 pb-2">
                          <Activity size={14} /> DIAGNÓSTICO
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="block uppercase text-slate-400 text-[10px]">Status API</span>
                            <span className="font-mono text-xs">{detailedStatus}</span>
                          </div>
                          <div>
                            <span className="block uppercase text-slate-400 text-[10px]">Instância</span>
                            <span className="font-mono text-xs">{selectedInstance}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-slate-50 p-8 rounded-xl border-2 border-dashed border-slate-300 text-center">
                  <Smartphone className="text-slate-300 mx-auto mb-4" size={48} />
                  <h3 className="text-lg font-semibold text-slate-600 mb-2">Nenhuma Instância Selecionada</h3>
                  <p className="text-sm text-slate-500 mb-4">Selecione uma instância da lista ao lado ou crie uma nova.</p>
                  {instances.length === 0 && (
                    <button
                      onClick={() => setShowCreateForm(true)}
                      className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
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
