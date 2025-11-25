
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
           <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
             <ListChecks className="text-emerald-600" /> Fluxos de Atendimento
           </h2>
           <p className="text-slate-500">Crie procedimentos padrão (SOP) para guiar seus operadores.</p>
        </div>
        {!isEditing && (
            <button 
                onClick={() => setIsEditing(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-md flex items-center gap-2 font-medium shadow-sm transition-colors"
            >
                <Plus size={18} /> Novo Fluxo
            </button>
        )}
      </div>

      {isEditing ? (
        <div className="bg-white rounded-lg shadow-sm border border-emerald-100 overflow-hidden animate-in slide-in-from-top-4">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50/50">
                <h3 className="font-bold text-slate-700 text-lg">{currentId ? 'Editar Fluxo' : 'Novo Fluxo de Trabalho'}</h3>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            
            <div className="p-6 space-y-6">
                <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Nome do Fluxo</label>
                    <input 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: Atualização de Boleto, Triagem Inicial..."
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                </div>

                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-3">Passos do Processo</label>
                    
                    {/* List Existing Steps */}
                    <div className="space-y-2 mb-4">
                        {steps.map((step, index) => (
                            <div key={step.id} className="flex items-center gap-3 bg-white p-3 rounded border border-slate-200 shadow-sm">
                                <span className="bg-slate-100 text-slate-500 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
                                    {index + 1}
                                </span>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-700">{step.title}</p>
                                    {step.targetDepartmentId && (
                                        <div className="flex items-center gap-1 text-xs text-blue-600 mt-1">
                                            <ArrowRight size={12} /> Transferir para: {getDepartmentName(step.targetDepartmentId)}
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => removeStep(step.id)} className="text-red-400 hover:text-red-600 p-1">
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                        {steps.length === 0 && <p className="text-sm text-slate-400 italic text-center py-2">Nenhum passo adicionado ainda.</p>}
                    </div>

                    {/* Add New Step Form */}
                    <div className="flex flex-col md:flex-row gap-3 items-end border-t border-slate-200 pt-4">
                        <div className="flex-1 w-full">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Descrição do Passo</label>
                            <input 
                                value={newStepTitle}
                                onChange={(e) => setNewStepTitle(e.target.value)}
                                placeholder="Ex: Solicitar CPF do cliente"
                                className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-emerald-500"
                                onKeyDown={(e) => e.key === 'Enter' && handleAddStep()}
                            />
                        </div>
                        <div className="w-full md:w-1/3">
                            <label className="block text-xs font-medium text-slate-500 mb-1">Ação ao final (Opcional)</label>
                            <select 
                                value={newStepDept}
                                onChange={(e) => setNewStepDept(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded text-sm outline-none focus:border-emerald-500 bg-white"
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
                            className="bg-slate-800 text-white px-4 py-2 rounded text-sm hover:bg-slate-900 transition-colors"
                        >
                            Adicionar
                        </button>
                    </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button onClick={resetForm} className="px-6 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button onClick={handleSaveWorkflow} className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2">
                        <Save size={18} /> Salvar Fluxo
                    </button>
                </div>
            </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map(wf => (
                <div key={wf.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow relative group">
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                        <button onClick={() => handleEdit(wf)} className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"><Edit2 size={14}/></button>
                        <button onClick={() => onDelete(wf.id)} className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100"><Trash2 size={14}/></button>
                    </div>
                    
                    <h3 className="font-bold text-slate-800 mb-2 pr-12">{wf.title}</h3>
                    <div className="space-y-2">
                        {wf.steps.slice(0, 3).map((step, idx) => (
                            <div key={step.id} className="flex items-start gap-2 text-sm text-slate-600">
                                <span className="bg-slate-100 text-slate-400 w-5 h-5 rounded flex items-center justify-center text-[10px] shrink-0 mt-0.5">{idx + 1}</span>
                                <span className="truncate">{step.title}</span>
                            </div>
                        ))}
                        {wf.steps.length > 3 && (
                            <p className="text-xs text-slate-400 pl-7">+ {wf.steps.length - 3} passos...</p>
                        )}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                        <span>{wf.steps.length} etapas</span>
                        {wf.steps.some(s => s.targetDepartmentId) && (
                            <span className="flex items-center gap-1 text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                <ArrowRight size={10} /> Transferência Auto
                            </span>
                        )}
                    </div>
                </div>
            ))}
             {workflows.length === 0 && (
                <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                    <ListChecks size={48} className="mx-auto mb-3 opacity-20" />
                    <p>Nenhum fluxo cadastrado.</p>
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default WorkflowSettings;
