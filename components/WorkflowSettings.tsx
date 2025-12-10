
import React, { useState } from 'react';
import { Workflow, WorkflowStep, Department } from '../types';
import { Plus, Trash2, Edit2, ListChecks, Save, X, ArrowRight, GripVertical } from 'lucide-react';

interface WorkflowSettingsProps {
  workflows: Workflow[];
  departments: Department[];
  onAdd: (wf: Workflow) => void;
  onUpdate: (wf: Workflow) => void;
  onDelete: (id: string) => void;
}

const WorkflowSettings: React.FC<WorkflowSettingsProps> = ({ workflows, departments, onAdd, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<WorkflowStep[]>([]);

  // State for new step input
  const [newStepTitle, setNewStepTitle] = useState('');
  const [newStepDept, setNewStepDept] = useState('');

  const handleEdit = (wf: Workflow) => {
    setCurrentId(wf.id);
    setTitle(wf.title);
    setSteps([...wf.steps]);
    setIsEditing(true);
  };

  const handleAddStep = () => {
    if (!newStepTitle.trim()) return;
    const newStep: WorkflowStep = {
      id: `step_${Date.now()}`,
      title: newStepTitle,
      targetDepartmentId: newStepDept || undefined
    };
    setSteps([...steps, newStep]);
    setNewStepTitle('');
    setNewStepDept('');
  };

  const removeStep = (stepId: string) => {
    setSteps(steps.filter(s => s.id !== stepId));
  };

  const handleSaveWorkflow = () => {
    if (!title.trim() || steps.length === 0) {
      alert("O fluxo precisa de um título e pelo menos um passo.");
      return;
    }

    const workflowData: Workflow = {
      id: currentId || `wf_${Date.now()}`,
      title,
      steps
    };

    if (currentId) {
      onUpdate(workflowData);
    } else {
      onAdd(workflowData);
    }
    resetForm();
  };

  const resetForm = () => {
    setIsEditing(false);
    setCurrentId(null);
    setTitle('');
    setSteps([]);
    setNewStepTitle('');
    setNewStepDept('');
  };

  const getDepartmentName = (id?: string) => departments.find(d => d.id === id)?.name;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h2 className="text-2xl font-futuristic text-slate-200 flex items-center gap-3">
             <div className="p-2 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20">
               <ListChecks size={24} strokeWidth={2} />
             </div>
             Fluxos de Atendimento
           </h2>
           <p className="text-slate-400 mt-1">Crie procedimentos padrão (SOP) para guiar seus operadores.</p>
        </div>
        {!isEditing && (
            <button 
                onClick={() => setIsEditing(true)}
                className="bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition-all shadow-lg glow-gradient"
            >
                <Plus size={18} strokeWidth={2.5} /> Novo Fluxo
            </button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-[#16191F] rounded-xl shadow-lg neon-border overflow-hidden animate-in slide-in-from-top-4">
            <div className="p-6 border-b border-[#111316] flex justify-between items-center bg-[#0D0F13]">
                <h3 className="font-futuristic text-slate-200 text-lg">{currentId ? 'Editar Fluxo' : 'Novo Fluxo de Trabalho'}</h3>
                <button onClick={resetForm} className="text-slate-400 hover:text-[#00E0D1] transition-colors"><X size={20} strokeWidth={2} /></button>
            </div>
            
            <div className="p-6 space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Nome do Fluxo</label>
                    <input 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: Atualização de Boleto, Triagem Inicial..."
                        className="w-full px-4 py-2 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500"
                    />
                </div>

                <div className="bg-[#0D0F13] rounded-xl p-4 border border-[#111316]">
                    <label className="block text-xs font-medium text-slate-400 uppercase mb-3 tracking-wider">Passos do Processo</label>
                    
                    {/* List Existing Steps */}
                    <div className="space-y-2 mb-4">
                        {steps.map((step, index) => (
                            <div key={step.id} className="flex items-center gap-3 bg-[#111316] p-3 rounded-lg border border-[#0D0F13] hover:border-[#00E0D1]/30 transition-all">
                                <span className="bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] border border-[#00E0D1]/20 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                                    {index + 1}
                                </span>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-200">{step.title}</p>
                                    {step.targetDepartmentId && (
                                        <div className="flex items-center gap-1 text-xs text-[#0074FF] mt-1">
                                            <ArrowRight size={12} strokeWidth={2} /> Transferir para: {getDepartmentName(step.targetDepartmentId)}
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => removeStep(step.id)} className="text-red-400 hover:text-red-500 p-1 transition-colors">
                                    <Trash2 size={16} strokeWidth={2} />
                                </button>
                            </div>
                        ))}
                        {steps.length === 0 && <p className="text-sm text-slate-500 italic text-center py-2">Nenhum passo adicionado ainda.</p>}
                    </div>

                    {/* Add New Step Form */}
                    <div className="flex flex-col md:flex-row gap-3 items-end border-t border-[#111316] pt-4">
                        <div className="flex-1 w-full">
                            <label className="block text-xs font-medium text-slate-400 mb-1">Descrição do Passo</label>
                            <input 
                                value={newStepTitle}
                                onChange={(e) => setNewStepTitle(e.target.value)}
                                placeholder="Ex: Solicitar CPF do cliente"
                                className="w-full px-3 py-2 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded text-sm outline-none focus:border-[#00E0D1] focus:ring-2 focus:ring-[#00E0D1]/20 placeholder:text-slate-500"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
                            />
                        </div>
                        <div className="w-full md:w-1/3">
                            <label className="block text-xs font-medium text-slate-400 mb-1">Ação ao final (Opcional)</label>
                            <select 
                                value={newStepDept}
                                onChange={(e) => setNewStepDept(e.target.value)}
                                className="w-full px-3 py-2 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded text-sm outline-none focus:border-[#00E0D1] focus:ring-2 focus:ring-[#00E0D1]/20"
                            >
                                <option value="">Apenas marcar concluído</option>
                                <optgroup label="Transferir para...">
                                    {departments.map(dept => (
                                        <option key={dept.id} value={dept.id}>{dept.name}</option>
                                    ))}
                                </optgroup>
                            </select>
                        </div>
                        <button 
                            onClick={handleAddStep}
                            className="bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg glow-gradient"
                        >
                            Adicionar
                        </button>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[#111316]">
                    <button onClick={resetForm} className="px-6 py-2 text-slate-400 hover:text-slate-200 hover:bg-[#0D0F13] rounded-lg transition-colors">Cancelar</button>
                    <button onClick={handleSaveWorkflow} className="px-6 py-2 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] rounded-lg flex items-center gap-2 font-medium transition-all shadow-lg glow-gradient">
                        <Save size={18} strokeWidth={2.5} /> Salvar Fluxo
                    </button>
                </div>
            </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map(wf => (
                <div key={wf.id} className="bg-[#16191F] rounded-xl shadow-lg neon-border p-5 hover:border-[#00E0D1]/50 hover-glow transition-all relative group">
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                        <button onClick={() => handleEdit(wf)} className="p-1.5 bg-[#0074FF]/20 text-[#0074FF] rounded-lg hover:bg-[#0074FF]/30 border border-[#0074FF]/30 transition-all"><Edit2 size={14} strokeWidth={2}/></button>
                        <button onClick={() => onDelete(wf.id)} className="p-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 border border-red-500/30 transition-all"><Trash2 size={14} strokeWidth={2}/></button>
                    </div>
                    
                    <h3 className="font-futuristic text-slate-200 mb-2 pr-12">{wf.title}</h3>
                    <div className="space-y-2">
                        {wf.steps.slice(0, 3).map((step, idx) => (
                            <div key={step.id} className="flex items-start gap-2 text-sm text-slate-300">
                                <span className="bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] border border-[#00E0D1]/20 w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{idx + 1}</span>
                                <span className="truncate">{step.title}</span>
                            </div>
                        ))}
                        {wf.steps.length > 3 && (
                            <p className="text-xs text-slate-500 pl-7">+ {wf.steps.length - 3} passos...</p>
                        )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-[#111316] flex items-center justify-between text-xs text-slate-400">
                        <span>{wf.steps.length} etapas</span>
                        {wf.steps.some(s => s.targetDepartmentId) && (
                            <span className="flex items-center gap-1 text-[#0074FF] bg-[#0074FF]/20 border border-[#0074FF]/30 px-2 py-0.5 rounded-full">
                                <ArrowRight size={10} strokeWidth={2} /> Transferência Auto
                            </span>
                        )}
                    </div>
                </div>
            ))}
             {workflows.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-500 bg-[#0D0F13] rounded-xl border border-dashed border-[#111316]">
                    <ListChecks size={48} className="mx-auto mb-3 opacity-20" strokeWidth={1.5} />
                    <p>Nenhum fluxo cadastrado.</p>
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default WorkflowSettings;
