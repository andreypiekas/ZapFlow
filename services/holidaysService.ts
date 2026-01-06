// Serviço para buscar feriados nacionais e municipais do Brasil
// Feriados nacionais: calculados localmente
// Feriados municipais: buscados APENAS via IA (Gemini) - requer API key configurada
// Cache: feriados municipais são armazenados no banco e atualizados a cada 10 dias

import { searchMunicipalHolidaysWithAI, searchMunicipalHolidaysForStates } from './geminiService';
import { getMunicipalHolidaysCache, saveMunicipalHolidaysCache, saveMunicipalHolidays, getUpcomingMunicipalHolidays, isGeminiQuotaExceeded, getNationalHolidaysFromDB, getUpcomingNationalHolidays, syncNationalHolidays } from './apiService';

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'national' | 'municipal' | 'state';
  city?: string;
  state?: string;
}

// Feriados nacionais fixos do Brasil
const NATIONAL_HOLIDAYS = [
  { date: '01-01', name: 'Confraternização Universal' },
  { date: '04-21', name: 'Tiradentes' },
  { date: '05-01', name: 'Dia do Trabalhador' },
  { date: '09-07', name: 'Independência do Brasil' },
  { date: '10-12', name: 'Nossa Senhora Aparecida' },
  { date: '11-02', name: 'Finados' },
  { date: '11-15', name: 'Proclamação da República' },
  { date: '11-20', name: 'Dia Nacional de Zumbi e da Consciência Negra' },
  { date: '12-25', name: 'Natal' },
];

