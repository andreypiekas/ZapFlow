// Serviço de segurança para proteger dados sensíveis no localStorage
// Usa criptografia básica (btoa/atob) - suficiente para não deixar dados em texto plano

class SecurityService {
  // Mantém compatibilidade com dados antigos criptografados como "zapflow"
  private static readonly SALT_NEW = 'zentria_secure_2024';
  private static readonly SALT_OLD = 'zapflow_secure_2024';

  static readonly KEY_AUTH_TOKEN = 'zentria_auth_token';
  static readonly KEY_USER = 'zentria_user';
  static readonly KEY_USE_ONLY_PG = 'zentria_use_only_postgresql';

  static readonly LEGACY_KEY_AUTH_TOKEN = 'zapflow_auth_token';
  static readonly LEGACY_KEY_USER = 'zapflow_user';
  static readonly LEGACY_KEY_USE_ONLY_PG = 'zapflow_use_only_postgresql';
  static readonly LEGACY_KEY_CONFIG = 'zapflow_config';
  static readonly KEY_CONFIG = 'zentria_config';

  // Busca um item tentando a chave nova primeiro e, se necessário, migra do legado.
  static getItemWithFallback(primaryKey: string, legacyKey: string): string | null {
    try {
      const primary = localStorage.getItem(primaryKey);
      if (primary !== null) return primary;

      const legacy = localStorage.getItem(legacyKey);
      if (legacy !== null) {
        // Migra (best-effort)
        try { localStorage.setItem(primaryKey, legacy); } catch {}
        return legacy;
      }

      return null;
    } catch {
      return null;
    }
  }
  
  // Criptografa dados sensíveis antes de salvar no localStorage
  static encrypt(data: string): string {
    try {
      // Usa uma combinação simples de encoding + salt para não deixar em texto plano
      const salted = this.SALT_NEW + data + this.SALT_NEW;
      return btoa(salted);
    } catch (error) {
      console.error('[SecurityService] Erro ao criptografar:', error);
      return data; // Retorna original se falhar
    }
  }
  
  // Descriptografa dados sensíveis do localStorage
  static decrypt(encrypted: string): string {
    try {
      const decoded = atob(encrypted);
      // Remove o salt
      if (decoded.startsWith(this.SALT_NEW) && decoded.endsWith(this.SALT_NEW)) {
        return decoded.slice(this.SALT_NEW.length, -this.SALT_NEW.length);
      }
      if (decoded.startsWith(this.SALT_OLD) && decoded.endsWith(this.SALT_OLD)) {
        return decoded.slice(this.SALT_OLD.length, -this.SALT_OLD.length);
      }
      return decoded; // Se não tiver salt, retorna como está (compatibilidade)
    } catch (error) {
      console.error('[SecurityService] Erro ao descriptografar:', error);
      return encrypted; // Retorna original se falhar
    }
  }
  
  // Verifica se deve usar apenas PostgreSQL (sem localStorage)
  static shouldUseOnlyPostgreSQL(): boolean {
    try {
      const setting = this.getItemWithFallback(this.KEY_USE_ONLY_PG, this.LEGACY_KEY_USE_ONLY_PG);
      return setting === 'true';
    } catch (error) {
      return false;
    }
  }
  
  // Define se deve usar apenas PostgreSQL
  static setUseOnlyPostgreSQL(value: boolean): void {
    try {
      localStorage.setItem(this.KEY_USE_ONLY_PG, value.toString());
      // Compat: mantém o legado também (permite downgrade sem perder setting)
      try { localStorage.setItem(this.LEGACY_KEY_USE_ONLY_PG, value.toString()); } catch {}
    } catch (error) {
      console.error('[SecurityService] Erro ao salvar configuração:', error);
    }
  }
  
  // Remove dados sensíveis do localStorage (para limpeza)
  static clearSensitiveData(): void {
    try {
      // Remove apenas dados sensíveis, mantém configurações não sensíveis
      localStorage.removeItem(this.KEY_AUTH_TOKEN);
      localStorage.removeItem(this.KEY_USER);
      localStorage.removeItem(this.LEGACY_KEY_AUTH_TOKEN);
      localStorage.removeItem(this.LEGACY_KEY_USER);
      // Remove config apenas se usar apenas PostgreSQL
      if (this.shouldUseOnlyPostgreSQL()) {
        localStorage.removeItem(this.KEY_CONFIG);
        localStorage.removeItem(this.LEGACY_KEY_CONFIG);
      }
    } catch (error) {
      console.error('[SecurityService] Erro ao limpar dados sensíveis:', error);
    }
  }
}

export { SecurityService };

