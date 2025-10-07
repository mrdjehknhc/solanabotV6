// src/utils/handlers/enhancedSniperooHandler.ts
import axios, { AxiosInstance } from "axios";
import { validateEnv } from "../env-validator";

export interface SniperooTradeResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  price?: number;
}

export interface SellOrderData {
  positionId: number;
  percentage: number;
  reason: string;
  urgency?: 'low' | 'medium' | 'high';
}

export interface WalletPosition {
  tokenAddress: string;
  balance: number;
  value?: number;
  positionId: number;
}

/**
 * IMPROVED: Emergency sell result interface
 */
export interface EmergencySellResult {
  total: number;
  successful: number;
  failed: number;
  details: Array<{
    tokenAddress: string;
    positionId: number;
    success: boolean;
    error?: string;
  }>;
}

export class EnhancedSniperooHandler {
  private readonly baseUrl = "https://api.sniperoo.app";
  private env: any;
  private axiosInstance: AxiosInstance;
  
  // Optimized caching system
  private balanceCache: { balance: number; timestamp: number } | null = null;
  private positionsCache: { positions: WalletPosition[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 3000; // 3 seconds for faster updates

  constructor() {
    this.env = validateEnv();
    
    // Optimized axios instance with connection pooling
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 12000, // Reduced timeout
      headers: {
        Authorization: `Bearer ${this.env.SNIPEROO_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "Enhanced-Sniper/2.0",
        "Connection": "keep-alive"
      },
      maxRedirects: 2,
      validateStatus: (status) => status < 500,
    });

    // Response interceptor for retry logic
    this.axiosInstance.interceptors.response.use(
      response => response,
      async error => {
        const config = error.config;
        if (!config._retryCount) config._retryCount = 0;
        
        if (config._retryCount < 2 && error.response?.status >= 500) {
          config._retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000));
          return this.axiosInstance(config);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * High-speed token purchase
   */
  async buyToken(tokenAddress: string, inputAmountOverride?: number, enableAdvancedTrading: boolean = true): Promise<boolean> {
    const startTime = Date.now();
    
    try {
      // Fast validation
      if (!tokenAddress?.trim() || tokenAddress.length < 32) {
        console.error("❌ [Sniperoo] Invalid token address");
        return false;
      }

      // Get buy amount
      const buyAmount = inputAmountOverride || await this.getOptimalBuyAmount();
      
      if (buyAmount <= 0.001) { // Minimum viable amount
        console.error("❌ [Sniperoo] Buy amount too small");
        return false;
      }

      console.log(`🔫 [Sniperoo] Buying ${buyAmount.toFixed(4)} SOL -> ${tokenAddress.slice(0, 8)}...`);

      // Execute purchase
      const response = await this.axiosInstance.post("/trading/buy-token", {
        walletAddresses: [this.env.SNIPEROO_PUBKEY],
        tokenAddress: tokenAddress,
        isBuying: true,
        inputAmount: buyAmount,
        autoSell: { enabled: false }
      });

      const duration = Date.now() - startTime;

      if (response.status === 200 || response.status === 201) {
        console.log(`✅ [Sniperoo] Purchase completed in ${duration}ms`);
        
        // Clear caches after successful purchase
        this.clearCaches();
        
        return true;
      }

      console.error("❌ [Sniperoo] Purchase failed:", response.data?.message || "Unknown error");
      return false;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ [Sniperoo] Purchase error (${duration}ms):`, this.getErrorMessage(error));
      return false;
    }
  }

  /**
   * Fast token sale
   */
  async sellToken(sellOrder: SellOrderData): Promise<SniperooTradeResult> {
    try {
      const { positionId, percentage, reason } = sellOrder;

      if (!positionId || percentage <= 0 || percentage > 100) {
        return { success: false, error: "Invalid sell parameters" };
      }

      console.log(`💸 [Sniperoo] Selling ${percentage}% of position ${positionId} (${reason})`);

      const response = await this.axiosInstance.post("/trading/sell-percentage-from-position", {
        positionId,
        percentage
      });

      if (response.status === 200 || response.status === 201) {
        console.log(`✅ [Sniperoo] Sold ${percentage}% successfully`);
        this.clearCaches();
        
        return {
          success: true,
          transactionId: response.data.sellTransaction?.transactionId || "unknown",
        };
      }

      return { success: false, error: response.data?.message || "Sale failed" };

    } catch (error) {
      return { success: false, error: this.getErrorMessage(error) };
    }
  }

  /**
   * IMPROVED: Emergency sell all positions with detailed results tracking
   */
  async emergencySellAll(): Promise<EmergencySellResult> {
    console.log("🚨 [Sniperoo] EMERGENCY SELL ALL POSITIONS");
    
    const result: EmergencySellResult = {
      total: 0,
      successful: 0,
      failed: 0,
      details: []
    };
    
    try {
      const positions = await this.getWalletHoldings();
      
      if (!positions || positions.length === 0) {
        console.log("ℹ️ [Sniperoo] No positions to sell");
        return result;
      }

      result.total = positions.length;
      console.log(`⚠️ [Sniperoo] Emergency selling ${positions.length} positions...`);

      // IMPROVED: Parallel emergency sales with individual result tracking
      const sellPromises = positions.map(async (pos) => {
        try {
          const sellResult = await this.sellToken({
            positionId: pos.positionId,
            percentage: 100,
            reason: "Emergency sell",
            urgency: 'high'
          });
          
          const detail = {
            tokenAddress: pos.tokenAddress,
            positionId: pos.positionId,
            success: sellResult.success,
            error: sellResult.error
          };
          
          if (sellResult.success) {
            result.successful++;
          } else {
            result.failed++;
            console.error(`❌ [Sniperoo] Failed to sell position ${pos.positionId}: ${sellResult.error}`);
          }
          
          return detail;
          
        } catch (error) {
          result.failed++;
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`❌ [Sniperoo] Exception selling position ${pos.positionId}:`, errorMsg);
          
          return {
            tokenAddress: pos.tokenAddress,
            positionId: pos.positionId,
            success: false,
            error: errorMsg
          };
        }
      });

      // Wait for all sells to complete
      const details = await Promise.all(sellPromises);
      result.details = details;
      
      // IMPROVED: Detailed completion log
      console.log(`📊 [Sniperoo] Emergency sell completed: ${result.successful}/${result.total} successful, ${result.failed}/${result.total} failed`);
      
      if (result.failed > 0) {
        console.warn(`⚠️ [Sniperoo] ${result.failed} positions could not be sold`);
      }
      
      return result;
      
    } catch (error) {
      console.error("❌ [Sniperoo] Emergency sell failed:", error);
      throw error;
    }
  }

