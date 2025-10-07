import { config } from "../../config";

// Интерфейсы для уведомлений
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

export interface Position {
  tokenAddress: string;
  entryPrice: number;
  entryAmount: number; // SOL amount
  remainingAmount: number; // Remaining SOL amount
  entryTime: number;
  
  // Risk management
  currentStopLoss: number; // Current stop loss price
  isBreakevenMoved: boolean;
  isTrailingActive: boolean;
  highestPrice: number; // For trailing stop
  
  // Take profit grid tracking
  executedTpLevels: number[]; // Which TP levels have been executed
  totalSold: number; // Total percentage sold
}

export interface PriceData {
  price: number;
  timestamp: number;
}

export class AdvancedPositionManager {
  private positions: Map<string, Position> = new Map();
  private priceCheckInterval: NodeJS.Timeout | null = null;
  
  // Динамические импорты для избежания циклических зависимостей
  private async getTelegramManager() {
    const { telegramManager } = await import("./telegramHandler");
    return telegramManager;
  }
  
  constructor() {
    // Start price monitoring if advanced trading is enabled
    if (config.advanced_trading.enabled) {
      this.startPriceMonitoring();
    }
  }

  /**
   * Add new position to tracking
   */
  addPosition(tokenAddress: string, entryPrice: number, entryAmount: number): void {
    const position: Position = {
      tokenAddress,
      entryPrice,
      entryAmount,
      remainingAmount: entryAmount,
      entryTime: Date.now(),
      currentStopLoss: entryPrice * (1 - config.advanced_trading.risk_management.initial_stop_loss_percent / 100),
      isBreakevenMoved: false,
      isTrailingActive: false,
      highestPrice: entryPrice,
      executedTpLevels: [],
      totalSold: 0,
    };

    this.positions.set(tokenAddress, position);
    console.log(`📊 [Position Manager] Position added for token: ${tokenAddress}`);
    console.log(`💰 Entry: $${entryPrice.toFixed(8)}, Amount: ${entryAmount} SOL`);
    console.log(`🛡️ Initial Stop Loss: $${position.currentStopLoss.toFixed(8)}`);
  }

  /**
   * Remove position from tracking
   */
  removePosition(tokenAddress: string): void {
    if (this.positions.delete(tokenAddress)) {
      console.log(`📊 [Position Manager] Position removed for token: ${tokenAddress}`);
    }
  }

  /**
   * Get all tracked positions
   */
  getPositions(): Map<string, Position> {
    return this.positions;
  }

  /**
   * Get specific position
   */
  getPosition(tokenAddress: string): Position | undefined {
    return this.positions.get(tokenAddress);
  }

  /**
   * Update position with new price data
   */
  async updatePosition(tokenAddress: string, currentPrice: number): Promise<void> {
    const position = this.positions.get(tokenAddress);
    if (!position) return;

    const profitPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    
    // Update highest price for trailing stop
    if (currentPrice > position.highestPrice) {
      position.highestPrice = currentPrice;
    }

    console.log(`📊 [${tokenAddress.slice(0, 8)}...] Price: $${currentPrice.toFixed(8)}, P&L: ${profitPercent.toFixed(2)}%`);

    // Check for stop loss
    if (await this.checkStopLoss(tokenAddress, currentPrice, profitPercent)) {
      return; // Position was closed
    }

    // Check breakeven move
    await this.checkBreakevenMove(tokenAddress, currentPrice, profitPercent);

    // Check trailing stop activation
    await this.checkTrailingStopActivation(tokenAddress, currentPrice, profitPercent);

    // Update trailing stop if active
    await this.updateTrailingStop(tokenAddress, currentPrice, profitPercent);

    // Check take profit grid
    await this.checkTakeProfitGrid(tokenAddress, currentPrice, profitPercent);
  }

