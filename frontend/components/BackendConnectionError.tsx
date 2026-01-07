import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, Server, Wifi, WifiOff } from 'lucide-react';
import { apiService } from '../services/apiService';

interface BackendConnectionErrorProps {
  backendUrl: string;
}

const BackendConnectionError: React.FC<BackendConnectionErrorProps> = ({ backendUrl }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<'checking' | 'success' | 'failed' | null>(null);

  const checkBackend = async () => {
    setIsChecking(true);
    setCheckStatus('checking');
    
    try {
      const isAvailable = await apiService.healthCheck();
      if (isAvailable) {
        setCheckStatus('success');
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        setCheckStatus('failed');
      }
    } catch (error) {
      setCheckStatus('failed');
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // Verifica automaticamente a cada 5 segundos
    const interval = setInterval(() => {
      checkBackend();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-slate-800 rounded-lg shadow-2xl p-8 border border-slate-700">
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center">
              <Server className="w-10 h-10 text-red-400" />
            </div>
            <div className="absolute -top-1 -right-1">
              <WifiOff className="w-6 h-6 text-red-500" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-white text-center mb-4">
          Backend Não Disponível
        </h1>

        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-300 font-semibold mb-2">
                O backend é obrigatório para o funcionamento do sistema.
              </p>
              <p className="text-slate-300 text-sm">
                O servidor backend não está respondendo. Verifique se o servidor está rodando e acessível.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-slate-700/50 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Wifi className="w-5 h-5" />
            Informações de Conexão
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">URL do Backend:</span>
              <span className="text-white font-mono">{backendUrl}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Status:</span>
              <span className="text-red-400 font-semibold">Desconectado</span>
            </div>
          </div>
        </div>

        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-blue-400" />
            Possíveis Soluções
          </h2>
          <ol className="list-decimal list-inside space-y-2 text-slate-300 text-sm">
            <li>
              <strong className="text-white">Verifique se o servidor está rodando:</strong>
              <pre className="mt-1 p-2 bg-slate-900 rounded text-xs text-emerald-400">
                cd backend{'\n'}npm start
              </pre>
            </li>
            <li>
              <strong className="text-white">Verifique o firewall:</strong>
              <p className="mt-1 text-slate-400">
                Certifique-se de que a porta 3001 está aberta no firewall do servidor.
              </p>
            </li>
            <li>
              <strong className="text-white">Verifique a URL:</strong>
              <p className="mt-1 text-slate-400">
                Confirme que o IP <code className="bg-slate-900 px-1 rounded">{backendUrl.replace('http://', '').replace(':3001', '')}</code> está correto e acessível.
              </p>
            </li>
            <li>
              <strong className="text-white">Teste a conexão manualmente:</strong>
              <p className="mt-1 text-slate-400">
                Abra <a href={`${backendUrl}/api/health`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{backendUrl}/api/health</a> no navegador.
              </p>
            </li>
          </ol>
        </div>

        <div className="flex gap-4">
          <button
            onClick={checkBackend}
            disabled={isChecking}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isChecking ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Verificando...
              </>
            ) : checkStatus === 'success' ? (
              <>
                <Wifi className="w-5 h-5" />
                Conectado! Recarregando...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Tentar Novamente
              </>
            )}
          </button>
          <button
            onClick={() => window.location.reload()}
            className="bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Recarregar Página
          </button>
        </div>

        {checkStatus === 'checking' && (
          <p className="text-center text-slate-400 text-sm mt-4">
            Verificando conexão com o backend...
          </p>
        )}
      </div>
    </div>
  );
};

export default BackendConnectionError;

