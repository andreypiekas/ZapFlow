// Serviço para buscar feriados nacionais e municipais do Brasil
// Usa a API pública BrasilAPI para feriados nacionais e municipais

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

// Busca feriados nacionais para um ano
export function getNationalHolidays(year: number): Holiday[] {
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

// Busca feriados municipais de uma cidade específica
async function getMunicipalHolidaysByCity(cityCode: string, year: number): Promise<Holiday[]> {
  try {
    const url = `https://brasilapi.com.br/api/feriados/v1/${year}?codigoIBGE=${cityCode}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    
    if (Array.isArray(data)) {
      return data
        .filter((h: any) => h.type === 'municipal' || h.type === 'estadual')
        .map((h: any) => ({
          date: h.date,
          name: h.name,
          type: h.type === 'estadual' ? 'state' : 'municipal',
          city: h.city,
          state: h.state
        }));
    }

    return [];
  } catch (error) {
    return [];
  }
}

// Busca feriados municipais de todos os municípios de um estado
export async function getMunicipalHolidaysByState(
  stateCode: string, 
  year: number,
  onProgress?: (current: number, total: number) => void
): Promise<Holiday[]> {
  try {
    // Busca todos os municípios do estado
    const cities = await getCitiesByState(stateCode);
    
    if (cities.length === 0) {
      console.warn(`[HolidaysService] Nenhum município encontrado para o estado ${stateCode}`);
      return [];
    }

    // Limita a 100 municípios para não sobrecarregar a API
    const maxCities = Math.min(cities.length, 100);
    const citiesToProcess = cities.slice(0, maxCities);

    // Busca feriados de cada município
    const allHolidays: Holiday[] = [];
    const batchSize = 5; // Processa 5 municípios por vez para não sobrecarregar
    
    for (let i = 0; i < citiesToProcess.length; i += batchSize) {
      const batch = citiesToProcess.slice(i, i + batchSize);
      const batchPromises = batch.map(city => getMunicipalHolidaysByCity(city.code, year));
      const batchResults = await Promise.all(batchPromises);
      
      batchResults.forEach(holidays => {
        allHolidays.push(...holidays);
      });
      
      // Callback de progresso
      if (onProgress) {
        onProgress(Math.min(i + batchSize, citiesToProcess.length), citiesToProcess.length);
      }
      
      // Pequeno delay para não sobrecarregar a API
      if (i + batchSize < citiesToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

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
export async function getMunicipalHolidays(cityCode: string, year: number): Promise<Holiday[]> {
  return getMunicipalHolidaysByCity(cityCode, year);
}

// Busca todos os feriados (nacionais + municipais) para os próximos N dias
export async function getUpcomingHolidays(
  days: number = 15, 
  selectedStates?: string[],
  onProgress?: (message: string) => void
): Promise<Holiday[]> {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + days);

  const holidays: Holiday[] = [];
  const currentYear = today.getFullYear();
  const nextYear = endDate.getFullYear();

  // Busca feriados nacionais para o ano atual e próximo
  if (onProgress) onProgress('Buscando feriados nacionais...');
  const nationalHolidays = [
    ...getNationalHolidays(currentYear),
    ...(nextYear > currentYear ? getNationalHolidays(nextYear) : [])
  ];

  // Filtra apenas os feriados dentro do período
  const filteredNational = nationalHolidays.filter(h => {
    const holidayDate = new Date(h.date);
    return holidayDate >= today && holidayDate <= endDate;
  });

  holidays.push(...filteredNational);

  // Se tiver estados selecionados, busca feriados municipais de todos os municípios desses estados
  if (selectedStates && selectedStates.length > 0) {
    const allMunicipalHolidays: Holiday[] = [];
    
    for (let i = 0; i < selectedStates.length; i++) {
      const stateCode = selectedStates[i];
      const state = BRAZILIAN_STATES.find(s => s.code === stateCode);
      const stateName = state?.name || stateCode;
      
      if (onProgress) {
        onProgress(`Buscando feriados de ${stateName} (${i + 1}/${selectedStates.length})...`);
      }
      
      const stateHolidays = [
        ...await getMunicipalHolidaysByState(stateCode, currentYear, (current, total) => {
          if (onProgress) {
            onProgress(`Processando ${stateName}: ${current}/${total} municípios...`);
          }
        }),
        ...(nextYear > currentYear ? await getMunicipalHolidaysByState(stateCode, nextYear) : [])
      ];
      allMunicipalHolidays.push(...stateHolidays);
    }

    // Filtra apenas os feriados dentro do período
    const filteredMunicipal = allMunicipalHolidays.filter(h => {
      const holidayDate = new Date(h.date);
      return holidayDate >= today && holidayDate <= endDate;
    });

    holidays.push(...filteredMunicipal);
  }

  // Remove duplicatas e ordena por data
  const uniqueHolidays = holidays.filter((h, index, self) =>
    index === self.findIndex(t => t.date === h.date && t.name === h.name && t.city === h.city)
  );

  return uniqueHolidays.sort((a, b) => a.date.localeCompare(b.date));
}