// Calcula a Páscoa para um ano (algoritmo de Meeus/Jones/Butcher)
function calculateEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// Calcula feriados móveis baseados na Páscoa
function getMovableHolidays(year: number): Holiday[] {
  const easter = calculateEaster(year);
  const holidays: Holiday[] = [];

  // Carnaval (47 dias antes da Páscoa)
  const carnival = new Date(easter);
  carnival.setDate(easter.getDate() - 47);
  holidays.push({
    date: formatDate(carnival),
    name: 'Carnaval',
    type: 'national'
  });

  // Sexta-feira Santa (2 dias antes da Páscoa)
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  holidays.push({
    date: formatDate(goodFriday),
    name: 'Sexta-feira Santa',
    type: 'national'
  });

  // Páscoa
  holidays.push({
    date: formatDate(easter),
    name: 'Páscoa',
    type: 'national'
  });

  // Corpus Christi (60 dias após a Páscoa)
  const corpusChristi = new Date(easter);
  corpusChristi.setDate(easter.getDate() + 60);
  holidays.push({
    date: formatDate(corpusChristi),
    name: 'Corpus Christi',
    type: 'national'
  });

  return holidays;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Busca feriados nacionais para um ano (do banco de dados ou cálculo local como fallback)
export async function getNationalHolidays(year: number): Promise<Holiday[]> {
  try {
    // Tenta buscar do banco de dados primeiro
    const dbHolidays = await getNationalHolidaysFromDB(year);
    
    if (dbHolidays && dbHolidays.length > 0) {
      console.log(`[HolidaysService] ✅ Carregados ${dbHolidays.length} feriados nacionais de ${year} do banco de dados`);
      return dbHolidays.sort((a, b) => a.date.localeCompare(b.date));
    }
    
    // Se não encontrou no banco, tenta sincronizar da BrasilAPI
    console.log(`[HolidaysService] 🔍 Feriados nacionais de ${year} não encontrados no banco. Sincronizando da BrasilAPI...`);
    const syncResult = await syncNationalHolidays(year);
    
    if (syncResult.success && syncResult.saved > 0) {
      // Tenta buscar novamente do banco após sincronizar
      const syncedHolidays = await getNationalHolidaysFromDB(year);
      if (syncedHolidays && syncedHolidays.length > 0) {
        console.log(`[HolidaysService] ✅ Carregados ${syncedHolidays.length} feriados nacionais de ${year} após sincronização`);
        return syncedHolidays.sort((a, b) => a.date.localeCompare(b.date));
      }
    }
    
    // Fallback: cálculo local (caso BrasilAPI não esteja disponível)
    console.warn(`[HolidaysService] ⚠️ Usando cálculo local como fallback para feriados nacionais de ${year}`);
    return getNationalHolidaysLocal(year);
  } catch (error) {
    console.error(`[HolidaysService] ❌ Erro ao buscar feriados nacionais de ${year} do banco:`, error);
    // Fallback: cálculo local
    return getNationalHolidaysLocal(year);
  }
}

// Função auxiliar para cálculo local (fallback)
function getNationalHolidaysLocal(year: number): Holiday[] {
  const holidays: Holiday[] = [];

  // Adiciona feriados fixos
  NATIONAL_HOLIDAYS.forEach(holiday => {
    holidays.push({
      date: `${year}-${holiday.date}`,
      name: holiday.name,
      type: 'national'
    });
  });

  // Adiciona feriados móveis
  const movableHolidays = getMovableHolidays(year);
  holidays.push(...movableHolidays);

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

// Lista de estados brasileiros com códigos IBGE
export const BRAZILIAN_STATES = [
  { code: 'AC', name: 'Acre', ibge: '12' },
  { code: 'AL', name: 'Alagoas', ibge: '27' },
  { code: 'AP', name: 'Amapá', ibge: '16' },
  { code: 'AM', name: 'Amazonas', ibge: '13' },
  { code: 'BA', name: 'Bahia', ibge: '29' },
  { code: 'CE', name: 'Ceará', ibge: '23' },
  { code: 'DF', name: 'Distrito Federal', ibge: '53' },
  { code: 'ES', name: 'Espírito Santo', ibge: '32' },
  { code: 'GO', name: 'Goiás', ibge: '52' },
  { code: 'MA', name: 'Maranhão', ibge: '21' },
  { code: 'MT', name: 'Mato Grosso', ibge: '51' },
  { code: 'MS', name: 'Mato Grosso do Sul', ibge: '50' },
  { code: 'MG', name: 'Minas Gerais', ibge: '31' },
  { code: 'PA', name: 'Pará', ibge: '15' },
  { code: 'PB', name: 'Paraíba', ibge: '24' },
  { code: 'PR', name: 'Paraná', ibge: '41' },
  { code: 'PE', name: 'Pernambuco', ibge: '26' },
  { code: 'PI', name: 'Piauí', ibge: '22' },
  { code: 'RJ', name: 'Rio de Janeiro', ibge: '33' },
  { code: 'RN', name: 'Rio Grande do Norte', ibge: '25' },
  { code: 'RS', name: 'Rio Grande do Sul', ibge: '43' },
  { code: 'RO', name: 'Rondônia', ibge: '11' },
  { code: 'RR', name: 'Roraima', ibge: '14' },
  { code: 'SC', name: 'Santa Catarina', ibge: '42' },
  { code: 'SP', name: 'São Paulo', ibge: '35' },
  { code: 'SE', name: 'Sergipe', ibge: '28' },
  { code: 'TO', name: 'Tocantins', ibge: '17' },
];

// Busca todos os municípios de um estado usando BrasilAPI
async function getCitiesByState(stateCode: string): Promise<Array<{ code: string; name: string }>> {
  try {
    // A API do BrasilAPI retorna municípios por UF (sigla do estado)
    const response = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${stateCode}?providers=dados-abertos-br,gov,wikipedia`);
    
    if (!response.ok) {
      console.warn('[HolidaysService] Erro ao buscar municípios do estado:', response.status);
      return [];
    }

    const data = await response.json();
    
    if (Array.isArray(data)) {
      return data.map((city: any) => ({
        code: city.codigo_ibge || city.code || String(city.id),
        name: city.nome || city.name
      })).filter((city: any) => city.code); // Remove cidades sem código
    }

    return [];
  } catch (error) {
    console.error('[HolidaysService] Erro ao buscar municípios:', error);
    return [];
  }
}

// Busca feriados municipais de uma cidade específica usando APENAS IA
// Verifica cache primeiro (atualizado a cada 10 dias) e busca apenas os próximos 15 dias
async function getMunicipalHolidaysByCity(
  cityCode: string, 
  year: number, 
  cityName?: string, 
  stateName?: string,
  stateCode?: string,
  geminiApiKey?: string
): Promise<Holiday[]> {
  if (!cityName || !stateName) {
    return [];
  }

  // Usa stateCode se fornecido, senão tenta encontrar pelo nome
  const effectiveStateCode = stateCode || BRAZILIAN_STATES.find(s => s.name === stateName)?.code || stateName;

  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 15); // Apenas próximos 15 dias

  // Verifica cache primeiro (usa stateCode para o cache)
  try {
    const cacheData = await getMunicipalHolidaysCache(cityName, effectiveStateCode, year);
    
    if (cacheData && cacheData.fromCache && cacheData.holidays) {
      // Filtra apenas os próximos 15 dias
      const filteredHolidays = cacheData.holidays
        .filter((h: any) => {
          const holidayDate = new Date(h.date);
          return holidayDate >= today && holidayDate <= endDate;
        })
        .map((h: any) => ({
          date: h.date,
          name: h.name,
          type: 'municipal' as const,
          city: h.city || cityName,
          state: h.state || stateName
        }));
      
      console.log(`[HolidaysService] ✅ Usando cache de feriados municipais para ${cityName}/${stateName} (${filteredHolidays.length} feriados nos próximos 15 dias)`);
      return filteredHolidays;
    }
  } catch (error) {
    console.warn(`[HolidaysService] Erro ao verificar cache para ${cityName}/${stateName}:`, error);
  }

  // Se não encontrou no cache ou está expirado, busca via IA
  if (geminiApiKey) {
    // Verifica se a cota foi excedida hoje antes de buscar
    if (await isGeminiQuotaExceeded()) {
      console.warn(`[HolidaysService] ⚠️ Cota do Gemini excedida hoje. Pulando busca para ${cityName}/${stateName}.`);
      return [];
    }
    
    console.log(`[HolidaysService] 🤖 Cache não encontrado/expirado. Buscando feriados municipais via IA para ${cityName}/${stateName}...`);
    
    try {
      const aiHolidays = await searchMunicipalHolidaysWithAI(cityName, stateName, year, geminiApiKey);
      
      // Se retornou vazio e a cota foi excedida, para a busca
      if (aiHolidays.length === 0 && await isGeminiQuotaExceeded()) {
        console.warn(`[HolidaysService] ⚠️ Cota excedida durante a busca. Parando processamento.`);
        return [];
      }
      
      if (aiHolidays.length > 0) {
        // Filtra apenas os próximos 15 dias
        const filteredHolidays = aiHolidays
          .filter(h => {
            const holidayDate = new Date(h.date);
            return holidayDate >= today && holidayDate <= endDate;
          })
          .map(h => ({
            date: h.date,
            name: h.name,
            type: 'municipal' as const,
            city: h.city,
            state: h.state
          }));
        
        // Salva no cache e na tabela permanente
        try {
          // Salva no cache (também salva na tabela permanente automaticamente)
          await saveMunicipalHolidaysCache(cityName, effectiveStateCode, year, aiHolidays);
          
          // Salva também diretamente na tabela permanente (garantir que está salvo)
          const holidaysToSave = aiHolidays.map(h => ({
            date: h.date,
            name: h.name,
            city: h.city || cityName,
            state: h.state || effectiveStateCode,
            year: parseInt(h.date.substring(0, 4)) || year
          }));
          
          await saveMunicipalHolidays(holidaysToSave);
          console.log(`[HolidaysService] 💾 Cache e tabela permanente atualizados para ${cityName}/${effectiveStateCode}`);
        } catch (cacheError) {
          console.warn(`[HolidaysService] Erro ao salvar cache/tabela para ${cityName}/${effectiveStateCode}:`, cacheError);
        }
        
        console.log(`[HolidaysService] ✅ IA encontrou ${filteredHolidays.length} feriados municipais para ${cityName}/${stateName} (próximos 15 dias)`);
        return filteredHolidays;
      } else {
        console.log(`[HolidaysService] ⚠️ IA não encontrou feriados municipais para ${cityName}/${stateName}`);
        // Não salva array vazio no cache (backend não aceita arrays vazios)
      }
    } catch (error) {
      console.warn(`[HolidaysService] Erro ao buscar feriados via IA para ${cityName}/${stateName}:`, error);
    }
  } else {
    console.warn(`[HolidaysService] ⚠️ API Key do Gemini não configurada. Configure em Configurações > Google Gemini API Key para buscar feriados municipais.`);
  }

  return [];
}

// Busca feriados municipais de todos os municípios de um estado
export async function getMunicipalHolidaysByState(
  stateCode: string, 
  year: number,
  onProgress?: (current: number, total: number) => void,
  geminiApiKey?: string
): Promise<Holiday[]> {
  try {
    // Busca todos os municípios do estado
    const cities = await getCitiesByState(stateCode);
    
    if (cities.length === 0) {
      console.warn(`[HolidaysService] Nenhum município encontrado para o estado ${stateCode}`);
      return [];
    }

    // Busca o nome do estado
    const state = BRAZILIAN_STATES.find(s => s.code === stateCode);
    const stateName = state?.name || stateCode;

    // Processa TODAS as cidades do estado
    const citiesToProcess = cities;
    console.log(`[HolidaysService] 🔍 Buscando feriados municipais em ${citiesToProcess.length} cidades de ${stateName}...`);

    // Busca feriados de cada município
    const allHolidays: Holiday[] = [];
    const batchSize = 3; // Processa 3 municípios por vez para não sobrecarregar a IA
    
    for (let i = 0; i < citiesToProcess.length; i += batchSize) {
      // Verifica se a cota foi excedida antes de processar cada batch
      if (await isGeminiQuotaExceeded()) {
        console.warn(`[HolidaysService] ⚠️ Cota do Gemini excedida. Parando busca de municípios de ${stateName}.`);
        break;
      }
      
      const batch = citiesToProcess.slice(i, i + batchSize);
      const batchPromises = batch.map(city => 
        getMunicipalHolidaysByCity(city.code, year, city.name, stateName, stateCode, geminiApiKey)
      );
      const batchResults = await Promise.all(batchPromises);
      
      batchResults.forEach(holidays => {
        allHolidays.push(...holidays);
      });
      
      // Se a cota foi excedida durante o batch, para
      if (await isGeminiQuotaExceeded()) {
        console.warn(`[HolidaysService] ⚠️ Cota excedida durante processamento. Parando busca.`);
        break;
      }
      
      // Callback de progresso
      if (onProgress) {
        onProgress(Math.min(i + batchSize, citiesToProcess.length), citiesToProcess.length);
      }
      
      // Delay entre batches para não sobrecarregar a IA (aumentado para dar tempo à IA processar)
      if (i + batchSize < citiesToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 segundo entre batches
      }
    }
    
    console.log(`[HolidaysService] ✅ Processamento concluído: ${allHolidays.length} feriados municipais encontrados em ${stateName}`);

    // Remove duplicatas (mesmo feriado em múltiplos municípios)
    const uniqueHolidays = allHolidays.filter((h, index, self) =>
      index === self.findIndex(t => t.date === h.date && t.name === h.name && t.city === h.city)
    );

    return uniqueHolidays;
  } catch (error) {
    console.error('[HolidaysService] Erro ao buscar feriados municipais por estado:', error);
    return [];
  }
}

// Busca feriados municipais usando BrasilAPI (mantido para compatibilidade)
export async function getMunicipalHolidays(
  cityCode: string, 
  year: number, 
  cityName?: string, 
  stateName?: string,
  stateCode?: string,
  geminiApiKey?: string
): Promise<Holiday[]> {
  return getMunicipalHolidaysByCity(cityCode, year, cityName, stateName, stateCode, geminiApiKey);
}

// Busca todos os feriados (nacionais + municipais) para os próximos N dias
// IMPORTANTE: Para feriados municipais, sempre busca apenas os próximos 15 dias (independente do parâmetro days)
export async function getUpcomingHolidays(
  days: number = 15, 
  selectedStates?: string[],
  onProgress?: (message: string) => void,
  geminiApiKey?: string
): Promise<Holiday[]> {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + days);
  
  // Para feriados municipais, sempre limita a 15 dias
  const municipalEndDate = new Date(today);
  municipalEndDate.setDate(today.getDate() + 15);

  const holidays: Holiday[] = [];
  const currentYear = today.getFullYear();
  const nextYear = endDate.getFullYear();

  // Busca feriados nacionais do banco de dados
  if (onProgress) onProgress('Buscando feriados nacionais...');
  try {
    // Tenta buscar do banco primeiro (mais eficiente)
    const dbNationalHolidays = await getUpcomingNationalHolidays(days);
    
    if (dbNationalHolidays && dbNationalHolidays.length > 0) {
      holidays.push(...dbNationalHolidays);
      console.log(`[HolidaysService] ✅ Carregados ${dbNationalHolidays.length} feriados nacionais do banco`);
    } else {
      // Se não encontrou no banco, busca do banco por ano ou sincroniza
      const nationalHolidays = [
        ...await getNationalHolidays(currentYear),
        ...(nextYear > currentYear ? await getNationalHolidays(nextYear) : [])
      ];

      // Filtra apenas os feriados dentro do período
      const filteredNational = nationalHolidays.filter(h => {
        const holidayDate = new Date(h.date);
        return holidayDate >= today && holidayDate <= endDate;
      });

      holidays.push(...filteredNational);
    }
  } catch (error) {
    console.error('[HolidaysService] Erro ao buscar feriados nacionais do banco, usando fallback:', error);
    // Fallback: cálculo local
    const nationalHolidays = [
      ...getNationalHolidaysLocal(currentYear),
      ...(nextYear > currentYear ? getNationalHolidaysLocal(nextYear) : [])
    ];

    const filteredNational = nationalHolidays.filter(h => {
      const holidayDate = new Date(h.date);
      return holidayDate >= today && holidayDate <= endDate;
    });

    holidays.push(...filteredNational);
  }

  // Se tiver estados selecionados, busca feriados municipais
  if (selectedStates && selectedStates.length > 0) {
    const allMunicipalHolidays: Holiday[] = [];
    
    // Primeiro, tenta buscar da tabela permanente
    try {
      const todayStr = today.toISOString().split('T')[0];
      const municipalEndDateStr = municipalEndDate.toISOString().split('T')[0];
      
      for (const stateCode of selectedStates) {
        const dbHolidays = await getUpcomingMunicipalHolidays(15, stateCode);
        const formattedDBHolidays: Holiday[] = dbHolidays
          .filter(h => {
            const holidayDate = new Date(h.date);
            return holidayDate >= today && holidayDate <= municipalEndDate;
          })
          .map(h => ({
            date: h.date,
            name: h.name,
            type: 'municipal' as const,
            city: h.city,
            state: h.state
          }));
        
        if (formattedDBHolidays.length > 0) {
          allMunicipalHolidays.push(...formattedDBHolidays);
          console.log(`[HolidaysService] ✅ Carregados ${formattedDBHolidays.length} feriados municipais do banco para ${stateCode}`);
        }
      }
    } catch (dbError) {
      console.warn('[HolidaysService] Erro ao buscar feriados municipais do banco, continuando com busca via IA:', dbError);
    }
    
    // Se não encontrou no banco e tem API key, busca via IA
    if (allMunicipalHolidays.length === 0 && geminiApiKey) {
      // Estados principais (prioridade): SC, PR, RS - busca otimizada de uma vez
      const priorityStates = ['SC', 'PR', 'RS'];
      const priorityStatesToSearch = selectedStates.filter(s => priorityStates.includes(s));
      const otherStates = selectedStates.filter(s => !priorityStates.includes(s));
    
    // Busca otimizada para estados principais usando Google Search
    if (priorityStatesToSearch.length > 0) {
      // Verifica se a cota foi excedida antes de buscar
      if (await isGeminiQuotaExceeded()) {
        console.warn(`[HolidaysService] ⚠️ Cota do Gemini excedida hoje. Pulando busca dos estados principais.`);
      } else {
        if (onProgress) {
          onProgress(`Buscando feriados municipais dos estados principais (${priorityStatesToSearch.join(', ')})...`);
        }
        
        try {
          const priorityHolidays = await searchMunicipalHolidaysForStates(
            priorityStatesToSearch,
            days,
            geminiApiKey
          );
          
          // Se a cota foi excedida durante a busca, para
          if (await isGeminiQuotaExceeded()) {
            console.warn(`[HolidaysService] ⚠️ Cota excedida durante busca dos estados principais. Parando processamento.`);
          } else {
            // Converte para formato Holiday
            const formattedPriorityHolidays: Holiday[] = priorityHolidays.map(h => ({
              date: h.date,
              name: h.name,
              type: 'municipal' as const,
              city: h.city,
              state: h.state
            }));
            
            // Salva no cache e na tabela permanente agrupado por cidade
            try {
              const currentYear = new Date().getFullYear();
              const holidaysByCity = new Map<string, { cityName: string; stateCode: string; holidays: typeof priorityHolidays }>();
              
              // Agrupa feriados por cidade e estado
              for (const holiday of priorityHolidays) {
                const key = `${holiday.city}|${holiday.state}`; // Usa | como separador seguro
                if (!holidaysByCity.has(key)) {
                  holidaysByCity.set(key, {
                    cityName: holiday.city,
                    stateCode: holiday.state,
                    holidays: []
                  });
                }
                holidaysByCity.get(key)!.holidays.push(holiday);
              }
              
              // Salva cada cidade no cache (também salva na tabela permanente)
              for (const cityData of holidaysByCity.values()) {
                if (cityData.cityName && cityData.stateCode && cityData.holidays.length > 0) {
                  // Salva no cache (também salva na tabela permanente automaticamente)
                  await saveMunicipalHolidaysCache(cityData.cityName, cityData.stateCode, currentYear, cityData.holidays);
                  
                  // Salva também diretamente na tabela permanente
                  const holidaysToSave = cityData.holidays.map(h => ({
                    date: h.date,
                    name: h.name,
                    city: h.city || cityData.cityName,
                    state: h.state || cityData.stateCode,
                    year: parseInt(h.date.substring(0, 4)) || currentYear
                  }));
                  
                  await saveMunicipalHolidays(holidaysToSave);
                  console.log(`[HolidaysService] 💾 Cache e tabela permanente salvos para ${cityData.cityName}/${cityData.stateCode} (${cityData.holidays.length} feriados)`);
                }
              }
            } catch (cacheError) {
              console.warn('[HolidaysService] Erro ao salvar cache/tabela dos estados principais:', cacheError);
            }
            
            allMunicipalHolidays.push(...formattedPriorityHolidays);
            console.log(`[HolidaysService] ✅ Encontrados ${formattedPriorityHolidays.length} feriados municipais dos estados principais`);
          }
        } catch (error) {
          // Se a cota foi excedida, não tenta fallback
          if (await isGeminiQuotaExceeded()) {
            console.warn('[HolidaysService] ⚠️ Cota excedida. Parando busca dos estados principais.');
          } else {
            console.warn('[HolidaysService] Erro na busca otimizada dos estados principais, tentando método tradicional:', error);
            // Fallback para método tradicional se a busca otimizada falhar (apenas se cota não foi excedida)
            for (const stateCode of priorityStatesToSearch) {
              if (await isGeminiQuotaExceeded()) {
                console.warn(`[HolidaysService] ⚠️ Cota excedida. Parando busca de ${stateCode}.`);
                break;
              }
              
              const state = BRAZILIAN_STATES.find(s => s.code === stateCode);
              const stateName = state?.name || stateCode;
              
              if (onProgress) {
                onProgress(`Buscando feriados de ${stateName}...`);
              }
              
              const stateHolidays = [
                ...await getMunicipalHolidaysByState(stateCode, currentYear, undefined, geminiApiKey),
                ...(nextYear > currentYear ? await getMunicipalHolidaysByState(stateCode, nextYear, undefined, geminiApiKey) : [])
              ];
              allMunicipalHolidays.push(...stateHolidays);
            }
          }
        }
      }
    }
    
    // Busca tradicional cidade por cidade para os demais estados
    const quotaExceeded = await isGeminiQuotaExceeded();
    if (otherStates.length > 0 && !quotaExceeded) {
      for (let i = 0; i < otherStates.length; i++) {
        // Verifica se a cota foi excedida antes de cada estado
        if (await isGeminiQuotaExceeded()) {
          console.warn(`[HolidaysService] ⚠️ Cota excedida. Parando busca dos demais estados.`);
          break;
        }
        
        const stateCode = otherStates[i];
        const state = BRAZILIAN_STATES.find(s => s.code === stateCode);
        const stateName = state?.name || stateCode;
        
        if (onProgress) {
          onProgress(`Buscando feriados de ${stateName} (${i + 1}/${otherStates.length})...`);
        }
        
        const stateHolidays = [
          ...await getMunicipalHolidaysByState(stateCode, currentYear, (current, total) => {
            if (onProgress) {
              onProgress(`Processando ${stateName}: ${current}/${total} municípios...`);
            }
          }, geminiApiKey),
          ...(nextYear > currentYear ? await getMunicipalHolidaysByState(stateCode, nextYear, undefined, geminiApiKey) : [])
        ];
        allMunicipalHolidays.push(...stateHolidays);
      }
      } else if (otherStates.length > 0 && quotaExceeded) {
        console.warn(`[HolidaysService] ⚠️ Cota do Gemini excedida hoje. Pulando busca dos demais estados.`);
      }
    } // Fim do if (allMunicipalHolidays.length === 0 && geminiApiKey)

    // Filtra apenas os feriados dentro do período (máximo 15 dias para municipais)
    const filteredMunicipal = allMunicipalHolidays.filter(h => {
      const holidayDate = new Date(h.date);
      return holidayDate >= today && holidayDate <= municipalEndDate;
    });

    holidays.push(...filteredMunicipal);
  }

  // Remove duplicatas e ordena por data
  const uniqueHolidays = holidays.filter((h, index, self) =>
    index === self.findIndex(t => t.date === h.date && t.name === h.name && t.city === h.city)
  );

  return uniqueHolidays.sort((a, b) => a.date.localeCompare(b.date));
}