  /**
   * Check if stop loss should be triggered
   */
  private async checkStopLoss(tokenAddress: string, currentPrice: number, profitPercent: number): Promise<boolean> {
    const position = this.positions.get(tokenAddress);
    if (!position) return false;

    if (currentPrice <= position.currentStopLoss) {
      console.log(`🛑 [Position Manager] Stop Loss triggered for ${tokenAddress}`);
      console.log(`💸 Selling remaining ${position.remainingAmount} SOL at $${currentPrice.toFixed(8)}`);
      
      // Calculate P&L
      const pnlPercent = profitPercent;
      const pnlSol = position.remainingAmount * (currentPrice / position.entryPrice - 1);
      
      // Execute sell
      const sellSuccess = await this.executeSell(tokenAddress, 100 - position.totalSold, currentPrice, "Stop Loss");
      
      if (sellSuccess) {
        // Send notification
        const telegramManager = await this.getTelegramManager();
        await telegramManager.notifyTokenSold({
          reason: position.isTrailingActive ? "Trailing Stop Loss" : "Stop Loss",
          pnl: pnlPercent,
          pnl_sol: pnlSol,
          token: tokenAddress,
          price: currentPrice,
        });
        
        // Remove position
        this.removePosition(tokenAddress);
        return true;
      } else {
        console.error(`❌ [Position Manager] Failed to execute stop loss for ${tokenAddress}`);
        return false;
      }
    }
    
    return false;
  }

  /**
   * Check if we should move stop loss to breakeven
   */
  private async checkBreakevenMove(tokenAddress: string, currentPrice: number, profitPercent: number): Promise<void> {
    const position = this.positions.get(tokenAddress);
    if (!position || position.isBreakevenMoved) return;
    
    const breakevenConfig = config.advanced_trading.risk_management.breakeven;
    if (!breakevenConfig.enabled) return;

    if (profitPercent >= breakevenConfig.trigger_profit_percent) {
      const newStopLoss = position.entryPrice * (1 + breakevenConfig.breakeven_offset_percent / 100);
      position.currentStopLoss = newStopLoss;
      position.isBreakevenMoved = true;
      
      console.log(`⚡ [Position Manager] Breakeven activated for ${tokenAddress}`);
      console.log(`🛡️ New Stop Loss: $${newStopLoss.toFixed(8)} (+${breakevenConfig.breakeven_offset_percent}%)`);
      
      const telegramManager = await this.getTelegramManager();
      await telegramManager.notifyBreakevenMoved({
        token: tokenAddress,
        profit: profitPercent,
        new_sl: breakevenConfig.breakeven_offset_percent,
      });
    }
  }

  /**
   * Check if trailing stop should be activated
   */
  private async checkTrailingStopActivation(tokenAddress: string, currentPrice: number, profitPercent: number): Promise<void> {
    const position = this.positions.get(tokenAddress);
    if (!position || position.isTrailingActive) return;
    
    const trailingConfig = config.advanced_trading.risk_management.trailing_stop;
    if (!trailingConfig.enabled) return;

    if (profitPercent >= trailingConfig.activation_profit_percent) {
      position.isTrailingActive = true;
      
      console.log(`🚀 [Position Manager] Trailing stop activated for ${tokenAddress}`);
      console.log(`📉 Trailing distance: ${trailingConfig.trailing_distance_percent}%`);
      
      const telegramManager = await this.getTelegramManager();
      await telegramManager.notifyTrailingActivated({
        token: tokenAddress,
        profit: profitPercent,
        distance: trailingConfig.trailing_distance_percent,
      });
    }
  }

  /**
   * Update trailing stop if active
   */
  private async updateTrailingStop(tokenAddress: string, currentPrice: number, profitPercent: number): Promise<void> {
    const position = this.positions.get(tokenAddress);
    if (!position || !position.isTrailingActive) return;
    
    const trailingConfig = config.advanced_trading.risk_management.trailing_stop;
    const trailingStopPrice = position.highestPrice * (1 - trailingConfig.trailing_distance_percent / 100);
    
    // Only move stop loss up, never down
    if (trailingStopPrice > position.currentStopLoss) {
      position.currentStopLoss = trailingStopPrice;
      console.log(`📈 [Position Manager] Trailing stop updated for ${tokenAddress}: $${trailingStopPrice.toFixed(8)}`);
    }
  }

