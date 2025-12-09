// Serviço de persistência híbrido: API primeiro, localStorage como fallback
import { apiService } from './apiService';
import { SecurityService } from './securityService';

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
  private consecutiveFailures: number = 0;
  private maxConsecutiveFailures: number = 3;
  private useOnlyPostgreSQL: boolean = false;

  constructor() {
    this.useOnlyPostgreSQL = SecurityService.shouldUseOnlyPostgreSQL();
    this.checkAPI();
    // Verifica a API periodicamente (a cada 30 segundos)
    setInterval(() => this.checkAPI(), 30000);
  }
  
  // Define se deve usar apenas PostgreSQL (sem localStorage)
  setUseOnlyPostgreSQL(value: boolean): void {
    this.useOnlyPostgreSQL = value;
    SecurityService.setUseOnlyPostgreSQL(value);
    if (value) {
      // Se ativou "usar apenas PostgreSQL", limpa dados sensíveis do localStorage
      SecurityService.clearSensitiveData();
    }
  }
  
  // Retorna se está configurado para usar apenas PostgreSQL
  getUseOnlyPostgreSQL(): boolean {
    return this.useOnlyPostgreSQL;
  }

  private async checkAPI(): Promise<void> {
    try {
      const isAvailable = await apiService.healthCheck();
      this.apiAvailable = isAvailable;
      this.useAPI = isAvailable;
      
        if (isAvailable) {
          if (this.consecutiveFailures > 0) {
            // Log removido para produção - muito verboso
            // console.log('[StorageService] ✅ API reconectada, voltando a usar backend');
          }
          this.consecutiveFailures = 0;
        } else {
          console.warn('[StorageService] ⚠️ API indisponível, usando localStorage');
        }
    } catch (error) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.apiAvailable = false;
        this.useAPI = false;
        console.warn('[StorageService] ⚠️ Muitas falhas consecutivas, desabilitando API temporariamente');
      }
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
          this.consecutiveFailures = 0;
          // Log removido para produção - muito verboso
          // console.log(`[StorageService] ✅ ${dataType}/${key || 'default'} carregado da API`);
          return data;
        }
      } catch (error) {
        console.warn(`[StorageService] Erro ao carregar ${dataType} da API, usando localStorage:`, error);
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          this.useAPI = false;
        }
      }
    }

    // Fallback para localStorage (apenas se não estiver configurado para usar apenas PostgreSQL)
    if (!this.useOnlyPostgreSQL) {
      try {
        const storageKey = this.getLocalStorageKey(dataType);
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          // Descriptografa se for um dado sensível
          let decrypted = saved;
          if (this.isSensitiveDataType(dataType)) {
            try {
              decrypted = SecurityService.decrypt(saved);
            } catch {
              // Se falhar ao descriptografar, tenta usar como está (compatibilidade)
              decrypted = saved;
            }
          }
          
          const parsed = JSON.parse(decrypted);
          if (key && typeof parsed === 'object' && parsed !== null) {
            return (parsed as any)[key] || null;
          }
          return parsed as T;
        }
      } catch (error) {
        console.error(`[StorageService] Erro ao carregar ${dataType} do localStorage:`, error);
      }
    }

    return null;
  }

  async save<T>(dataType: DataType, value: T, key?: string): Promise<boolean> {
    const storageKey = key || 'default';

    // Salva no localStorage apenas se não estiver configurado para usar apenas PostgreSQL
    // OU se for um dado não sensível (mesmo com PostgreSQL apenas)
    const shouldSaveToLocalStorage = !this.useOnlyPostgreSQL || !this.isSensitiveDataType(dataType);
    const localStorageSuccess = shouldSaveToLocalStorage ? this.saveToLocalStorage(dataType, value, key) : true;

    // Se API está disponível, tenta salvar
    if (this.useAPI && this.apiAvailable) {
      try {
        const success = await apiService.saveData(dataType, storageKey, value);
        if (success) {
          this.consecutiveFailures = 0;
          // Log removido para produção - muito verboso
          // console.log(`[StorageService] ✅ ${dataType}/${storageKey} salvo na API`);
          return true;
        }
      } catch (error: any) {
        // Erro 413 (Payload Too Large) não deve desabilitar permanentemente a API
        // Pode ser temporário ou resolvido após reiniciar o backend
        if (error?.message?.includes('413') || error?.message?.includes('Payload Too Large')) {
          console.warn(`[StorageService] ⚠️ Payload muito grande para ${dataType}/${storageKey}, usando localStorage. Reinicie o backend para aplicar o limite de 50MB.`);
          // Não desabilita a API para erros 413, pois pode ser resolvido
        } else {
          console.warn(`[StorageService] Erro ao salvar ${dataType} na API, usando localStorage:`, error);
          this.consecutiveFailures++;
          if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            this.useAPI = false;
            console.warn('[StorageService] Muitas falhas, desabilitando API temporariamente');
          }
        }
      }
    }

    // Retorna sucesso se salvou no localStorage
    return localStorageSuccess;
  }

  private saveToLocalStorage<T>(dataType: DataType, value: T, key?: string): boolean {
    try {
      const storageKey = this.getLocalStorageKey(dataType);
      const stringValue = JSON.stringify(value);
      
      // Criptografa dados sensíveis antes de salvar
      const finalValue = this.isSensitiveDataType(dataType) 
        ? SecurityService.encrypt(stringValue)
        : stringValue;
      
      if (key) {
        // Se há uma key, salva como objeto
        const existing = localStorage.getItem(storageKey);
        let data: any = {};
        if (existing) {
          try {
            const decrypted = this.isSensitiveDataType(dataType) 
              ? SecurityService.decrypt(existing)
              : existing;
            data = JSON.parse(decrypted);
          } catch {
            data = {};
          }
        }
        data[key] = value;
        const dataString = JSON.stringify(data);
        const encryptedData = this.isSensitiveDataType(dataType)
          ? SecurityService.encrypt(dataString)
          : dataString;
        localStorage.setItem(storageKey, encryptedData);
      } else {
        localStorage.setItem(storageKey, finalValue);
      }
      return true;
    } catch (error) {
      console.error(`[StorageService] Erro ao salvar ${dataType} no localStorage:`, error);
      return false;
    }
  }
  
  // Verifica se um tipo de dado é sensível e deve ser criptografado
  private isSensitiveDataType(dataType: DataType): boolean {
    const sensitiveTypes: DataType[] = ['config', 'users'];
    return sensitiveTypes.includes(dataType);
  }

  async saveBatch<T>(dataType: DataType, data: { [key: string]: T }): Promise<boolean> {
    // Sempre salva no localStorage primeiro (backup imediato)
    const localStorageSuccess = this.saveToLocalStorage(dataType, data);

    // Se API está disponível, tenta salvar em lote
    if (this.useAPI && this.apiAvailable) {
      try {
        const success = await apiService.saveBatchData(dataType, data);
        if (success) {
          this.consecutiveFailures = 0;
          // Log removido para produção - muito verboso
          // console.log(`[StorageService] ✅ Lote de ${dataType} salvo na API`);
          return true;
        }
      } catch (error: any) {
        if (error?.message?.includes('413') || error?.message?.includes('Payload Too Large')) {
          console.warn(`[StorageService] ⚠️ Payload muito grande para lote de ${dataType}, usando localStorage. Reinicie o backend.`);
        } else {
          console.warn(`[StorageService] Erro ao salvar lote de ${dataType} na API, usando localStorage:`, error);
          this.consecutiveFailures++;
          if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
            this.useAPI = false;
          }
        }
      }
    }

    // Retorna sucesso se salvou no localStorage
    return localStorageSuccess;
  }

  async delete(dataType: DataType, key: string): Promise<boolean> {
    // Sempre remove do localStorage primeiro
    const localStorageSuccess = this.deleteFromLocalStorage(dataType, key);

    // Se API está disponível, tenta deletar
    if (this.useAPI && this.apiAvailable) {
      try {
        const success = await apiService.deleteData(dataType, key);
        if (success) {
          this.consecutiveFailures = 0;
          // Log removido para produção - muito verboso
          // console.log(`[StorageService] ✅ ${dataType}/${key} deletado da API`);
          return true;
        }
      } catch (error) {
        console.warn(`[StorageService] Erro ao deletar ${dataType}/${key} da API, usando localStorage:`, error);
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
          this.useAPI = false;
        }
      }
    }

    // Retorna sucesso se removeu do localStorage
    return localStorageSuccess;
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
    // Log removido para produção - muito verboso
    // console.log('[StorageService] Modo localStorage forçado');
  }

  // Método para tentar reconectar à API
  async reconnectAPI(): Promise<boolean> {
    const wasAvailable = this.apiAvailable;
    await this.checkAPI();
    return this.apiAvailable === true && wasAvailable !== true;
  }
}

export const storageService = new StorageService();