  /**
   * Get wallet positions with smart caching
   */
  async getWalletHoldings(): Promise<WalletPosition[] | null> {
    try {
      // Check cache first
      if (this.positionsCache && Date.now() - this.positionsCache.timestamp < this.CACHE_TTL) {
        return this.positionsCache.positions;
      }

      const response = await this.axiosInstance.get("/positions/all");
      
      if (response.status === 200 && Array.isArray(response.data)) {
        const positions = response.data
          .filter(pos => pos.id && pos.tokenAddress) // Filter valid positions
          .map(pos => ({
            tokenAddress: pos.tokenAddress,
            balance: parseFloat(pos.initialTokenAmountUi || 0),
            value: parseFloat(pos.currentValue || 0),
            positionId: pos.id
          }));

        // Update cache
        this.positionsCache = { positions, timestamp: Date.now() };
        
        return positions;
      }

      return [];
    } catch (error) {
      console.error("❌ [Sniperoo] Error fetching positions:", this.getErrorMessage(error));
      return null;
    }
  }

  /**
   * Get wallet balance with caching
   */
  async getWalletBalance(): Promise<number | null> {
    try {
      // Check cache
      if (this.balanceCache && Date.now() - this.balanceCache.timestamp < this.CACHE_TTL) {
        return this.balanceCache.balance;
      }

      const response = await this.axiosInstance.get("/user/balance-for-wallet", {
        params: { walletAddress: this.env.SNIPEROO_PUBKEY }
      });

      if (response.status === 200 && response.data?.solBalance !== undefined) {
        const balance = parseFloat(response.data.solBalance);
        
        // Update cache
        this.balanceCache = { balance, timestamp: Date.now() };
        
        return balance;
      }

      return null;
    } catch (error) {
      console.error("❌ [Sniperoo] Balance error:", this.getErrorMessage(error));
      return null;
    }
  }

