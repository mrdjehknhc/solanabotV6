// src/utils/healthCheck.ts
import { enhancedSniperooHandler } from "./handlers/enhancedSniperooHandler";
import { balanceManager } from "./handlers/balanceManager";
import { priceFeedHandler } from "./handlers/priceFeedHandler";
import { positionManager } from "./handlers/positionManager";
import { config } from "../config";

export interface SystemHealth {
  overall: 'healthy' | 'warning' | 'critical';
  components: {
    sniperoo: boolean;
    balance: 'healthy' | 'warning' | 'critical';
    priceFeed: boolean; // ИСПРАВЛЕНО: один price feed вместо счетчика
    positions: number;
  };
  metrics: {
    balanceSOL: number;
    nextBuyAmount: number;
    estimatedTrades: number;
    activePositions: number;
  };
  timestamp: number;
}

export class HealthMonitor {
  private lastHealth: SystemHealth | null = null;
  private readonly CHECK_TIMEOUT = 10000; // 10 seconds max per check
  
  /**
   * Quick system health check with optimized performance
   */
  async quickCheck(): Promise<SystemHealth> {
    const startTime = Date.now();
    
    try {
      // Parallel health checks for maximum speed
      const [sniperooHealth, balanceHealth, priceHealth, positionCount] = await Promise.allSettled([
        this.checkSniperooHealth(),
        this.checkBalanceHealth(),
        this.checkPriceFeedHealth(),
        this.getPositionCount()
      ]);

      // Extract results with fallbacks
      const sniperooOk = sniperooHealth.status === 'fulfilled' ? sniperooHealth.value : false;
      const balance = balanceHealth.status === 'fulfilled' ? balanceHealth.value : { status: 'critical' as const, metrics: { balanceSOL: 0, nextBuyAmount: 0, estimatedTrades: 0 } };
      const priceFeedOk = priceHealth.status === 'fulfilled' ? priceHealth.value : false;
      const positions = positionCount.status === 'fulfilled' ? positionCount.value : 0;

      // Build health report
      const health: SystemHealth = {
        overall: this.calculateOverallHealth(sniperooOk, balance.status, priceFeedOk, balance.metrics.estimatedTrades),
        components: {
          sniperoo: sniperooOk,
          balance: balance.status,
          priceFeed: priceFeedOk, // ИСПРАВЛЕНО: boolean вместо number
          positions
        },
        metrics: {
          balanceSOL: balance.metrics.balanceSOL,
          nextBuyAmount: balance.metrics.nextBuyAmount,
          estimatedTrades: balance.metrics.estimatedTrades,
          activePositions: positions
        },
        timestamp: Date.now()
      };

      this.lastHealth = health;
      
      // Log concise summary
      this.logHealthSummary(health, Date.now() - startTime);
      
      return health;
      
    } catch (error) {
      console.error("❌ [Health Check] Critical error:", error instanceof Error ? error.message : "Unknown error");
      
      return this.getCriticalFailureHealth();
    }
  }

  /**
   * Check Sniperoo API health
   */
  private async checkSniperooHealth(): Promise<boolean> {
    try {
      const result = await Promise.race([
        enhancedSniperooHandler.healthCheck(),
        new Promise<{ connected: boolean }>((_, reject) => 
          setTimeout(() => reject(new Error("Timeout")), this.CHECK_TIMEOUT))
      ]);
      return result.connected;
    } catch {
      return false;
    }
  }

