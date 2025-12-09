// Serviço para comunicação com a API backend
// Remove /api do final da URL se presente, pois os endpoints já incluem /api
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

export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

class ApiService {
  private getToken(): string | null {
    return localStorage.getItem('zapflow_auth_token');
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
    } catch (error) {
      console.error(`[ApiService] Erro na requisição ${endpoint}:`, error);
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
      const { SecurityService } = await import('./securityService');
      const { storageService } = await import('./storageService');
      
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
    } catch (error) {
      console.error(`[ApiService] Erro ao buscar ${dataType}:`, error);
      return null;
    }
  }

  async getAllData<T>(dataType: string): Promise<{ [key: string]: T }> {
    try {
      const response = await this.request<{ [key: string]: T }>(`/api/data/${dataType}`);
      return response;
    } catch (error) {
      console.error(`[ApiService] Erro ao buscar todos os dados de ${dataType}:`, error);
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
    } catch (error) {
      console.error(`[ApiService] Erro ao salvar ${dataType}/${key}:`, error);
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
    } catch (error) {
      console.error(`[ApiService] Erro ao salvar lote de ${dataType}:`, error);
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
    } catch (error) {
      console.error(`[ApiService] Erro ao atualizar ${dataType}/${key}:`, error);
      return false;
    }
  }

  async deleteData(dataType: string, key: string): Promise<boolean> {
    try {
      await this.request(`/api/data/${dataType}/${encodeURIComponent(key)}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      console.error(`[ApiService] Erro ao deletar ${dataType}/${key}:`, error);
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
    } catch (error) {
      console.error(`[ApiService] Erro ao atualizar perfil do usuário:`, error);
      return { success: false };
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