  /**
   * Fast API health check
   */
  async healthCheck(): Promise<{ connected: boolean; error?: string }> {
    try {
      const response = await this.axiosInstance.get("/user/wallets", { 
        timeout: 5000 
      });
      return { connected: response.status === 200 };
    } catch (error) {
      return { 
        connected: false, 
        error: this.getErrorMessage(error) 
      };
    }
  }

  /**
   * Get comprehensive API status
   */
  async getStatus(): Promise<{
    connected: boolean;
    balance?: number;
    positions?: number;
    lastUpdate: number;
    error?: string;
  }> {
    try {
      const [healthResult, balanceResult, positionsResult] = await Promise.allSettled([
        this.healthCheck(),
        this.getWalletBalance(),
        this.getWalletHoldings()
      ]);

      const connected = healthResult.status === 'fulfilled' && healthResult.value.connected;
      const balance = balanceResult.status === 'fulfilled' ? balanceResult.value : undefined;
      const positions = positionsResult.status === 'fulfilled' && positionsResult.value 
        ? positionsResult.value.length 
        : undefined;

      return {
        connected,
        balance: balance || undefined,
        positions,
        lastUpdate: Date.now(),
        error: !connected ? "API connection failed" : undefined
      };
    } catch (error) {
      return {
        connected: false,
        lastUpdate: Date.now(),
        error: this.getErrorMessage(error)
      };
    }
  }

  // === PRIVATE METHODS ===

  /**
   * Get optimal buy amount from balance manager
   */
  private async getOptimalBuyAmount(): Promise<number> {
    try {
      const { balanceManager } = await import("./balanceManager");
      return await balanceManager.getOptimalBuyAmount();
    } catch (error) {
      console.error("❌ [Sniperoo] Error getting buy amount:", error);
      return 0.01; // Safe fallback
    }
  }

  /**
   * Extract meaningful error message
   */
  private getErrorMessage(error: any): string {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;
      return `API error (${status || "unknown"}): ${message}`;
    }
    return error instanceof Error ? error.message : "Unknown error";
  }

  /**
   * Clear all caches
   */
  private clearCaches(): void {
    this.balanceCache = null;
    this.positionsCache = null;
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): {
    balance: { cached: boolean; age?: number };
    positions: { cached: boolean; age?: number; count?: number };
  } {
    const now = Date.now();
    
    return {
      balance: {
        cached: !!this.balanceCache,
        age: this.balanceCache ? now - this.balanceCache.timestamp : undefined
      },
      positions: {
        cached: !!this.positionsCache,
        age: this.positionsCache ? now - this.positionsCache.timestamp : undefined,
        count: this.positionsCache?.positions.length
      }
    };
  }

  /**
   * Force refresh all caches
   */
  async refreshCaches(): Promise<void> {
    console.log("🔄 [Sniperoo] Refreshing all caches...");
    this.clearCaches();
    
    // Parallel cache refresh
    await Promise.allSettled([
      this.getWalletBalance(),
      this.getWalletHoldings()
    ]);
    
    console.log("✅ [Sniperoo] Cache refresh completed");
  }
}

// Export singleton instance
export const enhancedSniperooHandler = new EnhancedSniperooHandler();