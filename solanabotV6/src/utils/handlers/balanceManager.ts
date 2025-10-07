// src/utils/handlers/balanceManager.ts
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { validateEnv } from "../env-validator";
import { config } from "../../config";

export interface BalanceInfo {
  solBalance: number;
  lamportsBalance: number;
  availableForTrading: number;
  calculatedBuyAmount: number;
  percentageUsed?: number;
  reservedAmount: number;
}

export interface BalanceStats {
  currentBalance: number;
  reservedAmount: number;
  tradingBalance: number;
  nextBuyAmount: number;
  buyMode: string;
  balancePercentage: number;
  estimatedTrades: number;
}

export class BalanceManager {
  private connection: Connection;
  private walletPublicKey: PublicKey;
  private balanceCache: BalanceInfo | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 2000; // 2 seconds cache

  constructor() {
    const env = validateEnv();
    this.connection = new Connection(env.HELIUS_HTTPS_URI, "confirmed");
    this.walletPublicKey = new PublicKey(env.SNIPEROO_PUBKEY);
  }

  /**
   * Get current SOL balance with caching
   */
  async getBalance(forceRefresh: boolean = false): Promise<BalanceInfo> {
    const now = Date.now();
    
    // Use cached balance if recent and not forcing refresh
    if (!forceRefresh && this.balanceCache && (now - this.cacheTimestamp) < this.CACHE_DURATION) {
      // ИСПРАВЛЕНО: Не логируем при использовании кеша (избегаем спама)
      return this.balanceCache;
    }

    try {
      const lamportsBalance = await this.connection.getBalance(this.walletPublicKey);
      const solBalance = lamportsBalance / LAMPORTS_PER_SOL;
      
      // Calculate reserved amount for fees and safety
      const reservedAmount = config.token_buy.reserve_sol || 0.15;
      
      // Calculate available balance for trading (minus reserve)
      const availableForTrading = Math.max(0, solBalance - reservedAmount);
      
      // Calculate buy amount based on mode
      const { buyAmount, percentageUsed } = this.calculateBuyAmount(availableForTrading);
      
      const balanceInfo: BalanceInfo = {
        solBalance,
        lamportsBalance,
        availableForTrading,
        calculatedBuyAmount: buyAmount,
        percentageUsed,
        reservedAmount,
      };

      // Update cache
      this.balanceCache = balanceInfo;
      this.cacheTimestamp = now;

      // ИСПРАВЛЕНО: Логируем ТОЛЬКО при реальном запросе (не из кеша)
      this.logBalanceInfo(balanceInfo);

      return balanceInfo;
    } catch (error) {
      console.error("❌ [Balance Manager] Error fetching balance:", error);
      throw error;
    }
  }

  /**
   * Calculate buy amount based on configured mode
   */
  private calculateBuyAmount(availableBalance: number): {
    buyAmount: number;
    percentageUsed?: number;
  } {
    const buyConfig = config.token_buy;
    
    if (buyConfig.buy_mode === "percentage") {
      // Percentage-based buying
      const percentageAmount = (availableBalance * buyConfig.balance_percentage) / 100;
      
      // Apply min/max limits
      const minAmount = buyConfig.min_sol_amount || 0.01;
      const maxAmount = buyConfig.max_sol_amount || 1.0;
      
      let clampedAmount = Math.max(minAmount, Math.min(percentageAmount, maxAmount));
      
      // Ensure we don't exceed available balance
      clampedAmount = Math.min(clampedAmount, availableBalance);
      
      return {
        buyAmount: clampedAmount,
        percentageUsed: buyConfig.balance_percentage,
      };
    } else {
      // Fixed mode (legacy)
      const fixedAmount = buyConfig.sol_amount || 0.1;
      const finalAmount = Math.min(fixedAmount, availableBalance);
      
      return {
        buyAmount: finalAmount,
        percentageUsed: availableBalance > 0 ? (finalAmount / availableBalance) * 100 : 0,
      };
    }
  }

  /**
   * Log balance information - ИСПРАВЛЕНО: вызывается только при реальном запросе
   */
  private logBalanceInfo(balance: BalanceInfo): void {
    console.log(`💰 Balance: ${balance.solBalance.toFixed(4)} | Next: ${balance.calculatedBuyAmount.toFixed(4)} SOL`);
  }

  /**
   * Check if we have enough balance for a trade
   */
  async canAffordTrade(): Promise<{
    canTrade: boolean;
    reason?: string;
    availableAmount?: number;
    recommendedAmount?: number;
  }> {
    try {
      const balance = await this.getBalance();
      
      if (balance.solBalance < balance.reservedAmount) {
        return {
          canTrade: false,
          reason: `Insufficient balance (need ${balance.reservedAmount} SOL reserve)`,
          availableAmount: balance.solBalance,
        };
      }
      
      if (balance.calculatedBuyAmount <= 0) {
        return {
          canTrade: false,
          reason: "Insufficient balance after reserve",
          availableAmount: balance.availableForTrading,
        };
      }
      
      const minAmount = config.token_buy.min_sol_amount || 0.01;
      if (balance.calculatedBuyAmount < minAmount) {
        return {
          canTrade: false,
          reason: `Amount below minimum (${minAmount} SOL)`,
          availableAmount: balance.calculatedBuyAmount,
          recommendedAmount: minAmount,
        };
      }

      return {
        canTrade: true,
        availableAmount: balance.calculatedBuyAmount,
      };
    } catch (error) {
      return {
        canTrade: false,
        reason: "Error checking balance",
      };
    }
  }

  /**
   * Get optimal buy amount for next trade
   */
  async getOptimalBuyAmount(): Promise<number> {
    const balance = await this.getBalance();
    return balance.calculatedBuyAmount;
  }

