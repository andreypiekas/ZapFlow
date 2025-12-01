
import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, Settings, Loader2, Smartphone, WifiOff, Activity, ArrowRight, Clock } from 'lucide-react';
import { ApiConfig } from '../types';
import { fetchRealQRCode, logoutInstance, getDetailedInstanceStatus } from '../services/whatsappService';

interface ConnectionProps {
  config: ApiConfig;
  onNavigateToSettings: () => void;
  onUpdateConfig?: (newConfig: ApiConfig) => void;
}

const Connection: React.FC<ConnectionProps> = ({ config, onNavigateToSettings, onUpdateConfig }) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [detailedStatus, setDetailedStatus] = useState<string>('-');
  const [detectedName, setDetectedName] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshTimer, setRefreshTimer] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isConfigured = config.baseUrl && config.apiKey;

  const checkStatus = async () => {
    if (config.isDemo || !isConfigured) return;
    
    const details = await getDetailedInstanceStatus(config);
    if (details) {
        setDetailedStatus(details.state);
        
        if (details.isMismatch && details.name) {
            setDetectedName(details.name);
        } else {
            setDetectedName(null);
        }

        if (details.state === 'open') {
            setStatus('connected');
            setQrCode(null);
        } else if (details.state === 'connecting') {
            setStatus('connecting');
        } else if (details.state === 'close' || details.state === 'closed') {
            if (status === 'connected') setStatus('disconnected');
        }
    }
  };

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const loadQR = async () => {
      if (status === 'connected' || config.isDemo || !isConfigured) return;
      if (detectedName) return; 
      if (status === 'connecting') return;

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

  // Helper para cor do status
  const getStatusColorClass = () => {
      if (status === 'connected') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      if (status === 'connecting') return 'bg-blue-100 text-blue-700 border-blue-200';
      return 'bg-slate-200 text-slate-600 border-slate-300';
  };

  // Helper para texto do status
  const getStatusText = () => {
      if (status === 'connected') return 'SESSÃO ATIVA';
      if (status === 'connecting') return 'SINCRONIZANDO...';
      return 'DESCONECTADO';
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
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
          <div className={`px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 border ${getStatusColorClass()}`}>
            {status === 'connected' ? (
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            ) : status === 'connecting' ? (
                <Clock size={14} className="animate-spin" />
            ) : (
                <div className="w-2 h-2 rounded-full bg-slate-500" />
            )}
            {getStatusText()}
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
                        O QR Code real não é gerado neste modo.
                    </p>
                 </div>
                 
                 {status === 'connected' ? (
                     <div className="animate-in fade-in">
                        <CheckCircle size={80} className="text-emerald-500 mx-auto mb-4" />
                        <h3 className="text-2xl font-bold text-slate-800">Tudo pronto!</h3>
                        <button onClick={() => setStatus('disconnected')} className="text-red-500 hover:text-red-700 underline mt-4">
                            Desconectar
                        </button>
                     </div>
                 ) : (
                     <button onClick={simulateDemoConnection} className="bg-emerald-600 text-white px-8 py-3 rounded-full font-bold">
                        Simular Conexão
                     </button>
                 )}
             </div>
          ) : (
            <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
                <div className="flex-1 space-y-8 max-w-md">
                    <h3 className="text-lg font-semibold text-slate-800">Instruções:</h3>
                    {/* CORREÇÃO DO JSX AQUI: SUBSTITUIÇÃO DE > POR &gt; */}
                    <div className="flex gap-4"><div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center font-bold text-emerald-700">1</div><p>Abra o WhatsApp no celular</p></div>
                    <div className="flex gap-4"><div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center font-bold text-emerald-700">2</div><p>Menu &gt; Aparelhos Conectados</p></div>
                    <div className="flex gap-4"><div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center font-bold text-emerald-700">3</div><p>Escaneie o QR Code</p></div>

                    <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-200 mt-4">
                        <div className="flex items-center gap-2 mb-2 font-bold text-slate-700 border-b border-slate-200 pb-2">
                             <Activity size={14} /> DIAGNÓSTICO
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                             <div><span className="block uppercase text-slate-400">URL</span> <span className="font-mono text-blue-600">{config.baseUrl}</span></div>
                             <div>
                                <span className="block uppercase text-slate-400">Status</span> 
                                <span className={`font-mono font-bold uppercase ${detailedStatus === 'open' ? 'text-emerald-600' : detailedStatus === 'connecting' ? 'text-blue-500' : 'text-red-500'}`}>
                                    {detailedStatus === 'connecting' ? 'SYNCING...' : detailedStatus}
                                </span>
                             </div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                    {detectedName && detectedName !== config.instanceName && (
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-4 text-center">
                            <p className="text-sm text-amber-800 font-bold">Nome Incorreto</p>
                            <button onClick={handleFixInstanceName} className="text-xs bg-amber-600 text-white px-3 py-1 rounded mt-2">Corrigir para {detectedName}</button>
                        </div>
                    )}

                    {status === 'connected' ? (
                        <div className="text-center animate-in fade-in">
                            <CheckCircle size={80} className="text-emerald-600 mx-auto mb-4" />
                            <h3 className="text-2xl font-bold text-slate-800">Whatsapp Conectado</h3>
                            <button onClick={handleLogout} className="mt-4 px-6 py-2 border border-red-200 text-red-600 rounded-full hover:bg-red-50 text-sm">Desconectar</button>
                        </div>
                    ) : (
                        <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-100 w-[280px] h-[280px] flex items-center justify-center relative">
                            {isLoading || status === 'connecting' ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 className="animate-spin text-emerald-600" size={32} />
                                    <span className="text-xs text-slate-400">Aguardando...</span>
                                </div>
                            ) : qrCode ? (
                                <img src={qrCode} className="w-full h-full object-contain" alt="QR Code" />
                            ) : (
                                <div className="text-center">
                                    <WifiOff className="text-slate-300 mx-auto mb-2" size={32} />
                                    <p className="text-xs text-slate-400">QR Code indisponível</p>
                                    <button onClick={handleManualRefresh} className="text-emerald-600 underline text-xs mt-2">Tentar novamente</button>
                                </div>
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
