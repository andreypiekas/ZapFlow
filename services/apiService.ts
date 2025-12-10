// Serviço para comunicação com a API backend
// Remove /api do final da URL se presente, pois os endpoints já incluem /api
import { SecurityService } from './securityService';
import { storageService } from './storageService';
import { Holiday } from './holidaysService';

const getApiBaseUrl = () => {
  const envUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';
  // Remove /api do final se presente
  const baseUrl = envUrl.replace(/\/api\/?$/, '');
  // Log removido para produção - muito verboso
  // if (!(window as any).__API_BASE_URL_LOGGED) {
  //   console.log(`[ApiService] URL da API configurada: ${baseUrl}`);
  //   (window as any).__API_BASE_URL_LOGGED = true;
  // }
  return baseUrl;
};

const API_BASE_URL = getApiBaseUrl();

// Exportar URL base para uso em componentes
export const getBackendUrl = () => API_BASE_URL;

export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

class ApiService {
  // Verifica se o erro é de conexão (backend não disponível)
  // IMPORTANTE: Backend é obrigatório - erros de conexão são críticos
  private isConnectionError(error: any): boolean {
    return error?.message?.includes('Failed to fetch') || 
           error?.message?.includes('ERR_CONNECTION_REFUSED') ||
           error?.message?.includes('NetworkError') ||
           error?.name === 'TypeError' ||
           (error instanceof TypeError && error.message.includes('fetch'));
  }

  private getToken(): string | null {
    const encrypted = localStorage.getItem('zapflow_auth_token');
    if (!encrypted) return null;
    
    // Tenta descriptografar o token se estiver criptografado
    try {
      return SecurityService.decrypt(encrypted);
    } catch {
      // Se falhar, retorna como está (compatibilidade com tokens antigos não criptografados)
      return encrypted;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      // Backend é obrigatório - erros de conexão são críticos e devem ser logados
      if (this.isConnectionError(error)) {
        console.error(`[ApiService] ❌ ERRO CRÍTICO: Backend não está disponível (${endpoint})`);
        console.error(`[ApiService] ⚠️ O backend é obrigatório para o funcionamento do sistema.`);
        console.error(`[ApiService] Verifique se o servidor está rodando em ${API_BASE_URL}`);
      } else {
        // Erro real (não é de conexão) - loga como erro
        console.error(`[ApiService] Erro na requisição ${endpoint}:`, error);
      }
      throw error;
    }
  }

