// Serviço de segurança para proteger dados sensíveis no localStorage
// Usa criptografia básica (btoa/atob) - suficiente para não deixar dados em texto plano

class SecurityService {
  private static readonly SALT = 'zapflow_secure_2024';
  
  // Criptografa dados sensíveis antes de salvar no localStorage
  static encrypt(data: string): string {
    try {
      // Usa uma combinação simples de encoding + salt para não deixar em texto plano
      const salted = this.SALT + data + this.SALT;
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
      if (decoded.startsWith(this.SALT) && decoded.endsWith(this.SALT)) {
        return decoded.slice(this.SALT.length, -this.SALT.length);
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
      const setting = localStorage.getItem('zapflow_use_only_postgresql');
      return setting === 'true';
    } catch (error) {
      return false;
    }
  }
  
  // Define se deve usar apenas PostgreSQL
  static setUseOnlyPostgreSQL(value: boolean): void {
    try {
      localStorage.setItem('zapflow_use_only_postgresql', value.toString());
    } catch (error) {
      console.error('[SecurityService] Erro ao salvar configuração:', error);
    }
  }
  
  // Remove dados sensíveis do localStorage (para limpeza)
  static clearSensitiveData(): void {
    try {
      // Remove apenas dados sensíveis, mantém configurações não sensíveis
      localStorage.removeItem('zapflow_auth_token');
      localStorage.removeItem('zapflow_user');
      // Remove config apenas se usar apenas PostgreSQL
      if (this.shouldUseOnlyPostgreSQL()) {
        localStorage.removeItem('zapflow_config');
      }
    } catch (error) {
      console.error('[SecurityService] Erro ao limpar dados sensíveis:', error);
    }
  }
}

export { SecurityService };

