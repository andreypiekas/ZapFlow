import React, { useState, useEffect } from 'react';
import { Calendar, MapPin, Flag, Building2, RefreshCw, AlertCircle } from 'lucide-react';
import { getUpcomingHolidays, Holiday } from '../services/holidaysService';

const Holidays: React.FC = () => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cityCode, setCityCode] = useState<string>('');
  const [days, setDays] = useState<number>(15);

  useEffect(() => {
    loadHolidays();
  }, [cityCode, days]);

  const loadHolidays = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const upcomingHolidays = await getUpcomingHolidays(days, cityCode || undefined);
      setHolidays(upcomingHolidays);
    } catch (err: any) {
      console.error('[Holidays] Erro ao carregar feriados:', err);
      setError(err.message || 'Erro ao carregar feriados');
    } finally {
      setIsLoading(false);
    }
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
    <div className="p-6 max-w-6xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600 text-white rounded-lg">
                <Calendar size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Feriados</h2>
                <p className="text-slate-600 text-sm mt-1">
                  Próximos {days} dias de feriados nacionais e municipais
                </p>
              </div>
            </div>
            <button
              onClick={loadHolidays}
              disabled={isLoading}
              className="p-2 text-slate-600 hover:text-slate-800 hover:bg-white rounded-md transition-colors disabled:opacity-50"
              title="Atualizar"
            >
              <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Código IBGE da Cidade (Opcional)
              </label>
              <input
                type="text"
                value={cityCode}
                onChange={(e) => setCityCode(e.target.value)}
                placeholder="Ex: 3550308 (São Paulo)"
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-slate-500 mt-1">
                Deixe vazio para ver apenas feriados nacionais. Adicione o código IBGE para incluir feriados municipais.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Próximos N dias
              </label>
              <input
                type="number"
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(365, parseInt(e.target.value) || 15)))}
                min={1}
                max={365}
                className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Conteúdo */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={32} className="animate-spin text-blue-600" />
              <span className="ml-3 text-slate-600">Carregando feriados...</span>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="text-red-600 mt-0.5 flex-shrink-0" size={20} />
              <div>
                <h3 className="font-semibold text-red-800">Erro ao carregar feriados</h3>
                <p className="text-red-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          ) : holidays.length === 0 ? (
            <div className="text-center py-12">
              <Calendar size={48} className="mx-auto text-slate-400 mb-4" />
              <p className="text-slate-600 text-lg">Nenhum feriado encontrado nos próximos {days} dias</p>
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
                    className={`border rounded-lg p-4 transition-all ${
                      isToday
                        ? 'bg-emerald-50 border-emerald-300 shadow-md'
                        : isTomorrow
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-white border-slate-200 hover:shadow-md'
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
                            <span className="px-3 py-1 bg-emerald-600 text-white rounded-full text-xs font-semibold">
                              Hoje
                            </span>
                          )}
                          {isTomorrow && (
                            <span className="px-3 py-1 bg-blue-600 text-white rounded-full text-xs font-semibold">
                              Amanhã
                            </span>
                          )}
                          {!isToday && !isTomorrow && daysUntil > 0 && (
                            <span className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-semibold">
                              Em {daysUntil} {daysUntil === 1 ? 'dia' : 'dias'}
                            </span>
                          )}
                        </div>
                        <h3 className={`text-lg font-bold mb-1 ${isToday ? 'text-emerald-900' : 'text-slate-800'}`}>
                          {holiday.name}
                        </h3>
                        <p className="text-slate-600 text-sm">
                          {formatDate(holiday.date)}
                        </p>
                        {(holiday.city || holiday.state) && (
                          <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                            <MapPin size={12} />
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
          <div className="p-6 border-t border-slate-200 bg-slate-50">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <p className="text-slate-500 text-sm">Total</p>
                <p className="text-2xl font-bold text-slate-800">{holidays.length}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <p className="text-slate-500 text-sm">Nacionais</p>
                <p className="text-2xl font-bold text-blue-600">
                  {holidays.filter(h => h.type === 'national').length}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <p className="text-slate-500 text-sm">Municipais</p>
                <p className="text-2xl font-bold text-green-600">
                  {holidays.filter(h => h.type === 'municipal').length}
                </p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-slate-200">
                <p className="text-slate-500 text-sm">Estaduais</p>
                <p className="text-2xl font-bold text-purple-600">
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