  /**
   * Check balance health and get metrics
   */
  private async checkBalanceHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    metrics: {
      balanceSOL: number;
      nextBuyAmount: number;
      estimatedTrades: number;
    };
  }> {
    try {
      const balanceStats = await balanceManager.getBalanceStats();

      // Simple health based on balance only - no blocking
      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (balanceStats.currentBalance < 0.01) {
        status = 'warning';
      }

      return {
        status,
        metrics: {
          balanceSOL: balanceStats.currentBalance,
          nextBuyAmount: balanceStats.nextBuyAmount,
          estimatedTrades: balanceStats.estimatedTrades
        }
      };
    } catch {
      return {
        status: 'warning',
        metrics: { balanceSOL: 0, nextBuyAmount: 0, estimatedTrades: 0 }
      };
    }
  }

  /**
   * Check DexScreener price feed health
   */
  private async checkPriceFeedHealth(): Promise<boolean> {
    try {
      const result = await Promise.race([
        priceFeedHandler.healthCheck(),
        new Promise<{ dexscreener: boolean }>((_, reject) => 
          setTimeout(() => reject(new Error("Timeout")), this.CHECK_TIMEOUT))
      ]);
      return result.dexscreener;
    } catch {
      return false;
    }
  }

  /**
   * Get position count
   */
  private async getPositionCount(): Promise<number> {
    try {
      return positionManager.getPositions().size;
    } catch {
      return 0;
    }
  }

  /**
   * Calculate overall health status
   */
  private calculateOverallHealth(
    sniperooOk: boolean,
    balanceStatus: 'healthy' | 'warning' | 'critical',
    priceFeedOk: boolean,
    estimatedTrades: number
  ): 'healthy' | 'warning' | 'critical' {
    // Only API connectivity is critical
    if (!sniperooOk) {
      return 'critical';
    }
    
    // Warning conditions but not blocking
    if (!priceFeedOk || balanceStatus === 'warning') {
      return 'warning';
    }
    
    return 'healthy';
  }

  /**
   * Log concise health summary
   */
  private logHealthSummary(health: SystemHealth, duration: number): void {
    const emoji = health.overall === 'healthy' ? '✅' : 
                 health.overall === 'warning' ? '⚠️' : '🚨';
    
    console.log(`${emoji} [Health Check] ${health.overall.toUpperCase()} (${duration}ms)`);
    console.log(`   💰 Balance: ${health.metrics.balanceSOL.toFixed(4)} SOL (${health.metrics.estimatedTrades} trades)`);
    console.log(`   🔫 APIs: Sniperoo ${health.components.sniperoo ? '✅' : '❌'}, DexScreener ${health.components.priceFeed ? '✅' : '❌'}`);
    
    if (health.components.positions > 0) {
      console.log(`   📊 Active Positions: ${health.components.positions}`);
    }
  }

  /**
   * Get critical failure health object
   */
  private getCriticalFailureHealth(): SystemHealth {
    return {
      overall: 'critical',
      components: {
        sniperoo: false,
        balance: 'critical',
        priceFeed: false,
        positions: 0
      },
      metrics: {
        balanceSOL: 0,
        nextBuyAmount: 0,
        estimatedTrades: 0,
        activePositions: 0
      },
      timestamp: Date.now()
    };
  }

  /**
   * Send critical alerts via Telegram
   */
  async sendCriticalAlerts(health: SystemHealth): Promise<void> {
    if (health.overall !== 'critical') return;

    try {
      const { telegramManager } = await import("./handlers/telegramHandler");
      
      const issues = [];
      if (!health.components.sniperoo) issues.push("Sniperoo API down");
      if (health.components.balance === 'critical') issues.push("Balance critical");
      if (!health.components.priceFeed) issues.push("DexScreener down");
      
      await telegramManager.notifyError(
        `🚨 CRITICAL SYSTEM ISSUES:\n${issues.map(i => `• ${i}`).join('\n')}\n\nImmediate attention required!`
      );
    } catch (error) {
      console.error("❌ [Health Check] Failed to send critical alerts:", error);
    }
  }

  /**
   * Get last health check result
   */
  getLastHealth(): SystemHealth | null {
    return this.lastHealth;
  }

  /**
   * Get formatted health report for notifications
   */
  getFormattedReport(): string {
    if (!this.lastHealth) return "❌ No health data available";
    
    const h = this.lastHealth;
    const emoji = h.overall === 'healthy' ? '✅' : h.overall === 'warning' ? '⚠️' : '🚨';
    
    let report = `${emoji} **SYSTEM STATUS: ${h.overall.toUpperCase()}**\n\n`;
    
    // Components status
    report += `🔫 Sniperoo API: ${h.components.sniperoo ? '✅' : '❌'}\n`;
    report += `💰 Balance: ${h.components.balance === 'healthy' ? '✅' : h.components.balance === 'warning' ? '⚠️' : '🚨'} (${h.metrics.balanceSOL.toFixed(4)} SOL)\n`;
    report += `📊 DexScreener: ${h.components.priceFeed ? '✅' : '❌'}\n`;
    
    if (h.metrics.activePositions > 0) {
      report += `📈 Positions: ${h.metrics.activePositions} active\n`;
    }
    
    // Key metrics
    report += `\n💡 **Key Metrics:**\n`;
    report += `• Next Buy: ${h.metrics.nextBuyAmount.toFixed(4)} SOL\n`;
    report += `• Est. Trades: ${h.metrics.estimatedTrades}\n`;
    
    // Recommendations
    if (h.overall === 'critical') {
      report += `\n🚨 **URGENT:** Immediate attention required!`;
    } else if (h.overall === 'warning') {
      report += `\n⚠️ **Warning:** Monitor system closely`;
    } else {
      report += `\n🚀 **Status:** System ready for trading`;
    }
    
    report += `\n\n⏰ ${new Date(h.timestamp).toLocaleString()}`;
    
    return report;
  }

  /**
   * Check if system is ready for trading
   */
  isReadyForTrading(): boolean {
    if (!this.lastHealth) return false;
    return this.lastHealth.overall !== 'critical' && 
           this.lastHealth.components.sniperoo && 
           this.lastHealth.metrics.estimatedTrades > 0;
  }
}

