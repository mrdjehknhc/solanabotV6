// src/utils/tokenCache.ts
interface TokenRecord {
  time: number;
  name: string;
  mint: string;
  creator: string;
}

export class TokenCache {
  private tokens: Map<string, TokenRecord> = new Map();
  private nameIndex: Map<string, Set<string>> = new Map();
  private creatorIndex: Map<string, Set<string>> = new Map();
  private readonly MAX_CACHE_SIZE = 10000; // Limit memory usage
  private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
  private readonly MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
  
  constructor() {
    // Periodic cleanup to prevent memory leaks
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
  }

  /**
   * Add token to cache with memory management
   */
  addToken(record: TokenRecord): void {
    const key = this.generateKey(record.name, record.creator);
    
    // Check if already exists
    if (this.tokens.has(key)) {
      return; // Already cached
    }
    
    // Cleanup if cache is getting too large
    if (this.tokens.size >= this.MAX_CACHE_SIZE) {
      this.cleanup();
    }
    
    // Add token
    this.tokens.set(key, record);
    
    // Update indexes
    this.addToIndex(this.nameIndex, record.name, key);
    this.addToIndex(this.creatorIndex, record.creator, key);
  }

  /**
   * Check if token name exists
   */
  hasTokenByName(name: string): boolean {
    return this.nameIndex.has(name.toLowerCase());
  }

  /**
   * Check if creator exists
   */
  hasTokenByCreator(creator: string): boolean {
    return this.creatorIndex.has(creator.toLowerCase());
  }

  /**
   * Get tokens by name and/or creator
   */
  getTokensByNameAndCreator(name: string, creator: string): TokenRecord[] {
    const results: TokenRecord[] = [];
    const processedKeys = new Set<string>();
    
    // Search by name
    const nameKeys = this.nameIndex.get(name.toLowerCase()) || new Set();
    nameKeys.forEach(key => {
      const token = this.tokens.get(key);
      if (token && !processedKeys.has(key)) {
        results.push(token);
        processedKeys.add(key);
      }
    });
    
    // Search by creator
    const creatorKeys = this.creatorIndex.get(creator.toLowerCase()) || new Set();
    creatorKeys.forEach(key => {
      const token = this.tokens.get(key);
      if (token && !processedKeys.has(key)) {
        results.push(token);
        processedKeys.add(key);
      }
    });
    
    return results;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalTokens: number;
    uniqueNames: number;
    uniqueCreators: number;
    oldestEntry: number;
    newestEntry: number;
    memoryUsageEstimate: string;
  } {
    const tokens = Array.from(this.tokens.values());
    const times = tokens.map(t => t.time);
    
    return {
      totalTokens: this.tokens.size,
      uniqueNames: this.nameIndex.size,
      uniqueCreators: this.creatorIndex.size,
      oldestEntry: times.length > 0 ? Math.min(...times) : 0,
      newestEntry: times.length > 0 ? Math.max(...times) : 0,
      memoryUsageEstimate: this.estimateMemoryUsage()
    };
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.tokens.clear();
    this.nameIndex.clear();
    this.creatorIndex.clear();
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.tokens.size;
  }

  /**
   * Export cache data for backup/analysis
   */
  exportData(): TokenRecord[] {
    return Array.from(this.tokens.values());
  }

  /**
   * Import cache data from backup
   */
  importData(records: TokenRecord[]): void {
    this.clear();
    records.forEach(record => this.addToken(record));
  }

  // === PRIVATE METHODS ===

  /**
   * Generate consistent cache key
   */
  private generateKey(name: string, creator: string): string {
    return `${name.toLowerCase()}_${creator.toLowerCase()}`;
  }

  /**
   * Add key to index
   */
  private addToIndex(index: Map<string, Set<string>>, indexKey: string, cacheKey: string): void {
    const normalizedKey = indexKey.toLowerCase();
    
    if (!index.has(normalizedKey)) {
      index.set(normalizedKey, new Set());
    }
    
    index.get(normalizedKey)!.add(cacheKey);
  }

  /**
   * Remove key from index
   */
  private removeFromIndex(index: Map<string, Set<string>>, indexKey: string, cacheKey: string): void {
    const normalizedKey = indexKey.toLowerCase();
    const keySet = index.get(normalizedKey);
    
    if (keySet) {
      keySet.delete(cacheKey);
      if (keySet.size === 0) {
        index.delete(normalizedKey);
      }
    }
  }

  /**
   * Cleanup old entries and optimize memory
   */
  private cleanup(): void {
    const now = Date.now();
    const keysToRemove: string[] = [];
    
    // Find old entries
    this.tokens.forEach((record, key) => {
      if (now - record.time > this.MAX_AGE) {
        keysToRemove.push(key);
      }
    });
    
    // If still too many entries, remove oldest ones
    if (this.tokens.size - keysToRemove.length > this.MAX_CACHE_SIZE * 0.8) {
      const sortedEntries = Array.from(this.tokens.entries())
        .sort(([, a], [, b]) => a.time - b.time);
      
      const additionalToRemove = Math.floor(this.MAX_CACHE_SIZE * 0.2);
      keysToRemove.push(...sortedEntries.slice(0, additionalToRemove).map(([key]) => key));
    }
    
    // Remove entries
    keysToRemove.forEach(key => {
      const record = this.tokens.get(key);
      if (record) {
        this.tokens.delete(key);
        this.removeFromIndex(this.nameIndex, record.name, key);
        this.removeFromIndex(this.creatorIndex, record.creator, key);
      }
    });
    
    if (keysToRemove.length > 0) {
      console.log(`🧹 [Token Cache] Cleaned up ${keysToRemove.length} old entries`);
    }
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): string {
    // Rough estimation: each token record ~200 bytes + index overhead
    const estimatedBytes = this.tokens.size * 200 + 
                          this.nameIndex.size * 50 + 
                          this.creatorIndex.size * 50;
    
    if (estimatedBytes < 1024) {
      return `${estimatedBytes} bytes`;
    } else if (estimatedBytes < 1024 * 1024) {
      return `${(estimatedBytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(estimatedBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }
}

// Export singleton instance
export const tokenCache = new TokenCache();

// Legacy compatibility functions for existing code
export function insertNewToken(record: { time: number; name: string; mint: string; creator: string }): Promise<void> {
  tokenCache.addToken(record);
  return Promise.resolve();
}

export function selectTokenByNameAndCreator(name: string, creator: string): Promise<TokenRecord[]> {
  return Promise.resolve(tokenCache.getTokensByNameAndCreator(name, creator));
}

// Additional utility functions
export function getTokenCacheStats() {
  return tokenCache.getStats();
}

export function clearTokenCache(): void {
  tokenCache.clear();
}