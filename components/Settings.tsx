import React, { useState } from 'react';
import { ApiConfig } from '../types';
import { Save, Server, Shield, Globe } from 'lucide-react';

interface SettingsProps {
  config: ApiConfig;
  onSave: (config: ApiConfig) => void;
}

const Settings: React.FC<SettingsProps> = ({ config, onSave }) => {
  const [formData, setFormData] = useState<ApiConfig>(config);
  const [showSuccess, setShowSuccess] = useState(false);

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
          <h2 className="text-xl font-bold text-slate-800">Configurações de Integração</h2>
          <p className="text-slate-500 text-sm mt-1">Configure a conexão com sua instância do WhatsApp (Evolution API, Z-API, etc).</p>
        </div>

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
                  <Shield size={16} /> Global API Key
                </label>
                <input 
                  type="password" 
                  value={formData.apiKey}
                  onChange={(e) => setFormData({...formData, apiKey: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Sua chave de autenticação"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Nome da Instância</label>
                <input 
                  type="text" 
                  value={formData.instanceName}
                  onChange={(e) => setFormData({...formData, instanceName: e.target.value})}
                  className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="Ex: hostgator_whatsapp"
                />
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
      </div>
    </div>
  );
};

export default Settings;