  /**
   * Clear balance cache (force refresh on next call)
   */
  clearCache(): void {
    this.balanceCache = null;
    this.cacheTimestamp = 0;
    console.log("🧹 [Balance Manager] Cache cleared");
  }

  /**
   * Get comprehensive balance statistics
   */
  async getBalanceStats(): Promise<BalanceStats> {
    const balance = await this.getBalance();
    
    const estimatedTrades = balance.calculatedBuyAmount > 0 
      ? Math.floor(balance.availableForTrading / balance.calculatedBuyAmount)
      : 0;
    
    return {
      currentBalance: balance.solBalance,
      reservedAmount: balance.reservedAmount,
      tradingBalance: balance.availableForTrading,
      nextBuyAmount: balance.calculatedBuyAmount,
      buyMode: config.token_buy.buy_mode || "fixed",
      balancePercentage: config.token_buy.balance_percentage || 0,
      estimatedTrades,
    };
  }

  /**
   * Simulate different percentage scenarios
   */
  async simulatePercentages(percentages: number[]): Promise<Array<{
    percentage: number;
    buyAmount: number;
    numberOfTrades: number;
    totalUsage: number;
  }>> {
    const balance = await this.getBalance();
    
    return percentages.map(percentage => {
      const rawAmount = (balance.availableForTrading * percentage) / 100;
      
      const buyAmount = Math.max(
        config.token_buy.min_sol_amount || 0.01,
        Math.min(
          rawAmount,
          config.token_buy.max_sol_amount || 1.0
        )
      );
      
      const numberOfTrades = Math.floor(balance.availableForTrading / buyAmount);
      const totalUsage = numberOfTrades * buyAmount;
      
      return {
        percentage,
        buyAmount,
        numberOfTrades,
        totalUsage,
      };
    });
  }

  /**
   * Check for low balance and send warnings if needed
   */
  async checkBalanceWarnings(): Promise<void> {
    const balance = await this.getBalance();
    const config_buy = config.token_buy;
    
    // Warning thresholds
    const criticalThreshold = config_buy.reserve_sol * 2; // 2x reserve
    const lowThreshold = config_buy.reserve_sol * 5; // 5x reserve
    
    try {
      // Dynamic import to avoid circular dependency
      const { telegramManager } = await import("./telegramHandler");
      
      if (balance.solBalance <= criticalThreshold) {
        await telegramManager.notifyError(
          `🚨 CRITICAL: Balance very low (${balance.solBalance.toFixed(4)} SOL). Trading will stop soon!`
        );
      } else if (balance.solBalance <= lowThreshold) {
        await telegramManager.notifyError(
          `⚠️ WARNING: Low balance detected (${balance.solBalance.toFixed(4)} SOL). Consider refunding.`
        );
      }
      
      // Check if calculated buy amount is getting too small
      const minEffectiveAmount = 0.005; // Less than 0.005 SOL is probably not worth it
      if (balance.calculatedBuyAmount < minEffectiveAmount && balance.calculatedBuyAmount > 0) {
        await telegramManager.notifyError(
          `💰 Buy amount very small (${balance.calculatedBuyAmount.toFixed(6)} SOL). Consider adjusting percentage or refunding wallet.`
        );
      }
    } catch (error) {
      console.error("❌ [Balance Manager] Error sending balance warnings:", error);
    }
  }

  /**
   * Get balance health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    message: string;
    details: {
      balance: number;
      tradingBalance: number;
      nextBuyAmount: number;
      possibleTrades: number;
    };
  }> {
    const balance = await this.getBalance();
    const criticalThreshold = balance.reservedAmount * 2;
    const warningThreshold = balance.reservedAmount * 5;
    
    const possibleTrades = balance.calculatedBuyAmount > 0 
      ? Math.floor(balance.availableForTrading / balance.calculatedBuyAmount)
      : 0;
    
    const details = {
      balance: balance.solBalance,
      tradingBalance: balance.availableForTrading,
      nextBuyAmount: balance.calculatedBuyAmount,
      possibleTrades,
    };
    
    if (balance.solBalance <= criticalThreshold) {
      return {
        status: 'critical',
        message: 'Balance critically low - trading will stop soon',
        details,
      };
    } else if (balance.solBalance <= warningThreshold || possibleTrades < 3) {
      return {
        status: 'warning',
        message: 'Balance getting low or limited trades remaining',
        details,
      };
    } else {
      return {
        status: 'healthy',
        message: 'Balance healthy for continued trading',
        details,
      };
    }
  }

  /**
   * Format balance info for display
   */
  async getFormattedBalanceInfo(): Promise<string> {
    const balance = await this.getBalance();
    const buyMode = config.token_buy.buy_mode || "fixed";
    
    let info = `💰 **Balance Information**\n`;
    info += `📊 Total Balance: ${balance.solBalance.toFixed(4)} SOL\n`;
    info += `🔒 Reserved: ${balance.reservedAmount.toFixed(4)} SOL\n`;
    info += `📈 Trading Balance: ${balance.availableForTrading.toFixed(4)} SOL\n`;
    info += `🎯 Next Buy Amount: ${balance.calculatedBuyAmount.toFixed(4)} SOL\n`;
    info += `⚙️ Mode: ${buyMode.toUpperCase()}`;
    
    if (buyMode === "percentage") {
      info += ` (${config.token_buy.balance_percentage}%)\n`;
    } else {
      info += `\n`;
    }
    
    const possibleTrades = balance.calculatedBuyAmount > 0 
      ? Math.floor(balance.availableForTrading / balance.calculatedBuyAmount)
      : 0;
    info += `🔢 Estimated Trades: ${possibleTrades}`;
    
    return info;
  }
}

// Export singleton instance
export const balanceManager = new BalanceManager();