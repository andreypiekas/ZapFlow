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

// Busca feriados municipais usando BrasilAPI
export async function getMunicipalHolidays(cityCode: string, year: number): Promise<Holiday[]> {
  try {
    // Usa a API do BrasilAPI para buscar feriados municipais
    // Formato: https://brasilapi.com.br/api/feriados/v1/{ano}?{codigoIBGE}
    // A API aceita o código IBGE como query parameter
    const url = `https://brasilapi.com.br/api/feriados/v1/${year}?codigoIBGE=${cityCode}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn('[HolidaysService] Erro ao buscar feriados municipais:', response.status);
      return [];
    }

    const data = await response.json();
    
    // A API retorna um array de feriados
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
    console.error('[HolidaysService] Erro ao buscar feriados municipais:', error);
    return [];
  }
}

// Busca todos os feriados (nacionais + municipais) para os próximos N dias
export async function getUpcomingHolidays(days: number = 15, cityCode?: string): Promise<Holiday[]> {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + days);

  const holidays: Holiday[] = [];
  const currentYear = today.getFullYear();
  const nextYear = endDate.getFullYear();

  // Busca feriados nacionais para o ano atual e próximo
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

  // Se tiver código da cidade, busca feriados municipais
  if (cityCode) {
    const municipalHolidays = [
      ...await getMunicipalHolidays(cityCode, currentYear),
      ...(nextYear > currentYear ? await getMunicipalHolidays(cityCode, nextYear) : [])
    ];

    const filteredMunicipal = municipalHolidays.filter(h => {
      const holidayDate = new Date(h.date);
      return holidayDate >= today && holidayDate <= endDate;
    });

    holidays.push(...filteredMunicipal);
  }

  // Remove duplicatas e ordena por data
  const uniqueHolidays = holidays.filter((h, index, self) =>
    index === self.findIndex(t => t.date === h.date && t.name === h.name)
  );

  return uniqueHolidays.sort((a, b) => a.date.localeCompare(b.date));
}

