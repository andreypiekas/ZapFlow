
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
           <h2 className="text-2xl font-futuristic text-slate-200 flex items-center gap-3">
             <div className="p-2 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20">
               <Bot size={24} strokeWidth={2} />
             </div>
             Automação e Horários
           </h2>
           <p className="text-slate-400 mt-1">Configure o atendimento automático e horários de funcionamento.</p>
        </div>
        
        <div className="flex items-center gap-4">
             {isSaved && <span className="text-[#00E0D1] text-sm font-medium animate-pulse">Salvo com sucesso!</span>}
            <button 
                onClick={handleSave}
                className="bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] px-6 py-2 rounded-lg flex items-center gap-2 font-medium transition-all shadow-lg glow-gradient"
            >
                <Save size={18} strokeWidth={2.5} /> Salvar Configurações
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Config */}
          <div className="lg:col-span-2 space-y-6">
              <div className="bg-[#16191F] rounded-xl shadow-lg neon-border p-6">
                  <div className="flex items-center justify-between mb-6">
                      <h3 className="font-futuristic text-slate-200 flex items-center gap-3">
                          <div className={`p-2 rounded-xl border transition-all ${formData.isEnabled ? 'bg-gradient-to-br from-[#00E0D1]/30 to-[#00E0D1]/10 text-[#00E0D1] border-[#00E0D1]/20 glow-cyan' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
                            <Power size={20} strokeWidth={2} />
                          </div>
                          Status do Robô
                      </h3>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={formData.isEnabled} 
                            onChange={(e) => setFormData({...formData, isEnabled: e.target.checked})}
                            className="sr-only peer" 
                        />
                        <div className="w-11 h-6 bg-[#0D0F13] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-[#0D0F13] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-[#111316] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#00C3FF] peer-checked:to-[#00E0D1]"></div>
                     </label>
                  </div>

                  <div className="space-y-4">
                      <div className={`p-4 rounded-xl border transition-all ${formData.isEnabled ? 'bg-[#00E0D1]/10 border-[#00E0D1]/30 neon-border' : 'bg-[#0D0F13] border-[#111316]'}`}>
                          <p className={`text-sm ${formData.isEnabled ? 'text-[#00E0D1]' : 'text-slate-400'}`}>
                              {formData.isEnabled 
                                ? 'O robô está ativo e responderá automaticamente fora do horário de expediente.' 
                                : 'O robô está desligado. Nenhuma mensagem automática será enviada.'}
                          </p>
                      </div>

                      <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">Mensagem de Ausência (Fora do Horário)</label>
                          <textarea 
                              value={formData.awayMessage}
                              onChange={(e) => setFormData({...formData, awayMessage: e.target.value})}
                              className="w-full px-4 py-3 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none h-32 placeholder:text-slate-500"
                              placeholder="Digite a mensagem enviada quando o cliente chamar fora do horário..."
                          />
                      </div>
                      
                       <div>
                          <label className="block text-sm font-medium text-slate-300 mb-2">Mensagem de Saudação (Início de Conversa)</label>
                          <textarea 
                              value={formData.greetingMessage}
                              onChange={(e) => setFormData({...formData, greetingMessage: e.target.value})}
                              className="w-full px-4 py-3 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none h-32 placeholder:text-slate-500"
                              placeholder="Mensagem enviada ao iniciar um novo atendimento..."
                          />
                      </div>
                  </div>
              </div>
          </div>

          {/* Business Hours */}
          <div className="lg:col-span-1">
              <div className="bg-[#16191F] rounded-xl shadow-lg neon-border p-6 sticky top-6">
                  <h3 className="font-futuristic text-slate-200 flex items-center gap-3 mb-6 circuit-line pb-4">
                      <div className="p-2 bg-gradient-to-br from-[#0074FF]/30 to-[#0074FF]/10 text-[#0074FF] rounded-xl border border-[#0074FF]/20">
                        <Clock size={20} strokeWidth={2} />
                      </div>
                      Horário de Atendimento
                  </h3>
                  
                  <div className="space-y-4">
                      {formData.businessHours.map((bh, index) => (
                          <div key={index} className="flex items-center justify-between pb-3 border-b border-[#111316] last:border-0">
                              <div className="flex items-center gap-3">
                                  <input 
                                    type="checkbox"
                                    checked={bh.isOpen}
                                    onChange={(e) => handleDayChange(index, 'isOpen', e.target.checked)}
                                    className="rounded text-[#00E0D1] focus:ring-[#00E0D1] bg-[#111316] border-[#0D0F13]"
                                  />
                                  <span className={`text-sm font-medium w-16 ${bh.isOpen ? 'text-slate-200' : 'text-slate-500'}`}>
                                      {DAYS[bh.dayOfWeek]}
                                  </span>
                              </div>
                              
                              {bh.isOpen ? (
                                  <div className="flex items-center gap-1">
                                      <input 
                                        type="time" 
                                        value={bh.openTime}
                                        onChange={(e) => handleDayChange(index, 'openTime', e.target.value)}
                                        className="border border-[#0D0F13] bg-[#111316] text-slate-200 rounded px-1 py-0.5 text-xs w-16 text-center focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none"
                                      />
                                      <span className="text-slate-500 text-xs">-</span>
                                      <input 
                                        type="time" 
                                        value={bh.closeTime}
                                        onChange={(e) => handleDayChange(index, 'closeTime', e.target.value)}
                                        className="border border-[#0D0F13] bg-[#111316] text-slate-200 rounded px-1 py-0.5 text-xs w-16 text-center focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none"
                                      />
                                  </div>
                              ) : (
                                  <span className="text-xs text-slate-500 italic px-2">Fechado</span>
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
