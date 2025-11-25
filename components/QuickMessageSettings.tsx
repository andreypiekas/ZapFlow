import React, { useState } from 'react';
import { QuickReply } from '../types';
import { Plus, Trash2, Edit2, MessageSquare, Zap, Save, X } from 'lucide-react';

interface QuickMessageSettingsProps {
  quickReplies: QuickReply[];
  onAdd: (qr: QuickReply) => void;
  onUpdate: (qr: QuickReply) => void;
  onDelete: (id: string) => void;
}

const QuickMessageSettings: React.FC<QuickMessageSettingsProps> = ({ quickReplies, onAdd, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSave = () => {
    if (!title || !content) return;

    if (currentId) {
      onUpdate({ id: currentId, title, content });
    } else {
      onAdd({ id: `qr_${Date.now()}`, title, content });
    }
    resetForm();
  };

  const handleEdit = (qr: QuickReply) => {
    setCurrentId(qr.id);
    setTitle(qr.title);
    setContent(qr.content);
    setIsEditing(true);
  };

  const resetForm = () => {
    setIsEditing(false);
    setCurrentId(null);
    setTitle('');
    setContent('');
  };

  return (
    <div className="max-w-4xl mx-auto">
       <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Zap className="text-yellow-500" />
                    Respostas Rápidas
                </h2>
                <p className="text-slate-500 text-sm mt-1">Crie atalhos para mensagens frequentes.</p>
            </div>
            {!isEditing && (
                <button 
                    onClick={() => setIsEditing(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md flex items-center gap-2 text-sm font-medium transition-colors"
                >
                    <Plus size={16} /> Nova Mensagem
                </button>
            )}
          </div>

          <div className="p-6">
            {isEditing && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 animate-in slide-in-from-top-2">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-slate-700">{currentId ? 'Editar Mensagem' : 'Nova Mensagem'}</h3>
                        <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                    </div>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">Título (Atalho)</label>
                            <input 
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white"
                                placeholder="Ex: Boas Vindas"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1 uppercase tracking-wider">Conteúdo da Mensagem</label>
                            <textarea 
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-md text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-white min-h-[100px]"
                                placeholder="Olá! Como posso ajudar você hoje?"
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={resetForm} className="px-4 py-2 text-slate-500 hover:bg-slate-200 rounded-md text-sm font-medium transition-colors">Cancelar</button>
                            <button onClick={handleSave} className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 font-medium flex items-center gap-2 transition-colors">
                                <Save size={16} /> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {quickReplies.map(qr => (
                    <div key={qr.id} className="border border-slate-200 rounded-lg p-4 hover:border-emerald-300 hover:shadow-sm transition-all group bg-white relative">
                        <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                                <MessageSquare size={14} className="text-emerald-500" />
                                {qr.title}
                            </h4>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute top-3 right-3 bg-white p-1 rounded-md shadow-sm border border-slate-100">
                                <button onClick={() => handleEdit(qr)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={14} /></button>
                                <button onClick={() => onDelete(qr.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 line-clamp-3 bg-slate-50 p-3 rounded border border-slate-100 italic">
                            "{qr.content}"
                        </p>
                    </div>
                ))}
                {quickReplies.length === 0 && !isEditing && (
                    <div className="col-span-1 md:col-span-2 text-center py-12 text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        <Zap size={32} className="mx-auto mb-2 text-slate-300" />
                        <p>Nenhuma resposta rápida cadastrada.</p>
                        <button onClick={() => setIsEditing(true)} className="text-emerald-600 text-sm font-medium hover:underline mt-2">Criar a primeira</button>
                    </div>
                )}
            </div>
          </div>
       </div>
    </div>
  );
};

export default QuickMessageSettings;