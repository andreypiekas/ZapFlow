// Serviço de persistência híbrido: API primeiro, localStorage como fallback
import { apiService } from './apiService';

type DataType = 
  | 'config'
  | 'chats'
  | 'contacts'
  | 'users'
  | 'departments'
  | 'quickReplies'
  | 'workflows'
  | 'chatbotConfig'
  | 'viewState'
  | 'sidebarState';

class StorageService {
  private useAPI: boolean = false;
  private apiAvailable: boolean | null = null;

  constructor() {
    this.checkAPI();
  }

  private async checkAPI(): Promise<void> {
    try {
      const isAvailable = await apiService.healthCheck();
      this.apiAvailable = isAvailable;
      this.useAPI = isAvailable;
      
      if (isAvailable) {
        console.log('[StorageService] ✅ API disponível, usando backend');
      } else {
        console.log('[StorageService] ⚠️ API indisponível, usando localStorage');
      }
    } catch (error) {
      this.apiAvailable = false;
      this.useAPI = false;
      console.log('[StorageService] ⚠️ Erro ao verificar API, usando localStorage');
    }
  }

  private getLocalStorageKey(dataType: DataType): string {
    const keyMap: Record<DataType, string> = {
      config: 'zapflow_config',
      chats: 'zapflow_chats',
      contacts: 'zapflow_contacts',
      users: 'zapflow_users',
      departments: 'zapflow_departments',
      quickReplies: 'zapflow_quickReplies',
      workflows: 'zapflow_workflows',
      chatbotConfig: 'zapflow_chatbotConfig',
      viewState: 'zapflow_currentView',
      sidebarState: 'zapflow_sidebarCollapsed',
    };
    return keyMap[dataType] || `zapflow_${dataType}`;
  }

  async load<T>(dataType: DataType, key?: string): Promise<T | null> {
    // Se API está disponível, tenta usar
    if (this.useAPI && this.apiAvailable) {
      try {
        const data = await apiService.getData<T>(dataType, key || 'default');
        if (data !== null) {
          return data;
        }
      } catch (error) {
        console.warn(`[StorageService] Erro ao carregar ${dataType} da API, usando localStorage:`, error);
        this.useAPI = false;
      }
    }

    // Fallback para localStorage
    try {
      const storageKey = this.getLocalStorageKey(dataType);
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (key && typeof parsed === 'object' && parsed !== null) {
          return (parsed as any)[key] || null;
        }
        return parsed as T;
      }
    } catch (error) {
      console.error(`[StorageService] Erro ao carregar ${dataType} do localStorage:`, error);
    }

    return null;
  }

  async save<T>(dataType: DataType, value: T, key?: string): Promise<boolean> {
    const storageKey = key || 'default';

    // Se API está disponível, tenta salvar
    if (this.useAPI && this.apiAvailable) {
      try {
        const success = await apiService.saveData(dataType, storageKey, value);
        if (success) {
          // Também salva no localStorage como backup
          this.saveToLocalStorage(dataType, value, key);
          return true;
        }
      } catch (error) {
        console.warn(`[StorageService] Erro ao salvar ${dataType} na API, usando localStorage:`, error);
        this.useAPI = false;
      }
    }

    // Fallback para localStorage
    return this.saveToLocalStorage(dataType, value, key);
  }

  private saveToLocalStorage<T>(dataType: DataType, value: T, key?: string): boolean {
    try {
      const storageKey = this.getLocalStorageKey(dataType);
      
      if (key) {
        // Se há uma key, salva como objeto
        const existing = localStorage.getItem(storageKey);
        const data = existing ? JSON.parse(existing) : {};
        data[key] = value;
        localStorage.setItem(storageKey, JSON.stringify(data));
      } else {
        localStorage.setItem(storageKey, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      console.error(`[StorageService] Erro ao salvar ${dataType} no localStorage:`, error);
      return false;
    }
  }

  async saveBatch<T>(dataType: DataType, data: { [key: string]: T }): Promise<boolean> {
    // Se API está disponível, tenta salvar em lote
    if (this.useAPI && this.apiAvailable) {
      try {
        const success = await apiService.saveBatchData(dataType, data);
        if (success) {
          // Também salva no localStorage como backup
          this.saveToLocalStorage(dataType, data);
          return true;
        }
      } catch (error) {
        console.warn(`[StorageService] Erro ao salvar lote de ${dataType} na API, usando localStorage:`, error);
        this.useAPI = false;
      }
    }

    // Fallback para localStorage
    return this.saveToLocalStorage(dataType, data);
  }

  async delete(dataType: DataType, key: string): Promise<boolean> {
    // Se API está disponível, tenta deletar
    if (this.useAPI && this.apiAvailable) {
      try {
        const success = await apiService.deleteData(dataType, key);
        if (success) {
          // Também remove do localStorage
          this.deleteFromLocalStorage(dataType, key);
          return true;
        }
      } catch (error) {
        console.warn(`[StorageService] Erro ao deletar ${dataType}/${key} da API, usando localStorage:`, error);
        this.useAPI = false;
      }
    }

    // Fallback para localStorage
    return this.deleteFromLocalStorage(dataType, key);
  }

  private deleteFromLocalStorage(dataType: DataType, key: string): boolean {
    try {
      const storageKey = this.getLocalStorageKey(dataType);
      const existing = localStorage.getItem(storageKey);
      
      if (existing) {
        const data = JSON.parse(existing);
        if (typeof data === 'object' && data !== null) {
          delete data[key];
          localStorage.setItem(storageKey, JSON.stringify(data));
        } else {
          localStorage.removeItem(storageKey);
        }
      }
      return true;
    } catch (error) {
      console.error(`[StorageService] Erro ao deletar ${dataType}/${key} do localStorage:`, error);
      return false;
    }
  }

  // Método para forçar uso de localStorage (útil quando API não está disponível)
  forceLocalStorage(): void {
    this.useAPI = false;
    console.log('[StorageService] Modo localStorage forçado');
  }

  // Método para tentar reconectar à API
  async reconnectAPI(): Promise<boolean> {
    const wasAvailable = this.apiAvailable;
    await this.checkAPI();
    return this.apiAvailable === true && wasAvailable !== true;
  }
}

export const storageService = new StorageService();

