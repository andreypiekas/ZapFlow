import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Flag, Building2, RefreshCw, AlertCircle, X, Download } from 'lucide-react';
import { getUpcomingHolidays, getNationalHolidays, Holiday, BRAZILIAN_STATES } from '../services/holidaysService';
import { loadConfig as loadConfigFromBackend, getUpcomingNationalHolidays, syncNationalHolidays, validateNationalHolidays } from '../services/apiService';

const Holidays: React.FC = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [days, setDays] = useState<number>(15);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [nationalHolidays, setNationalHolidays] = useState<Holiday[]>([]);
  const [isLoadingNational, setIsLoadingNational] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // Carrega a API key do Gemini ao montar o componente
  useEffect(() => {
    const loadGeminiApiKey = async () => {
      try {
        const configData = await loadConfigFromBackend();
        if (configData?.geminiApiKey) {
          setGeminiApiKey(configData.geminiApiKey);
        }
      } catch (err) {
        console.warn('[Holidays] Erro ao carregar API key do Gemini:', err);
      }
    };
    loadGeminiApiKey();
  }, []);

  // Carrega feriados nacionais dos próximos 15 dias do banco de dados
  const loadNationalHolidays = async (forceUpdate: boolean = false) => {
    try {
      setIsLoadingNational(true);
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 15);

      // Se for atualização forçada, sincroniza da BrasilAPI primeiro
      if (forceUpdate) {
        const currentYear = today.getFullYear();
        const nextYear = endDate.getFullYear();
        
        console.log('[Holidays] 🔄 Forçando sincronização de feriados nacionais...');
        await syncNationalHolidays(currentYear);
        if (nextYear > currentYear) {
          await syncNationalHolidays(nextYear);
        }
        
        // Valida duplicações após sincronizar
        await validateNationalHolidays();
      }

      // Busca do banco de dados
      const next15Days = await getUpcomingNationalHolidays(15);
      
      setNationalHolidays(next15Days);
      setLastUpdate(today.toLocaleString('pt-BR'));
      console.log('[Holidays] ✅ Feriados nacionais carregados do banco:', next15Days.length);
    } catch (err: any) {
      console.error('[Holidays] Erro ao carregar feriados nacionais:', err);
      // Em caso de erro, tenta buscar usando a função antiga como fallback
      try {
        const today = new Date();
        const currentYear = today.getFullYear();
        const nextYear = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000).getFullYear();
        
        const allNationalHolidays = [
          ...await getNationalHolidays(currentYear),
          ...(nextYear > currentYear ? await getNationalHolidays(nextYear) : [])
        ];

        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 15);
        const next15Days = allNationalHolidays.filter(h => {
          const holidayDate = new Date(h.date);
          return holidayDate >= today && holidayDate <= endDate;
        }).sort((a, b) => a.date.localeCompare(b.date));

        setNationalHolidays(next15Days);
        setLastUpdate(today.toLocaleString('pt-BR'));
      } catch (fallbackErr) {
        console.error('[Holidays] Erro no fallback:', fallbackErr);
      }
    } finally {
      setIsLoadingNational(false);
    }
  };

  // Carrega feriados nacionais ao montar
  useEffect(() => {
    loadNationalHolidays();
    
    // Sincroniza automaticamente uma vez por dia (verifica a cada hora)
    const interval = setInterval(() => {
      const today = new Date();
      const lastSyncKey = 'nationalHolidaysLastSync';
      const lastSyncStr = localStorage.getItem(lastSyncKey);
      
      if (!lastSyncStr) {
        // Primeira vez, sincroniza
        console.log('[Holidays] 🔄 Primeira sincronização de feriados nacionais');
        loadNationalHolidays(true);
        localStorage.setItem(lastSyncKey, today.toISOString());
      } else {
        const lastSync = new Date(lastSyncStr);
        const hoursSinceSync = (today.getTime() - lastSync.getTime()) / (1000 * 60 * 60);
        if (hoursSinceSync >= 24) {
          console.log('[Holidays] 🔄 Atualização automática de feriados nacionais (passou 24h)');
          loadNationalHolidays(true);
          localStorage.setItem(lastSyncKey, today.toISOString());
        }
      }
    }, 60 * 60 * 1000); // Verifica a cada 1 hora

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadHolidays();
  }, [selectedStates, days, geminiApiKey]);

  const loadHolidays = async () => {
    setIsLoading(true);
    setError(null);
    setProgressMessage('');
    
    try {
      // Para feriados municipais, sempre usa 15 dias (cache atualiza a cada 10 dias)
      const daysToSearch = selectedStates.length > 0 ? 15 : days;
      
      const upcomingHolidays = await getUpcomingHolidays(
        daysToSearch, 
        selectedStates.length > 0 ? selectedStates : undefined,
        (message) => setProgressMessage(message),
        geminiApiKey || undefined
      );
      setHolidays(upcomingHolidays);
      setProgressMessage('');
    } catch (err: any) {
      console.error('[Holidays] Erro ao carregar feriados:', err);
      setError(err.message || 'Erro ao carregar feriados');
      setProgressMessage('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStateToggle = (stateCode: string) => {
    setSelectedStates(prev => {
      if (prev.includes(stateCode)) {
        return prev.filter(code => code !== stateCode);
      } else {
        // Limita a 3 estados
        if (prev.length >= 3) {
          return prev;
        }
        return [...prev, stateCode];
      }
    });
  };

  const removeState = (stateCode: string) => {
    setSelectedStates(prev => prev.filter(code => code !== stateCode));
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const getDaysUntil = (dateString: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const holidayDate = new Date(dateString);
    holidayDate.setHours(0, 0, 0, 0);
    const diffTime = holidayDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getHolidayTypeColor = (type: string): string => {
    switch (type) {
      case 'national':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'municipal':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'state':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getHolidayTypeIcon = (type: string) => {
    switch (type) {
      case 'national':
        return <Flag size={16} />;
      case 'municipal':
        return <Building2 size={16} />;
      case 'state':
        return <MapPin size={16} />;
      default:
        return <Calendar size={16} />;
    }
  };

  const getHolidayTypeLabel = (type: string): string => {
    switch (type) {
      case 'national':
        return 'Nacional';
      case 'municipal':
        return 'Municipal';
      case 'state':
        return 'Estadual';
      default:
        return 'Outro';
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Tabela de Feriados Nacionais - 15 dias */}
      <div className="bg-[#16191F] rounded-xl shadow-lg neon-border overflow-hidden">
        <div className="p-6 border-b border-[#0D0F13] bg-[#0D0F13] circuit-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-[#0074FF]/30 to-[#0074FF]/10 text-[#0074FF] rounded-xl border border-[#0074FF]/20">
                <Flag size={24} strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-2xl font-futuristic text-slate-200">Feriados Nacionais</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Próximos 15 dias • Atualização automática diária
                  {lastUpdate && (
                    <span className="ml-2 text-xs text-slate-500">
                      (Última atualização: {lastUpdate})
                    </span>
                  )}
                </p>
              </div>
            </div>
            <button
              onClick={() => loadNationalHolidays(true)}
              disabled={isLoadingNational}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] hover:from-[#00B0E6] hover:to-[#00C8B8] text-[#0D0F13] rounded-lg transition-all shadow-lg glow-gradient font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title="Forçar atualização"
            >
              <RefreshCw size={18} strokeWidth={2.5} className={isLoadingNational ? 'animate-spin' : ''} />
              <span className="text-sm font-medium">Forçar Atualização</span>
            </button>
          </div>
        </div>

        <div className="p-6">
          {isLoadingNational ? (
            <div className="flex flex-col items-center justify-center py-8">
              <RefreshCw size={24} className="animate-spin text-[#00E0D1]" strokeWidth={2} />
              <span className="mt-2 text-slate-400 text-sm">Carregando feriados nacionais...</span>
            </div>
          ) : nationalHolidays.length === 0 ? (
            <div className="text-center py-8">
              <Flag size={48} className="mx-auto text-slate-500 mb-4" strokeWidth={1.5} />
              <p className="text-slate-400">Nenhum feriado nacional nos próximos 15 dias</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#0D0F13] border-b border-[#111316]">
                    <th className="px-4 py-3 text-left text-sm font-futuristic text-slate-400 uppercase tracking-wider">Data</th>
                    <th className="px-4 py-3 text-left text-sm font-futuristic text-slate-400 uppercase tracking-wider">Dia da Semana</th>
                    <th className="px-4 py-3 text-left text-sm font-futuristic text-slate-400 uppercase tracking-wider">Feriado</th>
                    <th className="px-4 py-3 text-left text-sm font-futuristic text-slate-400 uppercase tracking-wider">Dias Restantes</th>
                  </tr>
                </thead>
                <tbody>
                  {nationalHolidays.map((holiday, index) => {
                    const holidayDate = new Date(holiday.date);
                    const daysUntil = getDaysUntil(holiday.date);
                    const isToday = daysUntil === 0;
                    const isTomorrow = daysUntil === 1;
                    const dayOfWeek = holidayDate.toLocaleDateString('pt-BR', { weekday: 'long' });
                    const formattedDate = holidayDate.toLocaleDateString('pt-BR', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric' 
                    });

                    return (
                      <tr
                        key={`national-${holiday.date}-${index}`}
                        className={`border-b border-[#0D0F13] hover:bg-[#111316] transition-colors ${
                          isToday ? 'bg-[#00E0D1]/10 border-[#00E0D1]/30' : isTomorrow ? 'bg-[#0074FF]/10 border-[#0074FF]/30' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-slate-200">
                          {formattedDate}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300 capitalize">
                          {dayOfWeek}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-200">
                          {holiday.name}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {isToday ? (
                            <span className="px-2 py-1 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] rounded-full text-xs font-semibold">
                              Hoje
                            </span>
                          ) : isTomorrow ? (
                            <span className="px-2 py-1 bg-[#0074FF] text-white rounded-full text-xs font-semibold">
                              Amanhã
                            </span>
                          ) : (
                            <span className="text-slate-300">
                              {daysUntil} {daysUntil === 1 ? 'dia' : 'dias'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Feriados Gerais (Municipais e Estaduais) */}
      <div className="bg-[#16191F] rounded-xl shadow-lg neon-border overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-[#0D0F13] bg-[#0D0F13] circuit-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-[#00C3FF]/30 to-[#00E0D1]/10 text-[#00E0D1] rounded-xl border border-[#00E0D1]/20">
                <Calendar size={24} strokeWidth={2} />
              </div>
              <div>
                <h2 className="text-2xl font-futuristic text-slate-200">Feriados</h2>
                <p className="text-slate-400 text-sm mt-1">
                  Próximos {days} dias de feriados nacionais e municipais
                </p>
              </div>
            </div>
            <button
              onClick={loadHolidays}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-[#00E0D1] hover:bg-[#111316] rounded-lg transition-colors disabled:opacity-50 border border-[#0D0F13] hover:border-[#00E0D1]/30"
              title="Atualizar"
            >
              <RefreshCw size={20} strokeWidth={2} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="p-6 border-b border-[#0D0F13] bg-[#0D0F13]">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-3">
                Selecionar Estados (Máximo 3)
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-64 overflow-y-auto p-2 border border-[#0D0F13] rounded-lg bg-[#111316]">
                {BRAZILIAN_STATES.map(state => {
                  const isSelected = selectedStates.includes(state.code);
                  const isDisabled = !isSelected && selectedStates.length >= 3;
                  
                  return (
                    <label
                      key={state.code}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#0074FF]/20 text-[#0074FF] border-2 border-[#0074FF]/50'
                          : isDisabled
                          ? 'bg-[#0D0F13] text-slate-500 cursor-not-allowed border border-[#111316]'
                          : 'bg-[#16191F] text-slate-300 hover:bg-[#111316] border border-[#0D0F13] hover:border-[#00E0D1]/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleStateToggle(state.code)}
                        disabled={isDisabled}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
                      />
                      <span className="text-sm font-medium">{state.code}</span>
                      <span className="text-xs text-slate-500 truncate">{state.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Selecione até 3 estados para buscar todos os feriados municipais. Deixe vazio para ver apenas feriados nacionais.
              </p>
              
              {/* Estados selecionados */}
              {selectedStates.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedStates.map(stateCode => {
                    const state = BRAZILIAN_STATES.find(s => s.code === stateCode);
                    return (
                      <div
                        key={stateCode}
                        className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                      >
                        <span>{state?.name || stateCode}</span>
                        <button
                          onClick={() => removeState(stateCode)}
                          className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                          title="Remover"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Próximos N dias
              </label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 15)))}
                min={1}
                max={365}
                className="w-full px-4 py-2 border border-[#0D0F13] bg-[#111316] text-slate-200 rounded-lg focus:ring-2 focus:ring-[#00E0D1] focus:border-[#00E0D1] outline-none placeholder:text-slate-500"
              />
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw size={32} className="animate-spin text-[#00E0D1]" strokeWidth={2} />
              <span className="mt-3 text-slate-400">
                {progressMessage || 'Carregando feriados...'}
              </span>
              {selectedStates.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Isso pode levar alguns minutos ao buscar feriados de múltiplos estados...
                </p>
              )}
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3 neon-border">
              <AlertCircle className="text-red-400 mt-0.5 flex-shrink-0" size={20} strokeWidth={2} />
              <div>
                <h3 className="font-semibold text-red-400">Erro ao carregar feriados</h3>
                <p className="text-red-300 text-sm mt-1">{error}</p>
              </div>
            </div>
          ) : holidays.length === 0 ? (
            <div className="text-center py-12">
              <Calendar size={48} className="mx-auto text-slate-500 mb-4" strokeWidth={1.5} />
              <p className="text-slate-400 text-lg">Nenhum feriado encontrado nos próximos {days} dias</p>
            </div>
          ) : (
            <div className="space-y-4">
              {holidays.map((holiday, index) => {
                const daysUntil = getDaysUntil(holiday.date);
                const isToday = daysUntil === 0;
                const isTomorrow = daysUntil === 1;

                return (
                  <div
                    key={`${holiday.date}-${holiday.name}-${index}`}
                    className={`border rounded-xl p-4 transition-all hover:border-[#00E0D1]/50 ${
                      isToday
                        ? 'bg-[#00E0D1]/10 border-[#00E0D1]/30 neon-border'
                        : isTomorrow
                        ? 'bg-[#0074FF]/10 border-[#0074FF]/30'
                        : 'bg-[#111316] border-[#0D0F13] hover:bg-[#16191F]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${getHolidayTypeColor(holiday.type)}`}>
                            {getHolidayTypeIcon(holiday.type)}
                            <span>{getHolidayTypeLabel(holiday.type)}</span>
                          </div>
                          {isToday && (
                            <span className="px-3 py-1 bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] text-[#0D0F13] rounded-full text-xs font-semibold">
                              Hoje
                            </span>
                          )}
                          {isTomorrow && (
                            <span className="px-3 py-1 bg-[#0074FF] text-white rounded-full text-xs font-semibold">
                              Amanhã
                            </span>
                          )}
                          {!isToday && !isTomorrow && daysUntil > 0 && (
                            <span className="px-3 py-1 bg-slate-500/20 text-slate-300 rounded-full text-xs font-semibold border border-slate-500/30">
                              Em {daysUntil} {daysUntil === 1 ? 'dia' : 'dias'}
                            </span>
                          )}
                        </div>
                        <h3 className={`text-lg font-futuristic mb-1 ${isToday ? 'text-[#00E0D1]' : 'text-slate-200'}`}>
                          {holiday.name}
                        </h3>
                        <p className="text-slate-400 text-sm">
                          {formatDate(holiday.date)}
                        </p>
                        {(holiday.city || holiday.state) && (
                          <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                            <MapPin size={12} strokeWidth={2} />
                            {holiday.city && holiday.state
                              ? `${holiday.city}, ${holiday.state}`
                              : holiday.city || holiday.state}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Estatísticas */}
        {holidays.length > 0 && (
          <div className="p-6 border-t border-[#0D0F13] bg-[#0D0F13]">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-[#16191F] rounded-xl p-4 border border-[#111316] neon-border">
                <p className="text-slate-400 text-sm">Total</p>
                <p className="text-2xl font-tech bg-gradient-to-r from-[#00C3FF] to-[#00E0D1] bg-clip-text text-transparent">{holidays.length}</p>
              </div>
              <div className="bg-[#16191F] rounded-xl p-4 border border-[#111316] neon-border">
                <p className="text-slate-400 text-sm">Nacionais</p>
                <p className="text-2xl font-tech text-[#0074FF]">
                  {holidays.filter(h => h.type === 'national').length}
                </p>
              </div>
              <div className="bg-[#16191F] rounded-xl p-4 border border-[#111316] neon-border">
                <p className="text-slate-400 text-sm">Municipais</p>
                <p className="text-2xl font-tech text-[#00E0D1]">
                  {holidays.filter(h => h.type === 'municipal').length}
                </p>
              </div>
              <div className="bg-[#16191F] rounded-xl p-4 border border-[#111316] neon-border">
                <p className="text-slate-400 text-sm">Estaduais</p>
                <p className="text-2xl font-tech text-purple-400">
                  {holidays.filter(h => h.type === 'state').length}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Holidays;

