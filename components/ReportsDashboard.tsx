
import React from 'react';
import { Chat, Department } from '../types';
import { BarChart, Clock, ThumbsUp, MessageSquare, CheckCircle, TrendingUp, Users, Download } from 'lucide-react';

interface ReportsDashboardProps {
  chats: Chat[];
  departments: Department[];
}

const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ chats, departments }) => {
  
  // Métricas Principais
  const totalChats = chats.length;
  const activeChats = chats.filter(c => c.status !== 'closed').length;
  const closedChats = chats.filter(c => c.status === 'closed').length;
  
  // Filtra avaliações válidas (rating deve ser um número entre 1 e 5)
  const ratedChats = chats.filter(c => {
    const rating = c.rating;
    return rating !== undefined && rating !== null && typeof rating === 'number' && rating >= 1 && rating <= 5;
  });
  
  const averageRating = ratedChats.length > 0 
    ? (ratedChats.reduce((acc, curr) => acc + (curr.rating || 0), 0) / ratedChats.length).toFixed(1)
    : 'N/A';

  // Simulação de Tempo Médio de Atendimento (SLA)
  // Em produção, isso seria calculado (EndedAt - StartedAt)
  const averageHandleTime = "12m 30s"; 
  const averageResponseTime = "45s";

  // Agrupamentos
  const chatsByDepartment = departments.map(dept => {
    const count = chats.filter(c => c.departmentId === dept.id).length;
    const closed = chats.filter(c => c.departmentId === dept.id && c.status === 'closed').length;
    const rated = chats.filter(c => {
      const rating = c.rating;
      return c.departmentId === dept.id && rating !== undefined && rating !== null && typeof rating === 'number' && rating >= 1 && rating <= 5;
    });
    const deptAvgRating = rated.length > 0
      ? (rated.reduce((acc, curr) => acc + (curr.rating || 0), 0) / rated.length).toFixed(1)
      : 'N/A';
    return { name: dept.name, color: dept.color, count, closed, rated: rated.length, avgRating: deptAvgRating };
  });

  const generalChats = chats.filter(c => !c.departmentId).length;
  
  // Distribuição de avaliações (1-5 estrelas)
  const ratingDistribution = [1, 2, 3, 4, 5].map(rating => ({
    rating,
    count: ratedChats.filter(c => c.rating === rating).length
  }));

  const handleExportCSV = () => {
    // Cabeçalho do CSV
    const headers = ['ID', 'Nome Contato', 'Telefone', 'Código Cliente', 'Departamento', 'Status', 'Avaliação', 'Data Última Mensagem', 'Data Finalização', 'Total Mensagens'];
    
    // Linhas de dados
    const rows = chats.map(chat => {
      const deptName = departments.find(d => d.id === chat.departmentId)?.name || 'Sem Departamento';
      const lastMsg = chat.lastMessageTime ? new Date(chat.lastMessageTime).toLocaleString() : '';
      const endedAt = chat.endedAt ? new Date(chat.endedAt).toLocaleString() : '';
      const clientCode = chat.clientCode || '';
      
      return [
        chat.id,
        chat.contactName,
        chat.contactNumber,
        clientCode,
        deptName,
        chat.status === 'closed' ? 'Finalizado' : (chat.status === 'pending' ? 'Pendente' : 'Aberto'),
        chat.rating || '',
        lastMsg,
        endedAt,
        chat.messages.length
      ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','); // Escapa aspas duplas
    });
  
    // Monta o conteúdo com BOM para acentuação correta no Excel
    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    
    // Cria o blob e dispara o download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_atendimentos_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 text-indigo-700 rounded-lg">
            <BarChart size={24} />
            </div>
            <div>
            <h2 className="text-2xl font-bold text-slate-800">Painel de Relatórios</h2>
            <p className="text-slate-500">Métricas de performance, SLA e satisfação do cliente.</p>
            </div>
        </div>

        <button 
            onClick={handleExportCSV}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
        >
            <Download size={18} /> Exportar CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium">Total de Atendimentos</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-1">{totalChats}</h3>
            </div>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <MessageSquare size={20} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">{activeChats} Ativos</span>
            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">{closedChats} Finalizados</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium">Nota Média (CSAT)</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-1">{averageRating}</h3>
            </div>
            <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg">
              <ThumbsUp size={20} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Baseado em {ratedChats.length} avaliações</p>
          <div className="flex gap-1 mt-2">
             {[1,2,3,4,5].map(star => (
                <div key={star} className={`h-1 flex-1 rounded-full ${Number(averageRating) >= star ? 'bg-yellow-400' : 'bg-slate-200'}`} />
             ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium">Tempo Médio (TMA)</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-1">{averageHandleTime}</h3>
            </div>
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <Clock size={20} />
            </div>
          </div>
          <p className="text-xs text-emerald-600 flex items-center gap-1">
             <TrendingUp size={12} /> -12% vs mês anterior
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-500 text-sm font-medium">Tempo Resposta</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-1">{averageResponseTime}</h3>
            </div>
            <div className="p-2 bg-orange-50 text-orange-600 rounded-lg">
              <Clock size={20} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Primeira resposta</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Breakdown */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Users size={18} className="text-slate-500" />
              Volume por Departamento
           </h3>
           
           <div className="space-y-6">
              {chatsByDepartment.map((dept) => (
                 <div key={dept.name}>
                    <div className="flex justify-between text-sm mb-1">
                       <span className="font-medium text-slate-700">{dept.name}</span>
                       <div className="flex items-center gap-2">
                         <span className="text-slate-500">{dept.count} atendimentos</span>
                         {dept.rated > 0 && (
                           <span className="text-xs text-yellow-600 font-medium">
                             ⭐ {dept.avgRating} ({dept.rated})
                           </span>
                         )}
                       </div>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                       <div className={`h-2.5 rounded-full ${dept.color}`} style={{ width: `${(dept.count / totalChats) * 100}%` }}></div>
                    </div>
                    <div className="flex justify-between mt-1">
                       <span className="text-[10px] text-slate-400">{dept.closed} Finalizados</span>
                       {dept.rated > 0 && (
                         <span className="text-[10px] text-yellow-600">{dept.rated} avaliados</span>
                       )}
                    </div>
                 </div>
              ))}
              
              {/* General/Unassigned */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-700">Triagem / Sem Setor</span>
                    <span className="text-slate-500">{generalChats} atendimentos</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className="h-2.5 rounded-full bg-slate-400" style={{ width: `${(generalChats / totalChats) * 100}%` }}></div>
                </div>
              </div>

           </div>
        </div>

        {/* Recent Ratings / Distribution */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
              <CheckCircle size={18} className="text-slate-500" />
              Últimas Avaliações
            </h3>
            <div className="space-y-4">
              {ratedChats
                .sort((a, b) => {
                  // Ordena por data de finalização (mais recente primeiro)
                  const dateA = a.endedAt ? new Date(a.endedAt).getTime() : 0;
                  const dateB = b.endedAt ? new Date(b.endedAt).getTime() : 0;
                  return dateB - dateA;
                })
                .slice(0, 5)
                .map(chat => (
                 <div key={chat.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex justify-between items-center mb-1">
                       <span className="font-bold text-xs text-slate-700">{chat.contactName}</span>
                       <div className="flex text-yellow-400 gap-0.5">
                          {[...Array(Math.min(5, Math.max(1, chat.rating || 0)))].map((_, i) => (
                            <ThumbsUp key={i} size={10} fill="currentColor" />
                          ))}
                       </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      {chat.endedAt 
                        ? `Finalizado em ${new Date(chat.endedAt).toLocaleDateString('pt-BR')}`
                        : 'Atendido por: ' + (chat.assignedTo || 'Sistema')
                      }
                    </p>
                 </div>
              ))}
              {ratedChats.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">Nenhuma avaliação recente.</p>
              )}
            </div>
          </div>

          {/* Rating Distribution */}
          {ratedChats.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                <ThumbsUp size={18} className="text-slate-500" />
                Distribuição de Avaliações
              </h3>
              <div className="space-y-3">
                {ratingDistribution.map(({ rating, count }) => {
                  const percentage = ratedChats.length > 0 ? (count / ratedChats.length) * 100 : 0;
                  return (
                    <div key={rating}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">{rating} estrela{rating > 1 ? 's' : ''}</span>
                          <div className="flex text-yellow-400">
                            {[...Array(rating)].map((_, i) => (
                              <ThumbsUp key={i} size={12} fill="currentColor" />
                            ))}
                          </div>
                        </div>
                        <span className="text-sm text-slate-600 font-medium">{count} ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div 
                          className="h-2 rounded-full bg-yellow-400 transition-all" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportsDashboard;
