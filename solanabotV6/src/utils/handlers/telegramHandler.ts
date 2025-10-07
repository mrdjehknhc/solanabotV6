import axios from "axios";
import { config } from "../../config";

export interface TelegramMessage {
  type: 'token_bought' | 'token_sold' | 'breakeven_moved' | 'trailing_activated' | 'error' | 'daily_summary';
  data: {
    [key: string]: string | number;
  };
}

export interface TokenBoughtData {
  amount: number;
  token: string;
  price: number;
  links: string;
  percentage?: number;
}

export interface TokenSoldData {
  reason: string;
  pnl: number;
  pnl_sol: number;
  token: string;
  price: number;
}

export interface BreakevenMovedData {
  token: string;
  profit: number;
  new_sl: number;
}

export interface TrailingActivatedData {
  token: string;
  profit: number;
  distance: number;
}

export class TelegramNotificationManager {
  private botToken: string;
  private whitelist: string[];
  private enabled: boolean;

  constructor() {
    this.botToken = config.telegram.bot_token || "";
    this.whitelist = config.telegram.whitelist || [];
    this.enabled = Boolean(config.telegram.enabled && this.botToken && this.whitelist.length > 0);
    
    if (config.telegram.enabled && !this.botToken) {
      console.warn("⚠️ Telegram notifications enabled but bot_token not configured");
    }
    
    if (config.telegram.enabled && this.whitelist.length === 0) {
      console.warn("⚠️ Telegram notifications enabled but whitelist is empty");
    }

    console.log(`📱 [Telegram] Status: ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
    if (this.enabled) {
      console.log(`📱 [Telegram] Bot Token: ${this.botToken.slice(0, 10)}...`);
      console.log(`📱 [Telegram] Whitelisted Users: ${this.whitelist.length}`);
      console.log(`📱 [Telegram] Chat IDs: ${this.whitelist.join(', ')}`);
    }
  }

  /**
   * Отправляет сообщение всем пользователям из whitelist'а (ОПТИМИЗИРОВАННО)
   */
  private async sendMessageToAll(message: string): Promise<boolean> {
    if (!this.enabled) return false;

    // Параллельная отправка всем пользователям
    const sendPromises = this.whitelist.map(chatId => 
      this.sendMessage(chatId, message).catch(() => false)
    );

    const results = await Promise.allSettled(sendPromises);
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
    
    return successCount > 0;
  }

  /**
   * Отправляет сообщение конкретному пользователю
   */
  private async sendMessage(chatId: string, message: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
      
      const response = await axios.post(url, {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }, {
        timeout: 10000,
      });

      if (response.data.ok) {
        console.log(`✅ [Telegram] Message sent to ${chatId}`);
        return true;
      } else {
        console.error(`❌ [Telegram] Failed to send to ${chatId}:`, response.data);
        return false;
      }
    } catch (error) {
      console.error(`❌ [Telegram] Network error sending to ${chatId}:`, error instanceof Error ? error.message : error);
      return false;
    }
  }

  /**
   * Форматирует сообщение с помощью шаблона
   */
  private formatMessage(template: string, data: { [key: string]: string | number }): string {
    let formatted = template;
    
    for (const [key, value] of Object.entries(data)) {
      const placeholder = `{${key}}`;
      formatted = formatted.replace(new RegExp(placeholder, 'g'), String(value));
    }
    
    return formatted;
  }

  /**
   * Уведомление о покупке токена с информацией о балансе (ИСПРАВЛЕНО!)
   */
  async notifyTokenBought(data: TokenBoughtData): Promise<boolean> {
    if (!config.telegram.notifications.token_bought) return false;
    
    const template = config.telegram.messages.token_bought;
    
    // ИСПРАВЛЕНО: Форматируем percentage один раз перед использованием
    const percentageStr = data.percentage !== undefined ? data.percentage.toFixed(1) : "N/A";
    
    const messageData = {
      amount: data.amount.toFixed(4),
      token: `<code>${data.token.slice(0, 8)}...${data.token.slice(-4)}</code>`,
      price: data.price.toFixed(8),
      links: data.links,
      percentage: percentageStr,
    };
    
    let message = this.formatMessage(template, messageData);
    
    // Добавляем информацию о балансе если есть процент
    if (data.percentage !== undefined) {
      const buyMode = config.token_buy.buy_mode || "fixed";
      if (buyMode === "percentage") {
        message += `\n📈 <b>Balance Usage:</b> ${percentageStr}% of trading balance`;
      } else {
        message += `\n💰 <b>Balance Impact:</b> ${percentageStr}% of trading balance used`;
      }
    }
    
    return await this.sendMessageToAll(message);
  }

  /**
   * Уведомление о продаже токена
   */
  async notifyTokenSold(data: TokenSoldData): Promise<boolean> {
    if (!config.telegram.notifications.token_sold) return false;
    
    const template = config.telegram.messages.token_sold;
    const pnlEmoji = data.pnl >= 0 ? "💚" : "❌";
    
    const message = this.formatMessage(template, {
      reason: data.reason,
      pnl: data.pnl.toFixed(2),
      pnl_sol: data.pnl_sol.toFixed(4),
      token: `<code>${data.token.slice(0, 8)}...${data.token.slice(-4)}</code>`,
      price: data.price.toFixed(8),
    });
    
    return await this.sendMessageToAll(`${pnlEmoji} ${message}`);
  }

  /**
   * Уведомление о переносе в безубыток
   */
  async notifyBreakevenMoved(data: BreakevenMovedData): Promise<boolean> {
    if (!config.telegram.notifications.breakeven_moved) return false;
    
    const template = config.telegram.messages.breakeven_moved;
    const message = this.formatMessage(template, {
      token: `<code>${data.token.slice(0, 8)}...${data.token.slice(-4)}</code>`,
      profit: data.profit.toFixed(2),
      new_sl: data.new_sl.toFixed(2),
    });
    
    return await this.sendMessageToAll(message);
  }

  /**
   * Уведомление об активации трейлинг стопа
   */
  async notifyTrailingActivated(data: TrailingActivatedData): Promise<boolean> {
    if (!config.telegram.notifications.trailing_activated) return false;
    
    const template = config.telegram.messages.trailing_activated;
    const message = this.formatMessage(template, {
      token: `<code>${data.token.slice(0, 8)}...${data.token.slice(-4)}</code>`,
      profit: data.profit.toFixed(2),
      distance: data.distance.toFixed(2),
    });
    
    return await this.sendMessageToAll(message);
  }

  /**
   * Уведомление об ошибке
   */
  async notifyError(errorMessage: string): Promise<boolean> {
    if (!config.telegram.notifications.errors) return false;
    
    const template = config.telegram.messages.error;
    const message = this.formatMessage(template, {
      error_message: errorMessage,
    });
    
    return await this.sendMessageToAll(message);
  }

  /**
   * Ежедневная сводка с информацией о балансе
   */
  async notifyDailySummary(summary: {
    trades_count: number;
    total_pnl: number;
    total_pnl_sol: number;
    win_rate: number;
    starting_balance?: number;
    ending_balance?: number;
  }): Promise<boolean> {
    if (!config.telegram.notifications.daily_summary) return false;
    
    const winRateEmoji = summary.win_rate >= 50 ? "📈" : "📉";
    const pnlEmoji = summary.total_pnl >= 0 ? "💚" : "❌";
    
    let message = `📊 <b>DAILY TRADING SUMMARY</b>\n\n`;
    message += `🔢 Total Trades: ${summary.trades_count}\n`;
    message += `${pnlEmoji} Total P&L: ${summary.total_pnl.toFixed(2)}% (${summary.total_pnl_sol.toFixed(4)} SOL)\n`;
    message += `${winRateEmoji} Win Rate: ${summary.win_rate.toFixed(1)}%\n`;
    
    // Добавляем информацию о балансе если доступна
    if (summary.starting_balance && summary.ending_balance) {
      const balanceChange = summary.ending_balance - summary.starting_balance;
      const balanceChangeEmoji = balanceChange >= 0 ? "📈" : "📉";
      message += `\n💰 <b>Balance Change:</b>\n`;
      message += `   Start: ${summary.starting_balance.toFixed(4)} SOL\n`;
      message += `   End: ${summary.ending_balance.toFixed(4)} SOL\n`;
      message += `   ${balanceChangeEmoji} Change: ${balanceChange >= 0 ? '+' : ''}${balanceChange.toFixed(4)} SOL\n`;
    }
    
    message += `\n⏰ Date: ${new Date().toLocaleDateString()}\n`;
    message += `🤖 Enhanced Sniper Bot v2.0`;
    
    return await this.sendMessageToAll(message);
  }

  /**
   * Предупреждение о балансе
   */
  async notifyBalanceWarning(data: {
    balance: number;
    reason: string;
    tradingBalance?: number;
    nextBuyAmount?: number;
  }): Promise<boolean> {
    if (!config.telegram.notifications.balance_warnings) return false;
    
    const template = config.telegram.messages.balance_warning || "⚠️ BALANCE WARNING\n💰 Current: {balance} SOL\n📉 Reason: {reason}";
    
    let message = this.formatMessage(template, {
      balance: data.balance.toFixed(4),
      reason: data.reason,
    });
    
    // Добавляем дополнительную информацию если доступна
    if (data.tradingBalance !== undefined) {
      message += `\n📊 Trading Balance: ${data.tradingBalance.toFixed(4)} SOL`;
    }
    if (data.nextBuyAmount !== undefined) {
      message += `\n🎯 Next Buy Amount: ${data.nextBuyAmount.toFixed(4)} SOL`;
    }
    
    return await this.sendMessageToAll(message);
  }

  /**
   * Обновление статуса баланса
   */
  async notifyBalanceStatus(data: {
    balance: number;
    tradingBalance: number;
    nextBuyAmount: number;
    estimatedTrades: number;
    buyMode: string;
    percentage?: number;
  }): Promise<boolean> {
    let message = `💰 <b>BALANCE STATUS UPDATE</b>\n\n`;
    message += `📊 Total Balance: ${data.balance.toFixed(4)} SOL\n`;
    message += `🎯 Trading Balance: ${data.tradingBalance.toFixed(4)} SOL\n`;
    message += `💸 Next Buy Amount: ${data.nextBuyAmount.toFixed(4)} SOL\n`;
    message += `🔢 Estimated Trades: ${data.estimatedTrades}\n`;
    message += `⚙️ Buy Mode: ${data.buyMode.toUpperCase()}`;
    
    if (data.buyMode === "percentage" && data.percentage) {
      message += ` (${data.percentage}%)`;
    }
    
    message += `\n\n⏰ ${new Date().toLocaleString()}`;
    
    return await this.sendMessageToAll(message);
  }

  /**
   * Тест подключения с расширенной информацией (УЛУЧШЕНО!)
   */
  async testConnection(): Promise<boolean> {
    try {
      // Получаем информацию о боте
      const botInfo = await this.getBotInfo();
      
      // Пытаемся получить информацию о балансе
      let balanceInfo = "";
      try {
        const { balanceManager } = await import("./balanceManager");
        const stats = await balanceManager.getBalanceStats();
        
        balanceInfo = `💰 Current Balance: ${stats.currentBalance.toFixed(4)} SOL\n` +
                     `📊 Trading Balance: ${stats.tradingBalance.toFixed(4)} SOL\n` +
                     `🎯 Buy Mode: ${stats.buyMode.toUpperCase()}\n`;
      } catch (error) {
        // Если балансы недоступны - не критично
        balanceInfo = `💰 Balance info unavailable\n`;
      }
      
      const testMessage = 
        `🤖 <b>Enhanced Sniper Bot Connected!</b>\n\n` +
        `✅ Telegram notifications are working\n` +
        `🔗 Bot: @${botInfo.username}\n` +
        `🆔 Bot ID: <code>${botInfo.id}</code>\n\n` +
        balanceInfo +
        `⚙️ Ready for trading!\n\n` +
        `⏰ ${new Date().toLocaleString()}`;
      
      return await this.sendMessageToAll(testMessage);
    } catch (error) {
      console.error("❌ [Telegram] Test connection failed:", error);
      
      // Fallback сообщение если что-то пошло не так
      const fallbackMessage = 
        `🤖 <b>Enhanced Sniper Bot Connected!</b>\n\n` +
        `✅ Telegram notifications are working\n` +
        `⚠️ Unable to fetch bot details\n\n` +
        `⏰ ${new Date().toLocaleString()}`;
      
      return await this.sendMessageToAll(fallbackMessage);
    }
  }

  /**
   * Проверка доступности пользователя по chat_id
   */
  isUserAuthorized(chatId: string): boolean {
    return this.whitelist.includes(chatId);
  }

  /**
   * Получить список авторизованных пользователей
   */
  getWhitelist(): string[] {
    return [...this.whitelist];
  }

  /**
   * Получить информацию о боте
   */
  async getBotInfo(): Promise<any> {
    if (!this.botToken) {
      throw new Error("Bot token not configured");
    }

    try {
      const url = `https://api.telegram.org/bot${this.botToken}/getMe`;
      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.data.ok) {
        return response.data.result;
      } else {
        throw new Error(`Telegram API error: ${response.data.description}`);
      }
    } catch (error) {
      throw new Error(`Failed to get bot info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Проверить статус бота и whitelist
   */
  async getStatus(): Promise<{
    enabled: boolean;
    botToken: boolean;
    whitelistCount: number;
    botInfo?: any;
    error?: string;
  }> {
    const status = {
      enabled: this.enabled,
      botToken: Boolean(this.botToken),
      whitelistCount: this.whitelist.length,
    };

    try {
      if (this.botToken) {
        const botInfo = await this.getBotInfo();
        return { ...status, botInfo };
      }
    } catch (error) {
      return { 
        ...status, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }

    return status;
  }
}

// Экспорт singleton instance
export const telegramManager = new TelegramNotificationManager();