// Export singleton instance
export const healthMonitor = new HealthMonitor();

/**
 * Standalone health check function for CLI usage
 */
export async function performHealthCheck(): Promise<void> {
  console.log("🏥 Enhanced Solana Sniper - System Health Check");
  console.log("=".repeat(60));
  
  const health = await healthMonitor.quickCheck();
  
  // Display detailed results for CLI
  console.log("\n📊 DETAILED REPORT:");
  console.log("=".repeat(30));
  
  const overallEmoji = health.overall === 'healthy' ? '✅' : 
                      health.overall === 'warning' ? '⚠️' : '🚨';
  
  console.log(`${overallEmoji} Overall Status: ${health.overall.toUpperCase()}\n`);
  
  // Component details
  console.log("🔧 COMPONENTS:");
  console.log(`  Sniperoo API: ${health.components.sniperoo ? '✅ Online' : '❌ Offline'}`);
  console.log(`  Balance: ${health.components.balance === 'healthy' ? '✅ Healthy' : 
                          health.components.balance === 'warning' ? '⚠️ Warning' : '🚨 Critical'}`);
  console.log(`  DexScreener: ${health.components.priceFeed ? '✅ Online' : '❌ Offline'}`);
  console.log(`  Active Positions: ${health.components.positions}`);
  
  // Metrics
  console.log("\n💰 METRICS:");
  console.log(`  SOL Balance: ${health.metrics.balanceSOL.toFixed(4)} SOL`);
  console.log(`  Next Buy Amount: ${health.metrics.nextBuyAmount.toFixed(4)} SOL`);
  console.log(`  Estimated Trades: ${health.metrics.estimatedTrades}`);
  
  // Recommendations
  console.log("\n💡 RECOMMENDATIONS:");
  if (health.overall === 'healthy') {
    console.log("  🚀 System is healthy and ready for trading!");
  } else if (health.overall === 'warning') {
    console.log("  ⚠️ System has warnings - monitor closely");
    if (health.components.balance === 'warning') {
      console.log("  💰 Consider refunding wallet soon");
    }
    if (!health.components.priceFeed) {
      console.log("  📊 DexScreener API issues detected");
    }
  } else {
    console.log("  🚨 CRITICAL ISSUES DETECTED!");
    if (!health.components.sniperoo) {
      console.log("  🔧 Check Sniperoo API credentials");
    }
    if (health.components.balance === 'critical') {
      console.log("  💰 URGENT: Refund wallet immediately!");
    }
    if (!health.components.priceFeed) {
      console.log("  📊 DexScreener API is down!");
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log(`⏰ Health check completed at ${new Date().toLocaleString()}`);
  
  // Send critical alerts if needed
  if (health.overall === 'critical') {
    await healthMonitor.sendCriticalAlerts(health);
  }
  
  // Exit with appropriate code for scripts
  process.exit(health.overall === 'critical' ? 1 : 0);
}

// CLI execution
if (require.main === module) {
  performHealthCheck().catch(error => {
    console.error("💥 Health check failed:", error);
    process.exit(1);
  });
}