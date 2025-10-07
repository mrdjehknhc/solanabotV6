// src/core/apiClient.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";

// Extend Axios config to include metadata
interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: {
    startTime: number;
  };
  _retryCount?: number;
}

export interface ApiClientOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export interface RequestStats {
  total: number;
  successful: number;
  failed: number;
  avgResponseTime: number;
  lastUsed: number;
}

export class UnifiedApiClient {
  private instances: Map<string, AxiosInstance> = new Map();
  private stats: Map<string, RequestStats> = new Map();
  private requestTimes: Map<string, number[]> = new Map();

  /**
   * Get or create optimized axios instance
   */
  getInstance(baseURL: string, options: ApiClientOptions = {}): AxiosInstance {
    const cacheKey = `${baseURL}_${JSON.stringify(options)}`;
    
    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey)!;
    }

    const instance = axios.create({
      baseURL,
      timeout: options.timeout || 10000,
      maxRedirects: 2,
      headers: {
        'Connection': 'keep-alive',
        'Keep-Alive': 'timeout=30, max=100',
        ...options.headers
      },
      maxContentLength: 50 * 1024 * 1024, // 50MB
      maxBodyLength: 50 * 1024 * 1024,
      ...options as AxiosRequestConfig
    });

    // Add performance tracking
    this.setupPerformanceTracking(instance, cacheKey);
    
    // Add intelligent retry logic
    this.setupRetryLogic(instance, options.retries || 2, options.retryDelay || 1000);
    
    this.instances.set(cacheKey, instance);
    this.stats.set(cacheKey, { 
      total: 0, 
      successful: 0, 
      failed: 0, 
      avgResponseTime: 0,
      lastUsed: Date.now()
    });
    this.requestTimes.set(cacheKey, []);
    
    return instance;
  }

  /**
   * Setup performance tracking interceptors
   */
  private setupPerformanceTracking(instance: AxiosInstance, key: string): void {
    instance.interceptors.request.use((config: ExtendedAxiosRequestConfig) => {
      config.metadata = { startTime: Date.now() };
      
      const stats = this.stats.get(key);
      if (stats) {
        stats.lastUsed = Date.now();
      }
      
      return config;
    });

    instance.interceptors.response.use(
      response => {
        this.recordRequestStats(key, response, true);
        return response;
      },
      error => {
        this.recordRequestStats(key, error.response, false);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Setup intelligent retry logic
   */
  private setupRetryLogic(instance: AxiosInstance, maxRetries: number, retryDelay: number): void {
    instance.interceptors.response.use(
      response => response,
      async error => {
        const config = error.config as ExtendedAxiosRequestConfig;
        
        if (!config || (config._retryCount || 0) >= maxRetries) {
          return Promise.reject(error);
        }
        
        config._retryCount = (config._retryCount || 0) + 1;
        
        // Exponential backoff with jitter
        const delay = retryDelay * Math.pow(2, config._retryCount - 1) + Math.random() * 1000;
        
        // Only retry on network errors or 5xx status codes
        const shouldRetry = !error.response || (error.response.status >= 500);
        
        if (shouldRetry) {
          console.log(`🔄 [API Client] Retry ${config._retryCount}/${maxRetries} in ${Math.round(delay)}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return instance(config);
        }
        
        return Promise.reject(error);
      }
    );
  }

  /**
   * Record request statistics
   */
  private recordRequestStats(key: string, response: any, success: boolean): void {
    const stats = this.stats.get(key);
    const times = this.requestTimes.get(key);
    
    if (!stats || !times) return;

    stats.total++;
    stats.lastUsed = Date.now();
    
    if (success) {
      stats.successful++;
    } else {
      stats.failed++;
    }

    // Track response times
    if (response?.config?.metadata?.startTime) {
      const responseTime = Date.now() - response.config.metadata.startTime;
      times.push(responseTime);
      
      // Keep only last 100 response times for average calculation
      if (times.length > 100) {
        times.shift();
      }
      
      stats.avgResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
    }
  }

  /**
   * Get optimized instance for Sniperoo API
   */
  getSniperooClient(apiKey: string): AxiosInstance {
    return this.getInstance("https://api.sniperoo.app", {
      timeout: 12000,
      retries: 2,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Enhanced-Sniper/2.0'
      }
    });
  }

  /**
   * FIXED: Get optimized instance for DexScreener API
   * Renamed from getPriceFeedClient() for clarity
   */
  getDexScreenerClient(): AxiosInstance {
    return this.getInstance("https://api.dexscreener.com", {
      timeout: 3000,
      retries: 1,
      retryDelay: 500
    });
  }

  /**
   * Get optimized instance for Telegram API
   */
  getTelegramClient(botToken: string): AxiosInstance {
    return this.getInstance("https://api.telegram.org", {
      timeout: 10000,
      retries: 3,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Get performance statistics
   */
  getStats(): Record<string, RequestStats> {
    const result: Record<string, RequestStats> = {};
    
    this.stats.forEach((stats, key) => {
      const baseUrl = key.split('_')[0];
      result[baseUrl] = { ...stats };
    });
    
    return result;
  }

  /**
   * Get detailed statistics for specific API
   */
  getDetailedStats(baseURL: string): {
    stats: RequestStats;
    recentResponseTimes: number[];
    successRate: number;
  } | null {
    const key = Array.from(this.stats.keys()).find(k => k.startsWith(baseURL));
    if (!key) return null;

    const stats = this.stats.get(key)!;
    const times = this.requestTimes.get(key) || [];
    
    return {
      stats: { ...stats },
      recentResponseTimes: [...times.slice(-10)],
      successRate: stats.total > 0 ? (stats.successful / stats.total) * 100 : 0
    };
  }

  /**
   * Clear all cached instances and stats
   */
  clear(): void {
    this.instances.clear();
    this.stats.clear();
    this.requestTimes.clear();
  }

  /**
   * Clear instances for specific base URL
   */
  clearForUrl(baseURL: string): void {
    const keysToRemove = Array.from(this.instances.keys()).filter(key => key.startsWith(baseURL));
    
    keysToRemove.forEach(key => {
      this.instances.delete(key);
      this.stats.delete(key);
      this.requestTimes.delete(key);
    });
  }

  /**
   * Get health status of all API clients
   */
  async healthCheck(): Promise<Record<string, {
    healthy: boolean;
    responseTime?: number;
    error?: string;
  }>> {
    const results: Record<string, { healthy: boolean; responseTime?: number; error?: string }> = {};
    
    const healthCheckPromises = Array.from(this.instances.entries()).map(async ([key, instance]) => {
      const baseUrl = key.split('_')[0];
      const startTime = Date.now();
      
      try {
        await instance.head('/', { timeout: 5000 });
        results[baseUrl] = {
          healthy: true,
          responseTime: Date.now() - startTime
        };
      } catch (error) {
        results[baseUrl] = {
          healthy: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    await Promise.allSettled(healthCheckPromises);
    return results;
  }

  /**
   * Optimize all instances by clearing old connection pools
   */
  optimizeConnections(): void {
    console.log("🔧 [API Client] Optimizing connection pools...");
    
    const now = Date.now();
    const cutoff = 5 * 60 * 1000; // 5 minutes
    
    this.stats.forEach((stats, key) => {
      if (now - stats.lastUsed > cutoff) {
        this.instances.delete(key);
        console.log(`🧹 [API Client] Cleared unused instance: ${key.split('_')[0]}`);
      }
    });
    
    console.log("✅ [API Client] Connection optimization completed");
  }

  /**
   * Log performance summary
   */
  logPerformanceStats(): void {
    console.log("\n📊 API CLIENT PERFORMANCE STATS");
    console.log("=".repeat(50));
    
    const stats = this.getStats();
    
    if (Object.keys(stats).length === 0) {
      console.log("ℹ️  No API requests made yet");
      console.log("=".repeat(50));
      return;
    }
    
    Object.entries(stats).forEach(([url, stat]) => {
      const successRate = stat.total > 0 ? ((stat.successful / stat.total) * 100).toFixed(1) : '0';
      const lastUsedAgo = Math.round((Date.now() - stat.lastUsed) / 1000);
      
      console.log(`🌐 ${url}:`);
      console.log(`   Requests: ${stat.total} (✅${stat.successful} ❌${stat.failed})`);
      console.log(`   Success Rate: ${successRate}%`);
      console.log(`   Avg Response: ${stat.avgResponseTime.toFixed(0)}ms`);
      console.log(`   Last Used: ${lastUsedAgo}s ago`);
    });
    
    console.log("=".repeat(50));
  }
}

// Export singleton instance
export const apiClient = new UnifiedApiClient();

// Utility functions for easy access
export const getSniperooClient = (apiKey: string) => apiClient.getSniperooClient(apiKey);
export const getDexScreenerClient = () => apiClient.getDexScreenerClient();
export const getTelegramClient = (botToken: string) => apiClient.getTelegramClient(botToken);