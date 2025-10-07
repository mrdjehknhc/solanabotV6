// src/core/tradingEngine.ts
import { enhancedSniperooHandler } from "../utils/handlers/enhancedSniperooHandler";
import { balanceManager } from "../utils/handlers/balanceManager";
import { telegramManager } from "../utils/handlers/telegramHandler";
import { priceFeedHandler } from "../utils/handlers/priceFeedHandler";
import { positionManager } from "../utils/handlers/positionManager";
import { config } from "../config";

export interface TradeResult {
  success: boolean;
  tokenAddress: string;
  amount: number;
  price?: number;
  transactionId?: string;
  error?: string;
}

export interface TradeDecision {
  shouldTrade: boolean;
  reason: string;
  tokenAddress?: string;
  buyAmount?: number;
}

export class TradingEngine {
  private isTrading = false;
  private tradingQueue: string[] = [];
  private readonly MAX_QUEUE_SIZE = 5;

  /**
   * Execute trade with full pipeline
   */
  async executeTrade(tokenAddress: string): Promise<TradeResult> {
    if (this.isTrading) {
      // Add to queue if space available
      if (this.tradingQueue.length < this.MAX_QUEUE_SIZE) {
        this.tradingQueue.push(tokenAddress);
        console.log(`📋 [Trading Engine] Added ${tokenAddress.slice(0, 8)}... to queue (${this.tradingQueue.length})`);
      }
      return { 
        success: false, 
        tokenAddress, 
        amount: 0, 
        error: "Trading in progress" 
      };
    }

    this.isTrading = true;
    
    try {
      // ИСПРАВЛЕНО: Полная проверка включая баланс
      const canTrade = await this.quickTradeCheck(tokenAddress);
      if (!canTrade.shouldTrade) {
        return { 
          success: false, 
          tokenAddress, 
          amount: 0, 
          error: canTrade.reason 
        };
      }

      const buyAmount = canTrade.buyAmount!;
      console.log(`🎯 [Trading Engine] Executing: ${buyAmount.toFixed(4)} SOL -> ${tokenAddress.slice(0, 8)}...`);

      // Execute purchase
      const purchased = await enhancedSniperooHandler.buyToken(
        tokenAddress, 
        buyAmount, 
        config.advanced_trading.enabled
      );
      
      if (!purchased) {
        return { 
          success: false, 
          tokenAddress, 
          amount: buyAmount, 
          error: "Purchase failed" 
        };
      }

      // Get price and send notifications in parallel
      const [currentPrice] = await Promise.allSettled([
        priceFeedHandler.getTokenPrice(tokenAddress)
      ]);
      
      const price = currentPrice.status === 'fulfilled' ? currentPrice.value || 0 : 0;

      // Add to position tracking if advanced trading enabled
      if (config.advanced_trading.enabled && price > 0) {
        positionManager.addPosition(tokenAddress, price, buyAmount);
      }

      // Send success notification
      this.sendTradeNotification(tokenAddress, buyAmount, price).catch(console.error);

      console.log(`✅ [Trading Engine] Trade completed: ${buyAmount.toFixed(4)} SOL`);
      
      return {
        success: true,
        tokenAddress,
        amount: buyAmount,
        price,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ [Trading Engine] Trade failed:`, errorMsg);
      
      await telegramManager.notifyError(`Trade execution failed: ${errorMsg}`).catch(() => {});
      
      return {
        success: false,
        tokenAddress,
        amount: 0,
        error: errorMsg,
      };
      
    } finally {
      this.isTrading = false;
      // Process next item in queue
      this.processQueue();
    }
  }

  /**
   * Check if token can be traded (alias for quickTradeCheck for compatibility)
   */
  async canTrade(tokenAddress: string): Promise<TradeDecision> {
    return this.quickTradeCheck(tokenAddress);
  }

  /**
   * Quick trade feasibility check (ИСПРАВЛЕНО - добавлена проверка баланса!)
   */
  async quickTradeCheck(tokenAddress: string): Promise<TradeDecision> {
    try {
      // Basic validation
      if (!tokenAddress?.trim() || tokenAddress.length < 32) {
        return { shouldTrade: false, reason: "Invalid token address" };
      }

      // ИСПРАВЛЕНО: Проверяем может ли бот позволить себе сделку
      const affordCheck = await balanceManager.canAffordTrade();
      
      if (!affordCheck.canTrade) {
        return { 
          shouldTrade: false, 
          reason: affordCheck.reason || "Insufficient balance" 
        };
      }

      // Get buy amount
      const buyAmount = await balanceManager.getOptimalBuyAmount();
      
      // ИСПРАВЛЕНО: Дополнительная проверка что buyAmount > 0
      if (buyAmount <= 0) {
        return {
          shouldTrade: false,
          reason: "Buy amount is zero or negative",
        };
      }
      
      // ИСПРАВЛЕНО: Проверка минимального amount
      const minAmount = config.token_buy.min_sol_amount || 0.01;
      if (buyAmount < minAmount) {
        return {
          shouldTrade: false,
          reason: `Buy amount (${buyAmount.toFixed(4)} SOL) below minimum (${minAmount} SOL)`,
        };
      }
      
      return {
        shouldTrade: true,
        reason: "All checks passed",
        tokenAddress,
        buyAmount,
      };

    } catch (error) {
      return {
        shouldTrade: false,
        reason: `Pre-check failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  }

  /**
   * Process queued trades
   */
  private processQueue(): void {
    if (this.tradingQueue.length === 0 || this.isTrading) return;
    
    const nextToken = this.tradingQueue.shift();
    if (nextToken) {
      console.log(`🚀 [Trading Engine] Processing queued token: ${nextToken.slice(0, 8)}...`);
      // Process without await to avoid blocking
      this.executeTrade(nextToken).catch(console.error);
    }
  }

  /**
   * Send trade notification
   */
  private async sendTradeNotification(tokenAddress: string, amount: number, price: number): Promise<void> {
    try {
      // ИСПРАВЛЕНО: Получаем процент использования баланса
      const balance = await balanceManager.getBalance();
      const percentageUsed = balance.percentageUsed;
      
      await telegramManager.notifyTokenBought({
        amount,
        token: tokenAddress,
        price,
        links: this.generateTokenLinks(tokenAddress),
        percentage: percentageUsed, // Передаем реальный процент
      });
    } catch (error) {
      console.error("❌ [Trading Engine] Notification failed:", error);
    }
  }

  /**
   * Generate token analysis links
   */
  private generateTokenLinks(tokenAddress: string): string {
    const links = [
      `🔗 [GMGN](https://gmgn.ai/sol/token/${tokenAddress})`,
      `📊 [BullX](https://neo.bullx.io/terminal?chainId=1399811149&address=${tokenAddress})`,
      `🔍 [Solscan](https://solscan.io/token/${tokenAddress})`,
    ];
    return links.join(" | ");
  }

  /**
   * Emergency stop all trading activities
   */
  async emergencyStop(): Promise<void> {
    console.log(`🚨 [Trading Engine] Emergency stop initiated`);
    
    this.isTrading = false;
    this.tradingQueue.length = 0; // Clear queue
    
    try {
      // Sell all positions
      await enhancedSniperooHandler.emergencySellAll();
      
      await telegramManager.notifyError(
        "🚨 Emergency stop executed - all trading stopped, positions sold"
      );
      
      console.log(`✅ [Trading Engine] Emergency stop completed`);
      
    } catch (error) {
      console.error(`❌ [Trading Engine] Emergency stop failed:`, error);
      await telegramManager.notifyError(
        `Emergency stop failed: ${error instanceof Error ? error.message : "Unknown error"}`
      ).catch(() => {});
    }
  }

  /**
   * Get current trading status
   */
  getStatus(): {
    isTrading: boolean;
    queueSize: number;
    readyToTrade: boolean;
  } {
    return {
      isTrading: this.isTrading,
      queueSize: this.tradingQueue.length,
      readyToTrade: !this.isTrading && this.tradingQueue.length < this.MAX_QUEUE_SIZE,
    };
  }

  /**
   * Get queue information
   */
  getQueueInfo(): {
    size: number;
    tokens: string[];
    maxSize: number;
  } {
    return {
      size: this.tradingQueue.length,
      tokens: this.tradingQueue.map(addr => addr.slice(0, 8) + "..."),
      maxSize: this.MAX_QUEUE_SIZE,
    };
  }

  /**
   * Clear trading queue
   */
  clearQueue(): void {
    const clearedCount = this.tradingQueue.length;
    this.tradingQueue.length = 0;
    console.log(`🧹 [Trading Engine] Cleared ${clearedCount} items from queue`);
  }

  /**
   * Health check for trading engine
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    status: string;
    details: {
      isTrading: boolean;
      queueSize: number;
      balanceOk: boolean;
      apiOk: boolean;
    };
  }> {
    try {
      const [balanceCheck, apiCheck] = await Promise.allSettled([
        balanceManager.canAffordTrade(),
        enhancedSniperooHandler.healthCheck()
      ]);

      const balanceOk = balanceCheck.status === 'fulfilled' && balanceCheck.value.canTrade;
      const apiOk = apiCheck.status === 'fulfilled' && apiCheck.value.connected;

      const healthy = balanceOk && apiOk && !this.isTrading;
      
      return {
        healthy,
        status: healthy ? "Ready for trading" : "Not ready for trading",
        details: {
          isTrading: this.isTrading,
          queueSize: this.tradingQueue.length,
          balanceOk,
          apiOk,
        }
      };
    } catch (error) {
      return {
        healthy: false,
        status: "Health check failed",
        details: {
          isTrading: this.isTrading,
          queueSize: this.tradingQueue.length,
          balanceOk: false,
          apiOk: false,
        }
      };
    }
  }
}

// Export singleton instance
export const tradingEngine = new TradingEngine();