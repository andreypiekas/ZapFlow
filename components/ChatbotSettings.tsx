
import React, { useState } from 'react';
import { ChatbotConfig, BusinessHours } from '../types';
import { Bot, Save, Clock, Power } from 'lucide-react';

interface ChatbotSettingsProps {
  config: ChatbotConfig;
  onSave: (config: ChatbotConfig) => void;
}

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const ChatbotSettings: React.FC<ChatbotSettingsProps> = ({ config, onSave }) => {
  const [formData, setFormData] = useState<ChatbotConfig>(config);
  const [isSaved, setIsSaved] = useState(false);

  const handleDayChange = (index: number, field: keyof BusinessHours, value: any) => {
    const newHours = [...formData.businessHours];
    newHours[index] = { ...newHours[index], [field]: value };
    setFormData({ ...formData, businessHours: newHours });
  };

  const handleSave = () => {
    onSave(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <Bot className="text-emerald-600" /> Automação e Horários
           </h2>
           <p className="text-slate-500">Configure o atendimento automático e horários de funcionamento.</p>
        </div>
        
        <div className="flex items-center gap-4">
             {isSaved && <span className="text-emerald-600 text-sm font-medium animate-pulse">Salvo com sucesso!</span>}
            <button 
                onClick={handleSave}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 font-medium shadow-sm transition-colors"
            >
                <Save size={18} /> Salvar Configurações
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Config */}
          <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                  <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Power size={20} className={formData.isEnabled ? "text-emerald-500" : "text-slate-400"} />
                          Status do Robô
                      </h3>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={formData.isEnabled} 
                            onChange={(e) => setFormData({...formData, isEnabled: e.target.checked})}
                            className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                     </label>
                  </div>

                  <div className="space-y-4">
                      <div className={`p-4 rounded-lg border ${formData.isEnabled ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                          <p className={`text-sm ${formData.isEnabled ? 'text-emerald-800' : 'text-slate-500'}`}>
                              {formData.isEnabled 
                                ? 'O robô está ativo e responderá automaticamente fora do horário de expediente.' 
                                : 'O robô está desligado. Nenhuma mensagem automática será enviada.'}
                          </p>
                      </div>

                      <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">Mensagem de Ausência (Fora do Horário)</label>
                          <textarea 
                              value={formData.awayMessage}
                              onChange={(e) => setFormData({...formData, awayMessage: e.target.value})}
                              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none h-32"
                              placeholder="Digite a mensagem enviada quando o cliente chamar fora do horário..."
                          />
                      </div>
                      
                       <div>
                          <label className="block text-sm font-bold text-slate-700 mb-2">Mensagem de Saudação (Início de Conversa)</label>
                          <textarea 
                              value={formData.greetingMessage}
                              onChange={(e) => setFormData({...formData, greetingMessage: e.target.value})}
                              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none h-32"
                              placeholder="Mensagem enviada ao iniciar um novo atendimento..."
                          />
                      </div>
                  </div>
              </div>
          </div>

          {/* Business Hours */}
          <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 sticky top-6">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6">
                      <Clock size={20} className="text-blue-500" />
                      Horário de Atendimento
                  </h3>
                  
                  <div className="space-y-4">
                      {formData.businessHours.map((bh, index) => (
                          <div key={index} className="flex items-center justify-between pb-3 border-b border-slate-100 last:border-0">
                              <div className="flex items-center gap-3">
                                  <input 
                                    type="checkbox"
                                    checked={bh.isOpen}
                                    onChange={(e) => handleDayChange(index, 'isOpen', e.target.checked)}
                                    className="rounded text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <span className={`text-sm font-medium w-16 ${bh.isOpen ? 'text-slate-700' : 'text-slate-400'}`}>
                                      {DAYS[bh.dayOfWeek]}
                                  </span>
                              </div>
                              
                              {bh.isOpen ? (
                                  <div className="flex items-center gap-1">
                                      <input 
                                        type="time" 
                                        value={bh.openTime}
                                        onChange={(e) => handleDayChange(index, 'openTime', e.target.value)}
                                        className="border border-slate-300 rounded px-1 py-0.5 text-xs w-16 text-center"
                                      />
                                      <span className="text-slate-400 text-xs">-</span>
                                      <input 
                                        type="time" 
                                        value={bh.closeTime}
                                        onChange={(e) => handleDayChange(index, 'closeTime', e.target.value)}
                                        className="border border-slate-300 rounded px-1 py-0.5 text-xs w-16 text-center"
                                      />
                                  </div>
                              ) : (
                                  <span className="text-xs text-slate-400 italic px-2">Fechado</span>
                              )}
                          </div>
                      ))}
                  </div>
              </div>
          </div>

      </div>
    </div>
  );
};

export default ChatbotSettings;
