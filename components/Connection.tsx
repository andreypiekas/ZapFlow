
import React, { useState, useEffect, useRef } from 'react';
import { Smartphone, CheckCircle, WifiOff, Loader2, AlertTriangle, Clock, Activity } from 'lucide-react';
import { ApiConfig } from '../types';
import { fetchRealQRCode, logoutInstance, getDetailedInstanceStatus } from '../services/whatsappService';

interface ConnectionProps {
  config: ApiConfig;
  onNavigateToSettings: () => void;
  onUpdateConfig?: (newConfig: ApiConfig) => void;
}

const Connection: React.FC<ConnectionProps> = ({ config, onNavigateToSettings, onUpdateConfig }) => {
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
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
        }

        if (details.state === 'open') {
            setStatus('connected');
            setQrCode(null);
        } else if (details.state === 'connecting') {
            setStatus('connecting');
        } else {
            if (status === 'connected') setStatus('disconnected');
        }
    }
  };

  useEffect(() => {
    const loadQR = async () => {
      if (status === 'connected' || config.isDemo || !isConfigured) return;
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

    if (!config.isDemo && isConfigured) {
        loadQR();
        const interval = setInterval(checkStatus, 5000);
        return () => clearInterval(interval);
    }
  }, [config, status, isConfigured]);

  useEffect(() => {
      if (refreshTimer > 0) {
          timerRef.current = setInterval(() => setRefreshTimer(prev => prev - 1), 1000);
      }
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshTimer]);

  const handleLogout = async () => {
    setIsLoading(true);
    await logoutInstance(config);
    setStatus('disconnected');
    setQrCode(null);
    setIsLoading(false);
  };

  const handleFixName = () => {
      if (detectedName && onUpdateConfig) {
          onUpdateConfig({ ...config, instanceName: detectedName });
          setDetectedName(null);
          alert(`Corrigido para: ${detectedName}`);
      }
  };

  const getStatusLabel = () => {
      if (status === 'connected') return 'SESSÃO ATIVA';
      if (status === 'connecting') return 'SINCRONIZANDO...';
      return 'DESCONECTADO';
  };

  const getStatusColor = () => {
      if (status === 'connected') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      if (status === 'connecting') return 'bg-blue-100 text-blue-700 border-blue-200';
      return 'bg-slate-200 text-slate-600 border-slate-300';
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
              {config.isDemo ? 'Modo Simulação' : `Instância: ${config.instanceName}`}
            </p>
          </div>
          <div className={`px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 border ${getStatusColor()}`}>
            {status === 'connected' ? <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> : 
             status === 'connecting' ? <Clock size={14} className="animate-spin" /> : 
             <div className="w-2 h-2 rounded-full bg-slate-500" />}
            {getStatusLabel()}
          </div>
        </div>

        <div className="p-8">
          {config.isDemo ? (
             <div className="text-center py-12">
                 <h3 className="font-bold mb-2">Modo Demonstração</h3>
                 <p className="text-sm text-slate-500">QR Code simulado.</p>
             </div>
          ) : (
            <div className="flex flex-col lg:flex-row items-center justify-between gap-12">
                <div className="flex-1 space-y-8 max-w-md">
                    <h3 className="text-lg font-semibold text-slate-800">Instruções:</h3>
                    {/* Fixed JSX Syntax Error here */}
                    <div className="flex gap-4"><div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center font-bold text-emerald-700">1</div><p>Abra o WhatsApp no celular</p></div>
                    <div className="flex gap-4"><div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center font-bold text-emerald-700">2</div><p>Menu &gt; Aparelhos Conectados</p></div>
                    <div className="flex gap-4"><div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center font-bold text-emerald-700">3</div><p>Escaneie o QR Code</p></div>

                    <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-500 border border-slate-200 mt-4">
                        <div className="flex items-center gap-2 mb-2 font-bold text-slate-700 border-b border-slate-200 pb-2">
                             <Activity size={14} /> DIAGNÓSTICO
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                             <div><span className="block uppercase text-slate-400">Status API</span> <span className="font-mono">{detailedStatus}</span></div>
                             <div><span className="block uppercase text-slate-400">Nome</span> <span className="font-mono">{config.instanceName}</span></div>
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                    {detectedName && detectedName !== config.instanceName && (
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg mb-4 text-center">
                            <p className="text-sm text-amber-800 font-bold">Nome Incorreto Detectado</p>
                            <button onClick={handleFixName} className="text-xs bg-amber-600 text-white px-3 py-1 rounded mt-2">
                                Corrigir para {detectedName}
                            </button>
                        </div>
                    )}

                    {status === 'connected' ? (
                        <div className="text-center animate-in fade-in">
                            <CheckCircle size={80} className="text-emerald-600 mx-auto mb-4" />
                            <h3 className="text-2xl font-bold text-slate-800">WhatsApp Conectado</h3>
                            <button onClick={handleLogout} className="mt-4 px-6 py-2 border border-red-200 text-red-600 rounded-full hover:bg-red-50 text-sm">
                                Desconectar
                            </button>
                        </div>
                    ) : (
                        <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-100 w-[280px] h-[280px] flex items-center justify-center relative">
                            {isLoading || status === 'connecting' ? (
                                <div className="flex flex-col items-center gap-2">
                                    <Loader2 className="animate-spin text-emerald-600" size={32} />
                                    <span className="text-xs text-slate-400">{status === 'connecting' ? 'Sincronizando...' : 'Carregando...'}</span>
                                </div>
                            ) : qrCode ? (
                                <img src={qrCode} className="w-full h-full object-contain" alt="QR Code" />
                            ) : (
                                <div className="text-center">
                                    <WifiOff className="text-slate-300 mx-auto mb-2" size={32} />
                                    <p className="text-xs text-slate-400">QR Code indisponível</p>
                                    <button onClick={() => checkStatus()} className="text-emerald-600 underline text-xs mt-2">Recarregar</button>
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