  // Autenticação
  async login(username: string, password: string): Promise<{ token: string; user: any }> {
    const response = await this.request<{ token: string; user: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    
    if (response.token) {
      // Salva token e usuário apenas se não estiver configurado para usar apenas PostgreSQL
      if (!storageService.getUseOnlyPostgreSQL()) {
        // Criptografa dados sensíveis antes de salvar
        localStorage.setItem('zapflow_auth_token', SecurityService.encrypt(response.token));
        localStorage.setItem('zapflow_user', SecurityService.encrypt(JSON.stringify(response.user)));
      }
    }
    
    return response;
  }

  logout(): void {
    // Remove dados sensíveis do localStorage
    localStorage.removeItem('zapflow_auth_token');
    localStorage.removeItem('zapflow_user');
  }

  // Operações de dados
  async getData<T>(dataType: string, key?: string): Promise<T | null> {
    try {
      const endpoint = key 
        ? `/api/data/${dataType}?key=${encodeURIComponent(key)}`
        : `/api/data/${dataType}`;
      
      const response = await this.request<T | { [key: string]: T }>(endpoint);
      
      if (key) {
        return response as T;
      } else {
        // Se não há key, retorna o primeiro valor ou null
        const data = response as { [key: string]: T };
        const keys = Object.keys(data);
        return keys.length > 0 ? data[keys[0]] : null;
      }
    } catch (error: any) {
      // Erro de conexão é tratado no request() - não precisa logar novamente
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao buscar ${dataType}:`, error);
      }
      return null;
    }
  }

  async getAllData<T>(dataType: string): Promise<{ [key: string]: T }> {
    try {
      const response = await this.request<{ [key: string]: T }>(`/api/data/${dataType}`);
      return response;
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao buscar todos os dados de ${dataType}:`, error);
      }
      return {};
    }
  }

  async saveData<T>(dataType: string, key: string, value: T): Promise<boolean> {
    try {
      await this.request('/api/data/' + dataType, {
        method: 'POST',
        body: JSON.stringify({ key, value }),
      });
      return true;
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao salvar ${dataType}/${key}:`, error);
      }
      return false;
    }
  }

  async saveBatchData<T>(dataType: string, data: { [key: string]: T }): Promise<boolean> {
    try {
      await this.request('/api/data/' + dataType + '/batch', {
        method: 'POST',
        body: JSON.stringify({ data }),
      });
      return true;
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao salvar lote de ${dataType}:`, error);
      }
      return false;
    }
  }

  async updateData<T>(dataType: string, key: string, value: T): Promise<boolean> {
    try {
      await this.request(`/api/data/${dataType}/${encodeURIComponent(key)}`, {
        method: 'PUT',
        body: JSON.stringify({ value }),
      });
      return true;
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao atualizar ${dataType}/${key}:`, error);
      }
      return false;
    }
  }

  async deleteData(dataType: string, key: string): Promise<boolean> {
    try {
      await this.request(`/api/data/${dataType}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao deletar ${dataType}/${key}:`, error);
      }
      return false;
    }
  }

  // Atualiza status e assignedTo de um chat específico no banco
  async updateChatStatus(chatId: string, status?: 'open' | 'pending' | 'closed', assignedTo?: string, departmentId?: string | null): Promise<boolean> {
    try {
      await this.request(`/api/chats/${encodeURIComponent(chatId)}`, {
        method: 'PUT',
        body: JSON.stringify({ status, assignedTo, departmentId }),
      });
      return true;
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao atualizar status do chat ${chatId}:`, error);
      }
      return false;
    }
  }

  // Atualiza o perfil do usuário (nome, email)
  async updateUserProfile(name: string, email?: string): Promise<{ success: boolean; user?: any }> {
    try {
      const response = await this.request<{ success: boolean; user: any }>('/api/user/profile', {
        method: 'PUT',
        body: JSON.stringify({ name, email }),
      });
      return response;
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao atualizar perfil do usuário:`, error);
      }
      return { success: false };
    }
  }

  // Listar usuários (apenas ADMIN)
  async getUsers(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const response = await this.request<any[]>('/api/users');
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao listar usuários:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  // Criar novo usuário (apenas ADMIN)
  async createUser(username: string, password: string, name: string, email?: string, role?: string): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const response = await this.request<{ success: boolean; user: any }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, password, name, email, role }),
      });
      return response;
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao criar usuário:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  // Deletar usuário (apenas ADMIN)
  async deleteUser(userId: string | number): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.request<{ success: boolean }>(`/api/users/${userId}`, {
        method: 'DELETE',
      });
      return response;
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao deletar usuário:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  // Atualizar qualquer usuário (apenas ADMIN)
  async updateUser(userId: string | number, name?: string, email?: string, role?: string, password?: string, departmentId?: string): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const response = await this.request<{ success: boolean; user: any }>(`/api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ name, email, role, password, departmentId }),
      });
      return response;
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao atualizar usuário:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // DEPARTMENTS
  // ============================================================================
  async getDepartments(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const response = await this.request<any[]>('/api/departments');
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao listar departamentos:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async createDepartment(name: string, description?: string, color?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.request<any>('/api/departments', {
        method: 'POST',
        body: JSON.stringify({ name, description, color }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao criar departamento:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async updateDepartment(id: string | number, name?: string, description?: string, color?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.request<any>(`/api/departments/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, color }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao atualizar departamento:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async deleteDepartment(id: string | number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request<{ success: boolean }>(`/api/departments/${id}`, {
        method: 'DELETE',
      });
      return { success: true };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao deletar departamento:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // CONTACTS
  // ============================================================================
  async getContacts(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const response = await this.request<any[]>('/api/contacts');
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao listar contatos:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async createContact(name: string, phone: string, email?: string, avatar?: string, source?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.request<any>('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({ name, phone, email, avatar, source }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao criar contato:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async updateContact(id: string | number, name?: string, phone?: string, email?: string, avatar?: string, source?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.request<any>(`/api/contacts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, phone, email, avatar, source }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao atualizar contato:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async deleteContact(id: string | number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request<{ success: boolean }>(`/api/contacts/${id}`, {
        method: 'DELETE',
      });
      return { success: true };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao deletar contato:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // QUICK REPLIES
  // ============================================================================
  async getQuickReplies(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const response = await this.request<any[]>('/api/quick-replies');
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao listar respostas rápidas:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async createQuickReply(title: string, content: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.request<any>('/api/quick-replies', {
        method: 'POST',
        body: JSON.stringify({ title, content }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao criar resposta rápida:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async updateQuickReply(id: string | number, title?: string, content?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.request<any>(`/api/quick-replies/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title, content }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao atualizar resposta rápida:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async deleteQuickReply(id: string | number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request<{ success: boolean }>(`/api/quick-replies/${id}`, {
        method: 'DELETE',
      });
      return { success: true };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao deletar resposta rápida:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  // ============================================================================
  // WORKFLOWS
  // ============================================================================
  async getWorkflows(): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      const response = await this.request<any[]>('/api/workflows');
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao listar workflows:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async createWorkflow(title: string, steps: any[], description?: string, triggerKeywords?: string[], targetDepartmentId?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.request<any>('/api/workflows', {
        method: 'POST',
        body: JSON.stringify({ title, description, triggerKeywords, steps, targetDepartmentId }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao criar workflow:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async updateWorkflow(id: string | number, title?: string, steps?: any[], description?: string, triggerKeywords?: string[], targetDepartmentId?: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await this.request<any>(`/api/workflows/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title, description, triggerKeywords, steps, targetDepartmentId }),
      });
      return { success: true, data: response };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao atualizar workflow:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  async deleteWorkflow(id: string | number): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request<{ success: boolean }>(`/api/workflows/${id}`, {
        method: 'DELETE',
      });
      return { success: true };
    } catch (error: any) {
      if (!this.isConnectionError(error)) {
        console.error(`[ApiService] Erro ao deletar workflow:`, error);
      }
      return { success: false, error: error.message };
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.request<{ status: string; database: string }>('/api/health');
      return response.status === 'ok' && response.database === 'connected';
    } catch (error) {
      return false;
    }
  }
}

export const apiService = new ApiService();

// Funções auxiliares exportadas
export const getAuthToken = (): string | null => {
  return localStorage.getItem('zapflow_auth_token');
};

export const checkApiHealth = async (): Promise<boolean> => {
  return apiService.healthCheck();
};

// Exportar funções do serviço para compatibilidade
export const loginUser = (username: string, password: string) => {
  return apiService.login(username, password);
};

export const saveUserData = <T>(dataType: string, key: string, value: T) => {
  return apiService.saveData<T>(dataType, key, value);
};

export const loadUserData = <T>(dataType: string, key?: string) => {
  return apiService.getData<T>(dataType, key);
};

export const deleteUserData = (dataType: string, key: string) => {
  return apiService.deleteData(dataType, key);
};

// Métodos específicos para configurações (ApiConfig)
export const saveConfig = async (config: any): Promise<boolean> => {
  return apiService.request<{ success: boolean }>('/api/config', {
    method: 'PUT',
    body: JSON.stringify({ config }),
  }).then(response => response.success || false);
};

export const loadConfig = async (): Promise<any | null> => {
  try {
    const response = await apiService.request<{ success: boolean; config: any }>('/api/config', {
      method: 'GET',
    });
    return response.config || null;
  } catch (error) {
    // Se não conseguir carregar do backend, retorna null
    console.error('[ApiService] Erro ao carregar configurações do backend:', error);
    return null;
  }
};

// Limpar chats inválidos (apenas ADMIN)
export const cleanupInvalidChats = async (): Promise<{ success: boolean; summary?: any; message?: string }> => {
  try {
    const response = await apiService.request<{ success: boolean; summary: any; message: string }>('/api/admin/cleanup-invalid-chats', {
      method: 'POST',
    });
    return response;
  } catch (error: any) {
    console.error('[ApiService] Erro ao limpar chats inválidos:', error);
    return { 
      success: false, 
      message: error?.message || 'Erro ao executar limpeza de chats inválidos' 
    };
  }
};

// Cache de feriados municipais
export interface MunicipalHolidayCache {
  cityName: string;
  stateCode: string;
  year: number;
  holidays: any[] | null;
  lastUpdated?: string;
  fromCache: boolean;
}

// Buscar feriados municipais do cache
export const getMunicipalHolidaysCache = async (
  cityName: string,
  stateCode: string,
  year: number
): Promise<MunicipalHolidayCache | null> => {
  try {
    const response = await apiService.request<{ success: boolean; holidays: any[] | null; lastUpdated?: string; fromCache: boolean }>(
      `/api/holidays/municipal-cache?cityName=${encodeURIComponent(cityName)}&stateCode=${encodeURIComponent(stateCode)}&year=${year}`,
      { method: 'GET' }
    );
    
    if (response.success) {
      return {
        cityName,
        stateCode,
        year,
        holidays: response.holidays,
        lastUpdated: response.lastUpdated,
        fromCache: response.fromCache
      };
    }
    return null;
  } catch (error: any) {
    console.error('[ApiService] Erro ao buscar cache de feriados municipais:', error);
    return null;
  }
};

// Salvar feriados municipais no cache
export const saveMunicipalHolidaysCache = async (
  cityName: string,
  stateCode: string,
  year: number,
  holidays: any[]
): Promise<boolean> => {
  try {
    const response = await apiService.request<{ success: boolean }>('/api/holidays/municipal-cache', {
      method: 'POST',
      body: JSON.stringify({ cityName, stateCode, year, holidays })
    });
    return response.success || false;
  } catch (error: any) {
    console.error('[ApiService] Erro ao salvar cache de feriados municipais:', error);
    return false;
  }
};

// Buscar múltiplos feriados do cache (otimizado)
export const getMunicipalHolidaysCacheBatch = async (
  cities: Array<{ cityName: string; stateCode: string; year: number }>
): Promise<MunicipalHolidayCache[]> => {
  try {
    const response = await apiService.request<{ success: boolean; results: MunicipalHolidayCache[] }>(
      '/api/holidays/municipal-cache/batch',
      {
        method: 'POST',
        body: JSON.stringify({ cities })
      }
    );
    
    if (response.success && response.results) {
      return response.results;
    }
    return [];
  } catch (error: any) {
    console.error('[ApiService] Erro ao buscar cache em lote de feriados municipais:', error);
    return [];
  }
};

// Verificar se a cota do Gemini foi excedida hoje
export const isGeminiQuotaExceeded = async (): Promise<boolean> => {
  try {
    const response = await apiService.request<{ success: boolean; quotaExceeded: boolean }>(
      '/api/gemini/quota/check',
      { method: 'GET' }
    );
    
    if (response.success && response.quotaExceeded) {
      return true;
    }
    return false;
  } catch (error: any) {
    console.error('[ApiService] Erro ao verificar cota do Gemini:', error);
    // Em caso de erro, retorna false para não bloquear as buscas
    return false;
  }
};

// Marcar que a cota foi excedida
export const setGeminiQuotaExceeded = async (): Promise<void> => {
  try {
    const response = await apiService.request<{ success: boolean; message: string }>(
      '/api/gemini/quota/exceeded',
      { method: 'POST' }
    );
    
    if (response.success) {
      console.warn('[ApiService] ⚠️ Cota do Gemini excedida. Buscas serão pausadas até o próximo dia.');
    }
  } catch (error: any) {
    console.error('[ApiService] Erro ao salvar data de cota excedida:', error);
  }
};

// ==================== Feriados Nacionais ====================

// Sincronizar feriados nacionais da BrasilAPI para o banco
export const syncNationalHolidays = async (year?: number): Promise<{ success: boolean; saved: number; skipped: number; errors: number }> => {
  try {
    const response = await apiService.request<{ 
      success: boolean; 
      saved: number; 
      skipped: number; 
      errors: number;
      year: number;
      total: number;
    }>(
      '/api/holidays/national/sync',
      {
        method: 'POST',
        body: JSON.stringify({ year: year || new Date().getFullYear() })
      }
    );
    
    if (response.success) {
      console.log(`[ApiService] ✅ Feriados nacionais sincronizados: ${response.saved} salvos, ${response.skipped} já existiam`);
      return {
        success: true,
        saved: response.saved,
        skipped: response.skipped,
        errors: response.errors
      };
    }
    
    return { success: false, saved: 0, skipped: 0, errors: 0 };
  } catch (error: any) {
    console.error('[ApiService] Erro ao sincronizar feriados nacionais:', error);
    return { success: false, saved: 0, skipped: 0, errors: 0 };
  }
};

// Buscar feriados nacionais do banco
export const getNationalHolidaysFromDB = async (year?: number, startDate?: string, endDate?: string): Promise<Holiday[]> => {
  try {
    const params = new URLSearchParams();
    if (year) params.append('year', year.toString());
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const response = await apiService.request<{ success: boolean; holidays: Holiday[] }>(
      `/api/holidays/national?${params.toString()}`,
      { method: 'GET' }
    );
    
    if (response.success && response.holidays) {
      return response.holidays;
    }
    
    return [];
  } catch (error: any) {
    console.error('[ApiService] Erro ao buscar feriados nacionais do banco:', error);
    return [];
  }
};

// Buscar próximos feriados nacionais
export const getUpcomingNationalHolidays = async (days: number = 15): Promise<Holiday[]> => {
  try {
    const response = await apiService.request<{ success: boolean; holidays: Holiday[] }>(
      `/api/holidays/national/upcoming?days=${days}`,
      { method: 'GET' }
    );
    
    if (response.success && response.holidays) {
      return response.holidays;
    }
    
    return [];
  } catch (error: any) {
    console.error('[ApiService] Erro ao buscar próximos feriados nacionais:', error);
    return [];
  }
};

// Validar e remover duplicações
export const validateNationalHolidays = async (): Promise<{ success: boolean; removed: number }> => {
  try {
    const response = await apiService.request<{ 
      success: boolean; 
      duplicatesFound: number;
      removed: number;
    }>(
      '/api/holidays/national/validate',
      { method: 'POST' }
    );
    
    if (response.success) {
      console.log(`[ApiService] ✅ Validação concluída: ${response.removed} duplicados removidos`);
      return { success: true, removed: response.removed };
    }
    
    return { success: false, removed: 0 };
  } catch (error: any) {
    console.error('[ApiService] Erro ao validar feriados nacionais:', error);
    return { success: false, removed: 0 };
  }
};

// ==================== Deletar Chat ====================

// Deletar um chat (apenas ADMIN)
export const deleteChat = async (chatId: string): Promise<{ success: boolean; message?: string; error?: string }> => {
  try {
    const response = await apiService.request<{ 
      success: boolean; 
      message?: string;
      deletedFromDB?: boolean;
      deletedFromEvolution?: boolean;
    }>(
      `/api/chats/${encodeURIComponent(chatId)}`,
      { method: 'DELETE' }
    );
    
    if (response.success) {
      console.log(`[ApiService] ✅ Chat deletado com sucesso: ${chatId}`);
      return { 
        success: true, 
        message: response.message || 'Chat deletado com sucesso' 
      };
    }
    
    return { 
      success: false, 
      error: response.error || 'Erro ao deletar chat' 
    };
  } catch (error: any) {
    console.error('[ApiService] Erro ao deletar chat:', error);
    return { 
      success: false, 
      error: error?.message || 'Erro ao deletar chat' 
    };
  }
};

