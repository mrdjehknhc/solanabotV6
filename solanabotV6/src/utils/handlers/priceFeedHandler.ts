import axios from "axios";

export interface PriceInfo {
  price: number;
  timestamp: number;
  source: string;
}

export interface TokenPriceData {
  address: string;
  price: number;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  timestamp: number;
}

export class PriceFeedHandler {
  private priceCache: Map<string, PriceInfo> = new Map();
  private readonly CACHE_DURATION = 3000; // 3 seconds cache
  private readonly TIMEOUT = 3000; // 3 seconds timeout
  private failureCount: Map<string, number> = new Map(); // Track failures per token
  private readonly MAX_FAILURES_BEFORE_WARNING = 3;

  constructor() {
    console.log("📊 [Price Feed] Handler initialized (DexScreener only)");
  }

  /**
   * Get token price with caching and improved error handling
   */
  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    // Check cache first
    const cached = this.priceCache.get(tokenAddress);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.price;
    }

    try {
      const price = await this.getPriceFromDexScreener(tokenAddress);

      if (price !== null) {
        // IMPROVED: Additional validation before caching
        if (price > 0 && isFinite(price) && price < 1e10) {
          // Cache the price
          this.priceCache.set(tokenAddress, {
            price,
            timestamp: Date.now(),
            source: "dexscreener"
          });
          
          // Reset failure count on success
          this.failureCount.delete(tokenAddress);
          
          return price;
        } else {
          console.warn(`⚠️ [Price Feed] Suspicious price value (${price}) for ${tokenAddress.slice(0, 8)}..., not caching`);
          this.trackFailure(tokenAddress, 'suspicious_value');
          return null;
        }
      }

      // IMPROVED: Track failures and provide better diagnostics
      this.trackFailure(tokenAddress, 'no_data');
      console.warn(`⚠️ [Price Feed] Could not fetch price for token: ${tokenAddress.slice(0, 8)}...`);
      return null;

    } catch (error) {
      // IMPROVED: Better error tracking and reporting
      this.trackFailure(tokenAddress, 'error');
      
      const errorMsg = error instanceof Error ? error.message : String(error);
      const axiosError = axios.isAxiosError(error);
      
      console.error(`❌ [Price Feed] Error fetching price for ${tokenAddress.slice(0, 8)}...:`, {
        error: errorMsg,
        status: axiosError ? error.response?.status : 'unknown',
        type: axiosError ? 'network' : 'unknown'
      });
      
      return null;
    }
  }

  /**
   * Get price from DexScreener API with improved error handling
   */
  private async getPriceFromDexScreener(tokenAddress: string): Promise<number | null> {
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { timeout: this.TIMEOUT }
      );

      // IMPROVED: Validate response structure
      if (!response.data) {
        console.warn(`⚠️ [Price Feed] Empty response from DexScreener for ${tokenAddress.slice(0, 8)}...`);
        return null;
      }

      const pairs = response.data.pairs;
      
      if (!Array.isArray(pairs) || pairs.length === 0) {
        console.warn(`⚠️ [Price Feed] No trading pairs found for ${tokenAddress.slice(0, 8)}...`);
        return null;
      }

      // Get the pair with highest liquidity
      const bestPair = pairs.reduce((best: any, current: any) => {
        const bestLiq = best?.liquidity?.usd || 0;
        const currentLiq = current?.liquidity?.usd || 0;
        return currentLiq > bestLiq ? current : best;
      }, pairs[0]);

      // IMPROVED: Validate price data
      if (!bestPair?.priceUsd) {
        console.warn(`⚠️ [Price Feed] No valid price data from DexScreener for ${tokenAddress.slice(0, 8)}...`);
        console.log(`ℹ️  Best pair liquidity: $${bestPair?.liquidity?.usd || 0}`);
        return null;
      }

      const price = Number(bestPair.priceUsd);
      
      // IMPROVED: Validate parsed price
      if (isNaN(price) || !isFinite(price)) {
        console.warn(`⚠️ [Price Feed] Invalid price format from DexScreener: ${bestPair.priceUsd}`);
        return null;
      }

      console.log(`💰 [Price Feed] DexScreener price for ${tokenAddress.slice(0, 8)}...: $${price.toFixed(8)}`);
      return price;

    } catch (error) {
      // IMPROVED: Detailed error logging
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const statusText = error.response?.statusText;
        
        if (status === 429) {
          console.warn(`⚠️ [Price Feed] DexScreener rate limit hit for ${tokenAddress.slice(0, 8)}...`);
        } else if (status && status >= 500) {
          console.warn(`⚠️ [Price Feed] DexScreener server error (${status}) for ${tokenAddress.slice(0, 8)}...`);
        } else if (error.code === 'ECONNABORTED') {
          console.warn(`⚠️ [Price Feed] DexScreener timeout for ${tokenAddress.slice(0, 8)}...`);
        } else {
          console.log(`⚠️ [Price Feed] DexScreener API failed (${status || 'unknown'}) for ${tokenAddress.slice(0, 8)}...`);
        }
      } else {
        console.log(`⚠️ [Price Feed] DexScreener unexpected error for ${tokenAddress.slice(0, 8)}...`);
      }
      
      return null;
    }
  }

  /**
   * IMPROVED: Track failures and send warnings
   */
  private trackFailure(tokenAddress: string, reason: string): void {
    const currentCount = this.failureCount.get(tokenAddress) || 0;
    const newCount = currentCount + 1;
    
    this.failureCount.set(tokenAddress, newCount);
    
    // Send warning after multiple failures
    if (newCount === this.MAX_FAILURES_BEFORE_WARNING) {
      console.warn(`⚠️ [Price Feed] Token ${tokenAddress.slice(0, 8)}... has failed ${newCount} times (reason: ${reason})`);
      console.warn(`💡 [Price Feed] Consider checking if this token is still tradeable`);
      
      // Optional: Send Telegram notification
      this.sendFailureNotification(tokenAddress, newCount, reason).catch(() => {});
    }
  }

  /**
   * IMPROVED: Send failure notification
   */
  private async sendFailureNotification(tokenAddress: string, failureCount: number, reason: string): Promise<void> {
    try {
      const { telegramManager } = await import("./telegramHandler");
      await telegramManager.notifyError(
        `⚠️ Price Feed Warning\n` +
        `Token: ${tokenAddress.slice(0, 8)}...\n` +
        `Failures: ${failureCount}\n` +
        `Reason: ${reason}\n` +
        `Position may need manual review`
      );
    } catch (error) {
      // Silent fail - notifications are optional
    }
  }

  /**
   * Get detailed token information
   */
  async getTokenInfo(tokenAddress: string): Promise<TokenPriceData | null> {
    try {
      const response = await axios.get(
        `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        { timeout: 10000 }
      );

      if (response.data?.pairs && response.data.pairs.length > 0) {
        const bestPair = response.data.pairs.reduce((best: any, current: any) => {
          return (current.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? current : best;
        });

        return {
          address: tokenAddress,
          price: Number(bestPair.priceUsd) || 0,
          priceChange24h: Number(bestPair.priceChange?.h24) || 0,
          volume24h: Number(bestPair.volume?.h24) || 0,
          marketCap: Number(bestPair.marketCap) || 0,
          timestamp: Date.now(),
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ [Price Feed] Error fetching token info for ${tokenAddress}:`, error);
      return null;
    }
  }

  /**
   * Get multiple token prices at once
   */
  async getMultipleTokenPrices(tokenAddresses: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    
    const pricePromises = tokenAddresses.map(async (address) => {
      const price = await this.getTokenPrice(address);
      if (price !== null) {
        prices.set(address, price);
      }
    });

    await Promise.all(pricePromises);
    return prices;
  }

  /**
   * Clear price cache
   */
  clearCache(): void {
    this.priceCache.clear();
    console.log("🧹 [Price Feed] Cache cleared");
  }

  /**
   * IMPROVED: Clear failure tracking
   */
  clearFailureTracking(tokenAddress?: string): void {
    if (tokenAddress) {
      this.failureCount.delete(tokenAddress);
      console.log(`🧹 [Price Feed] Failure tracking cleared for ${tokenAddress.slice(0, 8)}...`);
    } else {
      this.failureCount.clear();
      console.log("🧹 [Price Feed] All failure tracking cleared");
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: Array<{ token: string; price: number; age: number }>;
  } {
    const entries = Array.from(this.priceCache.entries()).map(([token, data]) => ({
      token: token.slice(0, 8) + "...",
      price: data.price,
      age: Date.now() - data.timestamp,
    }));

    return {
      size: this.priceCache.size,
      entries,
    };
  }

  /**
   * IMPROVED: Get failure statistics
   */
  getFailureStats(): {
    totalFailures: number;
    tokensWithFailures: number;
    failureDetails: Array<{ token: string; failures: number }>;
  } {
    const details = Array.from(this.failureCount.entries()).map(([token, count]) => ({
      token: token.slice(0, 8) + "...",
      failures: count
    }));

    return {
      totalFailures: Array.from(this.failureCount.values()).reduce((sum, count) => sum + count, 0),
      tokensWithFailures: this.failureCount.size,
      failureDetails: details
    };
  }

  /**
   * Health check for DexScreener
   */
  async healthCheck(): Promise<{ dexscreener: boolean; details?: string }> {
    const testToken = "So11111111111111111111111111111111111111112"; // WSOL
    
    try {
      const price = await this.getPriceFromDexScreener(testToken);
      
      if (price !== null) {
        return { 
          dexscreener: true, 
          details: `Price fetched successfully: ${price.toFixed(2)}` 
        };
      } else {
        return { 
          dexscreener: false, 
          details: 'No price data returned' 
        };
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { 
        dexscreener: false, 
        details: `Error: ${errorMsg}` 
      };
    }
  }

  /**
   * IMPROVED: Get comprehensive diagnostics
   */
  async getDiagnostics(): Promise<{
    healthy: boolean;
    cache: { size: number; hitRate: number };
    failures: { count: number; tokens: number };
    apiStatus: { connected: boolean; details: string };
  }> {
    const cacheStats = this.getCacheStats();
    const failureStats = this.getFailureStats();
    const health = await this.healthCheck();

    // Calculate cache hit rate (estimate)
    const totalRequests = cacheStats.size + failureStats.totalFailures;
    const hitRate = totalRequests > 0 ? (cacheStats.size / totalRequests) * 100 : 0;

    return {
      healthy: health.dexscreener && failureStats.tokensWithFailures < 3,
      cache: {
        size: cacheStats.size,
        hitRate: Math.round(hitRate)
      },
      failures: {
        count: failureStats.totalFailures,
        tokens: failureStats.tokensWithFailures
      },
      apiStatus: {
        connected: health.dexscreener,
        details: health.details || 'Unknown'
      }
    };
  }
}

// Export singleton instance
export const priceFeedHandler = new PriceFeedHandler();