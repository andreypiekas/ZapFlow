
import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, Settings, Loader2, Smartphone, WifiOff, Activity, ArrowRight } from 'lucide-react';
import { ApiConfig } from '../types';
import { fetchRealQRCode, logoutInstance, getSystemStatus, getDetailedInstanceStatus } from '../services/whatsappService';

interface ConnectionProps {
  config: ApiConfig;
  onNavigateToSettings: () => void;
  onUpdateConfig?: (newConfig: ApiConfig) => void; // New prop to auto-fix config
}

const Connection: React.FC<ConnectionProps> = ({ config, onNavigateToSettings, onUpdateConfig }) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [detailedStatus, setDetailedStatus] = useState<string>('-');
  const [detectedName, setDetectedName] = useState<string | null>(null); // For mismatch handling
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTimer, setRefreshTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isConfigured = config.baseUrl && config.apiKey;

  // Poll status functionality
  const checkStatus = async () => {
    if (config.isDemo || !isConfigured) return;
    
    // Check detailed status for debug & mismatch detection
    const details = await getDetailedInstanceStatus(config);
    if (details) {
        setDetailedStatus(details.state);
        
        // Handle Mismatch
        if (details.isMismatch && details.name) {
            setDetectedName(details.name);
        } else {
            setDetectedName(null);
        }

        // Handle Connection
        if (details.state === 'open') {
            setStatus('connected');
            setQrCode(null);
        } else if (details.state === 'connecting') {
            setStatus('connecting');
        } else {
            // Se estava conectado e caiu, muda status
            if (status === 'connected') setStatus('disconnected');
        }
    }
  };

  // Main QR Code Loop
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const loadQR = async () => {
      if (status === 'connected' || config.isDemo || !isConfigured) return;
      
      // Don't fetch QR if we found a mismatch (user needs to fix first)
      if (detectedName) return; 

      setIsLoading(true);
      const qrData = await fetchRealQRCode(config);
      setIsLoading(false);
      
      if (qrData) {
        setQrCode(qrData);
        setStatus('disconnected');
        setRefreshTimer(40); 
      } else {
        await checkStatus();
      }
    };

    if (!config.isDemo && status !== 'connected' && isConfigured) {
        loadQR();
        checkStatus(); 
        
        intervalId = setInterval(() => {
           loadQR();
        }, 40000); 

        const statusInterval = setInterval(checkStatus, 5000);

        return () => {
            clearInterval(intervalId);
            clearInterval(statusInterval);
        };
    }
  }, [config, status, isConfigured, detectedName]);

  // Countdown timer effect
  useEffect(() => {
      if (refreshTimer > 0) {
          timerRef.current = setInterval(() => {
              setRefreshTimer(prev => prev - 1);
          }, 1000);
      }
      return () => {
          if (timerRef.current) clearInterval(timerRef.current);
      };
  }, [refreshTimer]);

  const handleManualRefresh = async () => {
    if (!isConfigured) {
        onNavigateToSettings();
        return;
    }
    setIsLoading(true);
    await checkStatus();
    // Only fetch QR if no mismatch
    if (!detectedName) {
        const qrData = await fetchRealQRCode(config);
        if (qrData) {
            setQrCode(qrData);
            setRefreshTimer(40);
        }
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    setIsLoading(true);
    await logoutInstance(config);
    setStatus('disconnected');
    setDetailedStatus('close');
    setQrCode(null);
    setIsLoading(false);
  };

  const handleFixInstanceName = () => {
      if (detectedName && onUpdateConfig) {
          onUpdateConfig({
              ...config,
              instanceName: detectedName
          });
          setDetectedName(null);
          // Force reload logic
          setStatus('disconnected'); 
          alert(`Instância atualizada para: ${detectedName}`);
      }
  };

  const simulateDemoConnection = () => {
      setIsLoading(true);
      setTimeout(() => {
          setStatus('connected');
          setIsLoading(false);
      }, 2000);
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-50 p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Smartphone className="text-emerald-600" />
                Conexão WhatsApp
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              {config.isDemo ? 'Ambiente de Simulação (Demo)' : `Instância: ${config.instanceName}`}
            </p>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 ${status === 'connected' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : status === 'connecting' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-slate-200 text-slate-600 border border-slate-300'}`}>
            <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-500 animate-pulse' : status === 'connecting' ? 'bg-amber-500 animate-bounce' : 'bg-slate-500'}`} />
            {status === 'connected' ? 'SESSÃO ATIVA' : status === 'connecting' ? 'CONECTANDO...' : 'DESCONECTADO'}
          </div>
        </div>

        <div className="p-8">
          {config.isDemo ? (
             <div className="flex flex-col items-center justify-center py-12 text-center">
                 <div className="mb-6 p-4 bg-blue-50 text-blue-800 rounded-lg border border-blue-100 max-w-lg">
                    <h3 className="font-bold flex items-center justify-center gap-2 mb-2">
                        <AlertTriangle size={18} /> Modo Demonstração
                    </h3>
                    <p className="text-sm">
                        O QR Code real não é gerado neste modo. Clique no botão abaixo para simular uma conexão bem-sucedida e testar a interface do chat.
                    </p>
                 </div>
                 
                 {status === 'connected' ? (
                     <div className="animate-in fade-in zoom-in duration-300">
                        <CheckCircle size={80} className="text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-slate-800">Tudo pronto!</h3>
                        <p className="text-slate-500 mt-2 mb-6">O sistema está simulando uma conexão ativa.</p>
                        <button 
                            onClick={() => setStatus('disconnected')}
                            className="text-red-500 hover:text-red-700 underline"
                        >
                            Desconectar Simulação
                        </button>
                     </div>
                 ) : (
                     <button 
                        onClick={simulateDemoConnection}
                        disabled={isLoading}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-full font-bold shadow-lg shadow-emerald-200 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                     >
                        {isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        Simular Conexão Agora
                     </button>
                 )}
             </div>
          ) : (
            // REAL MODE UI
            <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
            
                <div className="flex-1 space-y-8 max-w-md">
                    <h3 className="text-lg font-semibold text-slate-800">Como conectar:</h3>
                    
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold flex-shrink-0">1</div>
                        <div>
                            <p className="font-medium text-slate-800">Abra o WhatsApp no seu celular</p>
                        </div>
                    </div>
                    
                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold flex-shrink-0">2</div>
                        <div>
                            <p className="font-medium text-slate-800">Toque em Menu ou Configurações</p>
                            <p className="text-sm text-slate-500">Selecione "Aparelhos conectados" e depois "Conectar um aparelho".</p>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold flex-shrink-0">3</div>
                        <div>
                            <p className="font-medium text-slate-800">Aponte a câmera para a tela</p>
                            <p className="text-sm text-slate-500">Capture o QR Code exibido ao lado.</p>
                        </div>
                    </div>

                    {/* DIAGNOSTIC PANEL */}
                    <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-200 mt-4">
                        <div className="flex items-center gap-2 mb-2 font-bold text-slate-700 border-b border-slate-200 pb-2">
                             <Activity size={14} /> DIAGNÓSTICO
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                             <div>
                                <span className="block text-[10px] uppercase text-slate-400">URL API</span>
                                <span className={`block truncate font-mono ${isConfigured ? 'text-blue-600' : 'text-red-500'}`}>
                                    {isConfigured ? config.baseUrl : 'OFF'}
                                </span>
                             </div>
                             <div>
                                <span className="block text-[10px] uppercase text-slate-400">Status Instância</span>
                                <span className={`block font-mono uppercase font-bold ${detailedStatus === 'open' ? 'text-emerald-600' : detailedStatus === 'connecting' ? 'text-amber-500' : 'text-slate-600'}`}>
                                    {detailedStatus}
                                </span>
                             </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                    {/* INSTANCE NAME MISMATCH FIXER */}
                    {detectedName && detectedName !== config.instanceName && (
                        <div className="bg-amber-50 border border-amber-200 p-6 rounded-xl text-center mb-6 max-w-sm animate-in zoom-in">
                            <AlertTriangle className="mx-auto text-amber-500 mb-2" size={32} />
                            <h4 className="font-bold text-amber-800">Nome da Instância Incorreto</h4>
                            <p className="text-sm text-amber-700 mt-1 mb-4">
                                Você configurou <b>{config.instanceName}</b>, mas o servidor está usando <b>{detectedName}</b>.
                            </p>
                            <button 
                                onClick={handleFixInstanceName}
                                className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-amber-700 flex items-center gap-2 mx-auto"
                            >
                                <ArrowRight size={16} /> Usar {detectedName}
                            </button>
                        </div>
                    )}

                    {status === 'connected' ? (
                    <div className="text-center animate-in fade-in zoom-in">
                        <div className="w-32 h-32 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <CheckCircle size={64} className="text-emerald-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Whatsapp Conectado</h3>
                        <p className="text-slate-500 mb-8">Sua instância está pronta para enviar e receber mensagens.</p>
                        <button 
                        onClick={handleLogout}
                        className="px-6 py-2 border border-red-200 text-red-600 rounded-full hover:bg-red-50 transition-colors text-sm font-medium"
                        >
                        Desconectar Dispositivo
                        </button>
                    </div>
                    ) : (
                    <div className={`bg-white p-4 rounded-xl shadow-lg border border-slate-100 relative group ${detectedName ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                        {/* QR Container */}
                        <div className="w-[280px] h-[280px] bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden relative">
                            {isLoading ? (
                                <div className="flex flex-col items-center gap-3">
                                    <Loader2 className="animate-spin text-emerald-600" size={32} />
                                    <span className="text-xs text-slate-400">
                                        {detailedStatus === 'connecting' ? 'Iniciando Navegador...' : 'Comunicando com servidor...'}
                                    </span>
                                </div>
                            ) : !isConfigured ? (
                                <div className="text-center p-6">
                                    <Settings className="text-slate-400 mx-auto mb-2" size={32} />
                                    <p className="text-sm text-slate-700 font-bold">API Não Configurada</p>
                                    <p className="text-xs text-slate-500 mt-1 mb-4">Insira a URL da API e a Chave para gerar o QR Code.</p>
                                    <button 
                                        onClick={onNavigateToSettings}
                                        className="bg-emerald-600 text-white px-4 py-2 rounded-md text-xs font-semibold hover:bg-emerald-700"
                                    >
                                        Configurar Agora
                                    </button>
                                </div>
                            ) : qrCode ? (
                                <>
                                    <img src={qrCode} alt="WhatsApp QR Code" className="w-full h-full object-contain mix-blend-multiply" />
                                    <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <p className="font-bold text-slate-800">Escanear com WhatsApp</p>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center p-6">
                                    <WifiOff className="text-red-400 mx-auto mb-2" size={32} />
                                    <p className="text-sm text-slate-600 font-medium">QR Code Indisponível</p>
                                    <p className="text-xs text-slate-400 mt-1 mb-2">A API não retornou o código.</p>
                                    <div className="text-[10px] bg-slate-50 p-2 rounded mb-2 border border-slate-200">
                                        Status: {detailedStatus}
                                    </div>
                                    <button onClick={handleManualRefresh} className="mt-2 text-emerald-600 underline text-xs">Tentar novamente</button>
                                </div>
                            )}
                        </div>

                        {/* Footer Timer */}
                        {isConfigured && qrCode && (
                            <>
                                <div className="mt-4 flex items-center justify-between text-sm">
                                    <span className="text-slate-500">Atualiza em:</span>
                                    <span className={`font-mono font-bold ${refreshTimer < 10 ? 'text-red-500' : 'text-slate-700'}`}>
                                        {refreshTimer}s
                                    </span>
                                </div>
                                
                                <div className="mt-2 w-full bg-slate-100 h-1 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-emerald-500 transition-all duration-1000 ease-linear"
                                        style={{ width: `${(refreshTimer / 40) * 100}%` }}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                    )}
                </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Connection;
