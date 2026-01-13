
import React from 'react';
import { Chat, Department } from '../types';
import { BarChart, Clock, ThumbsUp, MessageSquare, CheckCircle, Users, Download } from 'lucide-react';

interface ReportsDashboardProps {
  chats: Chat[];
  departments: Department[];
}

const ReportsDashboard: React.FC<ReportsDashboardProps> = ({ chats, departments }) => {

  // Para relatórios: quando um atendimento é finalizado, `departmentId` pode ser limpo (fluxo normal).
  // Nesse caso, usamos `closedDepartmentId` (capturado no fechamento) para manter a atribuição correta.
  const getReportDepartmentId = (chat: Chat): string | null => {
    const anyChat: any = chat as any;
    return (chat.status === 'closed')
      ? (anyChat.closedDepartmentId ?? chat.departmentId ?? null)
      : (chat.departmentId ?? null);
  };

  const toMs = (value: any): number => {
    if (!value) return 0;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  };

  const formatDuration = (ms: number): string => {
    if (!Number.isFinite(ms) || ms <= 0) return 'N/A';
    const totalSeconds = Math.round(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const getNumericRating = (chat: Chat): number | null => {
    const raw: any = (chat as any).rating;
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw || ''), 10);
    if (!Number.isFinite(n) || n < 1 || n > 5) return null;
    return n;
  };

  const getChatStartMs = (chat: Chat): number => {
    const msgs: any[] = Array.isArray((chat as any).messages) ? (chat as any).messages : [];
    const userTimes = msgs
      .filter(m => m && m.sender === 'user')
      .map(m => toMs(m.timestamp))
      .filter(ms => ms > 0);
    if (userTimes.length > 0) return Math.min(...userTimes);

    const nonSystemTimes = msgs
      .filter(m => m && m.sender !== 'system')
      .map(m => toMs(m.timestamp))
      .filter(ms => ms > 0);
    if (nonSystemTimes.length > 0) return Math.min(...nonSystemTimes);

    return toMs((chat as any).lastMessageTime);
  };

  const getFirstResponseMs = (chat: Chat): number => {
    const msgs: any[] = Array.isArray((chat as any).messages) ? (chat as any).messages : [];
    const firstUserMs = getChatStartMs(chat);
    if (!firstUserMs) return 0;

    const agentTimes = msgs
      .filter(m => m && m.sender === 'agent')
      .map(m => toMs(m.timestamp))
      .filter(ms => ms > firstUserMs);

    if (agentTimes.length === 0) return 0;
    const firstAgentMs = Math.min(...agentTimes);
    const diff = firstAgentMs - firstUserMs;
    return diff > 0 ? diff : 0;
  };
  
  // Métricas Principais
  const totalChats = chats.length;
  const activeChats = chats.filter(c => c.status !== 'closed').length;
  const closedChats = chats.filter(c => c.status === 'closed').length;
  
  // Filtra avaliações válidas (rating deve ser um número entre 1 e 5)
  const ratedChats = chats
    .map(c => ({ chat: c, rating: getNumericRating(c) }))
    .filter(x => x.rating != null)
    .map(x => ({ ...x.chat, rating: x.rating as number }));
  
  const averageRating = ratedChats.length > 0 
    ? (ratedChats.reduce((acc, curr) => acc + (curr.rating || 0), 0) / ratedChats.length).toFixed(1)
    : 'N/A';

  // Tempo Médio de Atendimento (TMA): endedAt - 1ª mensagem do usuário (ou 1ª não-system)
  const handleTimesMs = chats
    .filter(c => c.status === 'closed')
    .map(c => {
      const endMs = toMs((c as any).endedAt) || toMs((c as any).lastMessageTime);
      const startMs = getChatStartMs(c);
      const diff = endMs && startMs ? (endMs - startMs) : 0;
      return diff > 0 ? diff : 0;
    })
    .filter(ms => ms > 0);

  const averageHandleTime = handleTimesMs.length > 0
    ? formatDuration(handleTimesMs.reduce((a, b) => a + b, 0) / handleTimesMs.length)
    : 'N/A';

  // Tempo de Primeira Resposta: 1ª msg do agente - 1ª msg do usuário
  const responseTimesMs = chats
    .map(c => getFirstResponseMs(c))
    .filter(ms => ms > 0);

  const averageResponseTime = responseTimesMs.length > 0
    ? formatDuration(responseTimesMs.reduce((a, b) => a + b, 0) / responseTimesMs.length)
    : 'N/A';

  // Agrupamentos
  const chatsByDepartment = departments.map(dept => {
    const count = chats.filter(c => getReportDepartmentId(c) === dept.id).length;
    const closed = chats.filter(c => getReportDepartmentId(c) === dept.id && c.status === 'closed').length;
    const rated = chats.filter(c => {
      const rating = getNumericRating(c);
      return getReportDepartmentId(c) === dept.id && rating !== null;
    });
    const deptAvgRating = rated.length > 0
      ? (rated.reduce((acc, curr) => acc + (getNumericRating(curr) || 0), 0) / rated.length).toFixed(1)
      : 'N/A';
    return { name: dept.name, color: dept.color, count, closed, rated: rated.length, avgRating: deptAvgRating };
  });

  const generalChats = chats.filter(c => !getReportDepartmentId(c)).length;
  
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
      const deptId = getReportDepartmentId(chat);
      const deptName = departments.find(d => d.id === deptId)?.name || 'Sem Departamento';
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
            <div className="p-3 bg-gradient-to-br from-[#0074FF]/30 to-[#0074FF]/10 text-[#0074FF] rounded-xl border border-[#0074FF]/20">
            <BarChart size={24} strokeWidth={2} />
            </div>
            <div>
            <h2 className="text-2xl font-futuristic text-slate-200">Painel de Relatórios</h2>
            <p className="text-slate-400 mt-1">Métricas de performance, SLA e satisfação do cliente.</p>
            </div>
        </div>

        <button 
            onClick={handleExportCSV}
            className="bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all shadow-lg glow-gradient"
        >
            <Download size={18} strokeWidth={2.5} /> Exportar CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-[#16191F] p-6 rounded-xl shadow-lg neon-border hover-glow transition-all hover:border-[#00E0D1]/50 group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Total de Atendimentos</p>
              <h3 className="text-3xl font-tech bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] bg-clip-text text-transparent">{totalChats}</h3>
            </div>
            <div className="p-2 bg-gradient-to-br from-[#0074FF]/30 to-[#0074FF]/10 text-[#0074FF] rounded-xl border border-[#0074FF]/20 group-hover:glow-blue transition-all">
              <MessageSquare size={20} strokeWidth={2} />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 bg-[#00E0D1]/20 text-[#00E0D1] rounded-full font-medium border border-[#00E0D1]/30">{activeChats} Ativos</span>
            <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded-full font-medium border border-slate-500/30">{closedChats} Finalizados</span>
          </div>
        </div>

        <div className="bg-[#16191F] p-6 rounded-xl shadow-lg neon-border hover-glow transition-all hover:border-[#00E0D1]/50 group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Nota Média (CSAT)</p>
              <h3 className="text-3xl font-tech bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] bg-clip-text text-transparent">{averageRating}</h3>
            </div>
            <div className="p-2 bg-gradient-to-br from-yellow-500/30 to-yellow-500/10 text-yellow-400 rounded-xl border border-yellow-500/20 group-hover:glow-blue transition-all">
              <ThumbsUp size={20} strokeWidth={2} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Baseado em {ratedChats.length} avaliações</p>
          <div className="flex gap-1 mt-2">
             {[1,2,3,4,5].map(star => (
                <div key={star} className={`h-1 flex-1 rounded-full ${Number(averageRating) >= star ? 'bg-yellow-400' : 'bg-slate-500/30'}`} />
             ))}
          </div>
        </div>

        <div className="bg-[#16191F] p-6 rounded-xl shadow-lg neon-border hover-glow transition-all hover:border-[#00E0D1]/50 group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Tempo Médio (TMA)</p>
              <h3 className="text-3xl font-tech bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] bg-clip-text text-transparent">{averageHandleTime}</h3>
            </div>
            <div className="p-2 bg-gradient-to-br from-purple-500/30 to-purple-500/10 text-purple-400 rounded-xl border border-purple-500/20 group-hover:glow-blue transition-all">
              <Clock size={20} strokeWidth={2} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Baseado em {handleTimesMs.length} atendimentos fechados</p>
        </div>

        <div className="bg-[#16191F] p-6 rounded-xl shadow-lg neon-border hover-glow transition-all hover:border-[#00E0D1]/50 group">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Tempo Resposta</p>
              <h3 className="text-3xl font-tech bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] bg-clip-text text-transparent">{averageResponseTime}</h3>
            </div>
            <div className="p-2 bg-gradient-to-br from-orange-500/30 to-orange-500/10 text-orange-400 rounded-xl border border-orange-500/20 group-hover:glow-blue transition-all">
              <Clock size={20} strokeWidth={2} />
            </div>
          </div>
          <p className="text-xs text-slate-400">Primeira resposta</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Breakdown */}
        <div className="lg:col-span-2 bg-[#16191F] rounded-xl shadow-lg neon-border p-6">
           <h3 className="font-futuristic text-slate-200 mb-6 flex items-center gap-3 circuit-line pb-4">
              <div className="p-2 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20">
                <Users size={18} strokeWidth={2} />
              </div>
              Volume por Departamento
           </h3>
           
           <div className="space-y-6">
              {chatsByDepartment.map((dept) => (
                 <div key={dept.name}>
                    <div className="flex justify-between text-sm mb-1">
                       <span className="font-medium text-slate-200">{dept.name}</span>
                       <div className="flex items-center gap-2">
                         <span className="text-slate-400">{dept.count} atendimentos</span>
                         {dept.rated > 0 && (
                           <span className="text-xs text-yellow-400 font-medium">
                             ⭐ {dept.avgRating} ({dept.rated})
                           </span>
                         )}
                       </div>
                    </div>
                    <div className="w-full bg-[#0D0F13] rounded-full h-2.5 overflow-hidden">
                       <div className={`h-2.5 rounded-full ${dept.color}`} style={{ width: `${(dept.count / totalChats) * 100}%` }}></div>
                    </div>
                    <div className="flex justify-between mt-1">
                       <span className="text-[10px] text-slate-500">{dept.closed} Finalizados</span>
                       {dept.rated > 0 && (
                         <span className="text-[10px] text-yellow-400">{dept.rated} avaliados</span>
                       )}
                    </div>
                 </div>
              ))}
              
              {/* General/Unassigned */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-slate-200">Triagem / Sem Setor</span>
                    <span className="text-slate-400">{generalChats} atendimentos</span>
                </div>
                <div className="w-full bg-[#0D0F13] rounded-full h-2.5 overflow-hidden">
                    <div className="h-2.5 rounded-full bg-slate-500" style={{ width: `${(generalChats / totalChats) * 100}%` }}></div>
                </div>
              </div>

           </div>
        </div>

        {/* Recent Ratings / Distribution */}
        <div className="space-y-6">
          <div className="bg-[#16191F] rounded-xl shadow-lg neon-border p-6">
            <h3 className="font-futuristic text-slate-200 mb-6 flex items-center gap-3 circuit-line pb-4">
              <div className="p-2 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20">
                <CheckCircle size={18} strokeWidth={2} />
              </div>
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
                 <div key={chat.id} className="p-3 bg-[#0D0F13] rounded-lg border border-[#111316] hover:border-[#00E0D1]/30 transition-all">
                    <div className="flex justify-between items-center mb-1">
                       <span className="font-bold text-xs text-slate-200">{chat.contactName}</span>
                       <div className="flex text-yellow-400 gap-0.5">
                          {[...Array(Math.min(5, Math.max(1, chat.rating || 0)))].map((_, i) => (
                            <ThumbsUp key={i} size={10} fill="currentColor" strokeWidth={2} />
                          ))}
                       </div>
                    </div>
                    <p className="text-xs text-slate-400">
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
            <div className="bg-[#16191F] rounded-xl shadow-lg neon-border p-6">
              <h3 className="font-futuristic text-slate-200 mb-6 flex items-center gap-3 circuit-line pb-4">
                <div className="p-2 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20">
                  <ThumbsUp size={18} strokeWidth={2} />
                </div>
                Distribuição de Avaliações
              </h3>
              <div className="space-y-3">
                {ratingDistribution.map(({ rating, count }) => {
                  const percentage = ratedChats.length > 0 ? (count / ratedChats.length) * 100 : 0;
                  return (
                    <div key={rating}>
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">{rating} estrela{rating > 1 ? 's' : ''}</span>
                          <div className="flex text-yellow-400">
                            {[...Array(rating)].map((_, i) => (
                              <ThumbsUp key={i} size={12} fill="currentColor" strokeWidth={2} />
                            ))}
                          </div>
                        </div>
                        <span className="text-sm text-slate-300 font-medium">{count} ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-[#0D0F13] rounded-full h-2 overflow-hidden">
                        <div 
                          className="h-2 rounded-full bg-yellow-400 transition-all"
                          style={{ width: `${percentage}%` }}
                        ></div>
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