  /**
   * Check take profit grid levels
   */
  private async checkTakeProfitGrid(tokenAddress: string, currentPrice: number, profitPercent: number): Promise<void> {
    const position = this.positions.get(tokenAddress);
    if (!position) return;
    
    const tpConfig = config.advanced_trading.take_profit_grid;
    if (!tpConfig.enabled) return;

    for (let i = 0; i < tpConfig.levels.length; i++) {
      const level = tpConfig.levels[i];
      
      // Skip if already executed
      if (position.executedTpLevels.includes(i)) continue;
      
      // Skip if profit hasn't reached this level
      if (profitPercent < level.profit_percent) continue;
      
      console.log(`💰 [Position Manager] Take Profit Level ${i + 1} triggered for ${tokenAddress}`);
      console.log(`📊 Selling ${level.sell_percent}% at ${level.profit_percent}% profit`);
      
      // Execute sell with success check
      const sellSuccess = await this.executeSell(tokenAddress, level.sell_percent, currentPrice, level.description);
      
      // Only update tracking if sell was successful
      if (sellSuccess) {
        // Mark level as executed
        position.executedTpLevels.push(i);
        position.totalSold += level.sell_percent;
        position.remainingAmount = position.entryAmount * (1 - position.totalSold / 100);
        
        // Calculate P&L for this partial sale
        const partialAmount = position.entryAmount * (level.sell_percent / 100);
        const pnlPercent = profitPercent;
        const pnlSol = partialAmount * (currentPrice / position.entryPrice - 1);
        
        // Send notification
        const telegramManager = await this.getTelegramManager();
        await telegramManager.notifyTokenSold({
          reason: `Take Profit Level ${i + 1} (${level.description})`,
          pnl: pnlPercent,
          pnl_sol: pnlSol,
          token: tokenAddress,
          price: currentPrice,
        });
        
        // Remove position if fully sold
        if (position.totalSold >= 99.9) {
          console.log(`✅ [Position Manager] Position fully closed for ${tokenAddress}`);
          this.removePosition(tokenAddress);
          return;
        }
      } else {
        // Log failure and send error notification
        console.error(`❌ [Position Manager] Failed to execute TP level ${i + 1} for ${tokenAddress}`);
        
        const telegramManager = await this.getTelegramManager();
        await telegramManager.notifyError(
          `Failed to execute Take Profit Level ${i + 1} for ${tokenAddress.slice(0, 8)}...\n` +
          `Price: $${currentPrice.toFixed(8)}, Target: ${level.profit_percent}%`
        );
      }
    }
  }

