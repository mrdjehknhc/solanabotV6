// src/main.ts
import { validateEnv } from "./utils/env-validator";
import { tradingEngine } from "./core/tradingEngine";
import { balanceManager } from "./utils/handlers/balanceManager";
import { telegramManager } from "./utils/handlers/telegramHandler";
import { healthMonitor } from "./utils/healthCheck";
import { config } from "./config";

/**
 * Fast bot initialization
 */
async function initializeBot(): Promise<void> {
  console.clear();
  console.log("🚀 Enhanced Solana Sniper v2.0");
  console.log("⚡ Features: Dynamic Balance, Risk Management, Telegram Notifications");
  
  // Environment validation
  validateEnv();
  
  // Fast balance check
  const balance = await balanceManager.getBalance();
  console.log(`💰 ${balance.solBalance.toFixed(4)} SOL | Next: ${balance.calculatedBuyAmount.toFixed(4)} SOL`);
  
  // Telegram test if enabled
  if (config.telegram.enabled) {
    await telegramManager.testConnection();
  }
  
  // Quick health check
  const health = await healthMonitor.quickCheck();
  if (health.overall === 'critical') {
    throw new Error("Critical system issues detected. Check health report above.");
  }
  
  console.log("✅ Bot initialized and ready!");
}

/**
 * Start the bot
 */
async function startBot(): Promise<void> {
  try {
    await initializeBot();
    
    // Start main trading loop
    const { main } = await import("./index");
    await main();
    
  } catch (error) {
    console.error("❌ Bot startup failed:", error instanceof Error ? error.message : error);
    
    // Send error notification
    try {
      await telegramManager.notifyError(`Bot startup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } catch (notifyError) {
      console.error("Failed to send startup error notification:", notifyError);
    }
    
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  
  try {
    // Emergency stop trading
    await tradingEngine.emergencyStop();
    
    // Final balance report
    const finalBalance = await balanceManager.getBalance();
    await telegramManager.notifyError(
      `🛑 Bot shutdown (${signal})\n💰 Final Balance: ${finalBalance.solBalance.toFixed(4)} SOL`
    );
    
    console.log("✅ Graceful shutdown completed");
    
  } catch (error) {
    console.error("❌ Error during shutdown:", error);
  } finally {
    process.exit(0);
  }
}

// Signal handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Emergency commands
process.on("SIGUSR1", async () => {
  console.log("🚨 Emergency sell all triggered!");
  await tradingEngine.emergencyStop();
});

process.on("SIGUSR2", async () => {
  console.log("💰 Balance check triggered!");
  const balance = await balanceManager.getFormattedBalanceInfo();
  console.log(balance);
});

// Unhandled errors
process.on("uncaughtException", async (error) => {
  console.error("💥 Uncaught Exception:", error);
  await telegramManager.notifyError(`Uncaught exception: ${error.message}`).catch(() => {});
  process.exit(1);
});

process.on("unhandledRejection", async (reason, promise) => {
  console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
  await telegramManager.notifyError(`Unhandled rejection: ${reason}`).catch(() => {});
});

// Export for external usage
export { startBot };

// Auto-start if called directly
if (require.main === module) {
  startBot().catch(console.error);
}