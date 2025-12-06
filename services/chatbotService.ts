import { ChatbotConfig, BusinessHours } from '../types';
import { sendRealMessage } from './whatsappService';
import { ApiConfig } from '../types';

/**
 * Verifica se está dentro do horário de funcionamento
 */
export const isWithinBusinessHours = (config: ChatbotConfig): boolean => {
    if (!config.businessHours || config.businessHours.length === 0) {
        return true; // Se não configurado, assume sempre aberto
    }

    const now = new Date();
    const currentDay = now.getDay(); // 0 = Domingo, 1 = Segunda, etc.
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const todayHours = config.businessHours.find(bh => bh.dayOfWeek === currentDay);
    
    if (!todayHours || !todayHours.isOpen) {
        return false; // Dia fechado
    }

    // Compara horários (formato "HH:MM")
    return currentTime >= todayHours.openTime && currentTime <= todayHours.closeTime;
};

/**
 * Verifica se a mensagem de saudação já foi enviada para o chat
 */
export const hasGreetingBeenSent = (chat: any): boolean => {
    if (!chat || !chat.messages) return false;
    
    // Verifica se há alguma mensagem do sistema indicando que a saudação foi enviada
    return chat.messages.some((msg: any) => 
        msg.sender === 'system' && 
        (msg.content?.includes('greeting_sent') || 
         msg.content?.includes('Saudação automática enviada'))
    );
};

/**
 * Verifica se a mensagem de ausência já foi enviada para o chat
 */
export const hasAwayMessageBeenSent = (chat: any): boolean => {
    if (!chat || !chat.messages) return false;
    
    // Verifica se há alguma mensagem do sistema indicando que a mensagem de ausência foi enviada
    return chat.messages.some((msg: any) => 
        msg.sender === 'system' && 
        (msg.content?.includes('away_sent') || 
         msg.content?.includes('Mensagem de ausência enviada'))
    );
};

/**
 * Envia mensagem de saudação automática
 */
export const sendGreetingMessage = async (
    config: ApiConfig,
    chatbotConfig: ChatbotConfig,
    chat: any
): Promise<boolean> => {
    if (!chatbotConfig.isEnabled || !chatbotConfig.greetingMessage) {
        return false;
    }

    if (hasGreetingBeenSent(chat)) {
        return false; // Já foi enviada
    }

    if (!isWithinBusinessHours(chatbotConfig)) {
        return false; // Fora do horário, não envia saudação
    }

    try {
        const success = await sendRealMessage(
            config,
            chat.contactNumber,
            chatbotConfig.greetingMessage
        );

        if (success) {
            console.log(`[Chatbot] ✅ Mensagem de saudação enviada para ${chat.contactName}`);
        }

        return success;
    } catch (error) {
        console.error(`[Chatbot] ❌ Erro ao enviar mensagem de saudação:`, error);
        return false;
    }
};

/**
 * Envia mensagem de ausência (fora do horário)
 */
export const sendAwayMessage = async (
    config: ApiConfig,
    chatbotConfig: ChatbotConfig,
    chat: any
): Promise<boolean> => {
    if (!chatbotConfig.isEnabled || !chatbotConfig.awayMessage) {
        return false;
    }

    if (hasAwayMessageBeenSent(chat)) {
        return false; // Já foi enviada
    }

    if (isWithinBusinessHours(chatbotConfig)) {
        return false; // Dentro do horário, não envia mensagem de ausência
    }

    try {
        const success = await sendRealMessage(
            config,
            chat.contactNumber,
            chatbotConfig.awayMessage
        );

        if (success) {
            console.log(`[Chatbot] ✅ Mensagem de ausência enviada para ${chat.contactName}`);
        }

        return success;
    } catch (error) {
        console.error(`[Chatbot] ❌ Erro ao enviar mensagem de ausência:`, error);
        return false;
    }
};

/**
 * Processa mensagens recebidas e envia respostas automáticas do chatbot se necessário
 */
export const processChatbotMessages = async (
    config: ApiConfig,
    chatbotConfig: ChatbotConfig,
    chat: any
): Promise<boolean> => {
    if (!chatbotConfig.isEnabled) {
        return false;
    }

    // Verifica se é um novo chat (primeira mensagem do usuário)
    const userMessages = chat.messages?.filter((m: any) => m.sender === 'user') || [];
    const isNewChat = userMessages.length === 1;

    if (!isNewChat) {
        return false; // Não é um novo chat
    }

    // Verifica horário e envia mensagem apropriada
    if (isWithinBusinessHours(chatbotConfig)) {
        // Dentro do horário: envia saudação
        return await sendGreetingMessage(config, chatbotConfig, chat);
    } else {
        // Fora do horário: envia mensagem de ausência
        return await sendAwayMessage(config, chatbotConfig, chat);
    }
};