  /**
   * Execute sell order - REAL IMPLEMENTATION
   */
  private async executeSell(
    tokenAddress: string, 
    percentageToSell: number, 
    currentPrice: number, 
    reason: string
  ): Promise<boolean> {
    console.log(`💸 [Position Manager] Executing sell: ${percentageToSell}% of ${tokenAddress}`);
    console.log(`📝 Reason: ${reason}`);
    console.log(`💲 Price: $${currentPrice.toFixed(8)}`);
    
    try {
      // Get position ID from Sniperoo
      const { enhancedSniperooHandler } = await import("./enhancedSniperooHandler");
      const positions = await enhancedSniperooHandler.getWalletHoldings();
      
      if (!positions || positions.length === 0) {
        console.error(`❌ [Position Manager] No positions found in Sniperoo for ${tokenAddress}`);
        return false;
      }
      
      // Find position by token address
      const position = positions.find(pos => pos.tokenAddress === tokenAddress);
      
      if (!position) {
        console.error(`❌ [Position Manager] Position not found in Sniperoo for ${tokenAddress}`);
        console.log(`ℹ️  Available positions: ${positions.map(p => p.tokenAddress.slice(0, 8)).join(', ')}`);
        return false;
      }
      
      console.log(`🔍 [Position Manager] Found position ID: ${position.positionId} for ${tokenAddress.slice(0, 8)}...`);
      
      // Execute real sell via Sniperoo API
      const sellResult = await enhancedSniperooHandler.sellToken({
        positionId: position.positionId,
        percentage: percentageToSell,
        reason: reason,
        urgency: 'high'
      });
      
      if (sellResult.success) {
        console.log(`✅ [Position Manager] Successfully sold ${percentageToSell}% of ${tokenAddress}`);
        if (sellResult.transactionId) {
          console.log(`🔗 Transaction: ${sellResult.transactionId}`);
        }
        return true;
      } else {
        console.error(`❌ [Position Manager] Sell failed: ${sellResult.error || 'Unknown error'}`);
        return false;
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ [Position Manager] Error executing sell: ${errorMsg}`);
      return false;
    }
  }

  /**
   * Start price monitoring for all positions
   */
  private startPriceMonitoring(): void {
    // Check every 5 seconds (optimized for memcoins)
    this.priceCheckInterval = setInterval(async () => {
      if (this.positions.size === 0) return;
      
      console.log(`📊 [Position Manager] Checking ${this.positions.size} positions...`);
      
      for (const [tokenAddress, position] of this.positions.entries()) {
        try {
          const currentPrice = await this.fetchTokenPrice(tokenAddress);
          await this.updatePosition(tokenAddress, currentPrice);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`❌ [Position Manager] Error updating position ${tokenAddress}:`, errorMsg);
        }
      }
    }, 5000);
  }

  /**
   * Fetch current token price - FIXED: strict validation
   */
  private async fetchTokenPrice(tokenAddress: string): Promise<number> {
    try {
      const { priceFeedHandler } = await import("./priceFeedHandler");
      const price = await priceFeedHandler.getTokenPrice(tokenAddress);
      
      // FIXED: Strict validation
      if (price === null || price === undefined) {
        throw new Error(`Price feed returned null/undefined for ${tokenAddress.slice(0, 8)}...`);
      }
      
      if (price <= 0) {
        throw new Error(`Invalid price value: ${price} for ${tokenAddress.slice(0, 8)}...`);
      }
      
      // Additional check for extreme values
      if (price > 1e10 || !isFinite(price)) {
        throw new Error(`Suspicious price value: ${price} for ${tokenAddress.slice(0, 8)}...`);
      }
      
      return price;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ [Position Manager] Error fetching price for ${tokenAddress.slice(0, 8)}...:`, errorMsg);
      throw error;
    }
  }

  /**
   * Stop position monitoring
   */
  stopMonitoring(): void {
    if (this.priceCheckInterval) {
      clearInterval(this.priceCheckInterval);
      this.priceCheckInterval = null;
      console.log("📊 [Position Manager] Price monitoring stopped");
    }
  }

  /**
   * Get positions summary for reporting - FIXED: Real price fetching!
   */
  async getPositionsSummary(): Promise<{
    total_positions: number;
    total_invested: number;
    unrealized_pnl: number;
    positions: Array<{
      token: string;
      entry_price: number;
      current_price: number;
      current_profit: number;
      remaining_amount: number;
      status: string;
    }>;
  }> {
    const summary = {
      total_positions: this.positions.size,
      total_invested: 0,
      unrealized_pnl: 0,
      positions: [] as any[],
    };

    for (const [tokenAddress, position] of this.positions.entries()) {
      summary.total_invested += position.entryAmount;
      
      // FIXED: Fetch REAL current price instead of mock!
      let currentPrice: number;
      let profitPercent: number;
      
      try {
        currentPrice = await this.fetchTokenPrice(tokenAddress);
        profitPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        
        // Calculate unrealized P&L in SOL
        const unrealizedPnlSol = position.remainingAmount * (currentPrice / position.entryPrice - 1);
        summary.unrealized_pnl += unrealizedPnlSol;
        
      } catch (error) {
        console.warn(`⚠️ [Position Manager] Could not fetch price for ${tokenAddress.slice(0, 8)}... in summary`);
        currentPrice = 0;
        profitPercent = 0;
      }
      
      let status = "Active";
      if (position.isTrailingActive) status = "Trailing";
      else if (position.isBreakevenMoved) status = "Breakeven";
      
      summary.positions.push({
        token: tokenAddress.slice(0, 8) + "...",
        entry_price: position.entryPrice,
        current_price: currentPrice,
        current_profit: profitPercent,
        remaining_amount: position.remainingAmount,
        status: status,
      });
    }

    return summary;
  }
}

// Export singleton instance
export const positionManager = new AdvancedPositionManager();