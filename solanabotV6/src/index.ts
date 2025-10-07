import WebSocket from "ws";
import { config } from "./config";
import { validateEnv } from "./utils/env-validator";
import { WebSocketManager, ConnectionState } from "./utils/managers/websocketManager";
import { getMintFromSignature } from "./utils/handlers/signatureHandler";
import { getTokenAuthorities, TokenAuthorityStatus } from "./utils/handlers/tokenHandler";
import { getRugCheckConfirmed } from "./utils/handlers/rugCheckHandler";

// Enhanced imports
import { enhancedSniperooHandler } from "./utils/handlers/enhancedSniperooHandler";
import { positionManager } from "./utils/handlers/positionManager";
import { telegramManager } from "./utils/handlers/telegramHandler";
import { priceFeedHandler } from "./utils/handlers/priceFeedHandler";
import { balanceManager } from "./utils/handlers/balanceManager";

// Trading Engine import
import { tradingEngine } from "./core/tradingEngine";

// Regional Variables
let activeTransactions = 0;
const MAX_CONCURRENT = config.concurrent_transactions;
const CHECK_MODE = config.checks.mode || "full";
const BUY_PROVIDER = config.token_buy.provider;
const BUY_MODE = config.token_buy.buy_mode || "fixed";
const SUBSCRIBE_LP = config.liquidity_pool;
const SIM_MODE = config.checks.simulation_mode || false;

// Advanced trading settings
const ADVANCED_TRADING = config.advanced_trading.enabled || false;

// Current handled mint
let CURRENT_MINT: string = "";

// Statistics tracking with balance info
let dailyStats = {
  trades: 0,
  profits: 0,
  losses: 0,
  totalPnL: 0,
  startTime: Date.now(),
  startingBalance: 0,
  currentBalance: 0,
};

/**
 * Enhanced position update integration with real price feeds
 */
async function updatePositionsWithRealPrices(): Promise<void> {
  const positions = positionManager.getPositions();
  if (positions.size === 0) return;

  for (const [tokenAddress] of positions.entries()) {
    try {
      const currentPrice = await priceFeedHandler.getTokenPrice(tokenAddress);
      if (currentPrice) {
        await positionManager.updatePosition(tokenAddress, currentPrice);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`❌ [Position Update] Error updating ${tokenAddress}:`, errorMsg);
    }
  }
}

// Function used to handle the transaction once a new pool creation is found
async function processTransaction(signature: string): Promise<void> {
  console.log("================================================================");
  console.log("💦 [Process Transaction] New Liquidity Pool signature found");
  console.log("https://solscan.io/tx/" + signature);

  // 1. Extract token address
  const returnedMint = await getMintFromSignature(signature);
  if (!returnedMint) {
    console.log("❌ [Process Transaction] No valid token CA extracted");
    return;
  }
  
  // 2. Check for duplicate
  if (CURRENT_MINT === returnedMint) {
    console.log("⏭️ [Process Transaction] Skipping duplicate mint");
    return;
  }
  CURRENT_MINT = returnedMint;

  // 3. Use Trading Engine for pre-check
  const canTradeCheck = await tradingEngine.canTrade(returnedMint);
  
  if (!canTradeCheck.shouldTrade) {
    console.log(`❌ [Process Transaction] ${canTradeCheck.reason}`);
    CURRENT_MINT = "";
    return;
  }

  // 4. Perform rug check if enabled
  if (CHECK_MODE === "full") {
    if (returnedMint.toLowerCase().endsWith("pump") && config.checks.settings.ignore_ends_with_pump) {
      console.log("❌ [Process Transaction] Token ends with pump, skipping");
      return;
    }
    
    const isRugCheckPassed = await getRugCheckConfirmed(returnedMint);
    if (!isRugCheckPassed) {
      console.log("❌ [Process Transaction] Full rug check failed");
      return;
    }
  } else if (CHECK_MODE === "snipe") {
    const tokenAuthorityStatus = await getTokenAuthorities(returnedMint);
    if (!tokenAuthorityStatus.isSecure) {
      console.log("❌ [Process Transaction] Token authority check failed");
      return;
    }
  }

  // 5. Execute trade via Trading Engine
  if (BUY_PROVIDER === "sniperoo" && !SIM_MODE) {
    console.log("🔫 [Process Transaction] Executing trade via Trading Engine...");
    
    const result = await tradingEngine.executeTrade(returnedMint);
    
    if (!result.success) {
      console.log(`❌ [Process Transaction] Trade failed: ${result.error}`);
      CURRENT_MINT = "";
      return;
    }
    
    // Update statistics
    dailyStats.trades++;
    
    console.log("✅ [Process Transaction] Trade completed successfully");
  }

  // 6. Simulation mode
  if (SIM_MODE) {
    console.log("🧻 [Process Transaction] SIMULATION MODE - no actual trade");
    console.log(`💰 Would have bought ${canTradeCheck.buyAmount?.toFixed(4)} SOL worth`);
  }

  // 7. Display links
  console.log("👽 GMGN: https://gmgn.ai/sol/token/" + returnedMint);
  console.log("😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=" + returnedMint);
}

/**
 * Enhanced daily summary with balance tracking
 */
async function performDailyTasks(): Promise<void> {
  const now = Date.now();
  const daysPassed = (now - dailyStats.startTime) / (24 * 60 * 60 * 1000);
  
  if (daysPassed >= 1) {
    // Get current balance
    try {
      const currentBalance = await balanceManager.getBalance();
      dailyStats.currentBalance = currentBalance.solBalance;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Error getting balance for daily summary:", errorMsg);
    }
    
    // Calculate win rate
    const winRate = dailyStats.trades > 0 ? (dailyStats.profits / dailyStats.trades) * 100 : 0;
    
    // Send enhanced daily summary with balance info
    await telegramManager.notifyDailySummary({
      trades_count: dailyStats.trades,
      total_pnl: dailyStats.totalPnL,
      total_pnl_sol: dailyStats.totalPnL * (dailyStats.startingBalance || 0.1) / 100,
      win_rate: winRate,
      starting_balance: dailyStats.startingBalance,
      ending_balance: dailyStats.currentBalance,
    });
    
    // Reset daily stats
    const newStartingBalance = dailyStats.currentBalance;
    dailyStats = {
      trades: 0,
      profits: 0,
      losses: 0,
      totalPnL: 0,
      startTime: now,
      startingBalance: newStartingBalance,
      currentBalance: newStartingBalance,
    };
    
    console.log("📊 [Daily Tasks] Enhanced daily summary sent and stats reset");
  }
}

/**
 * Enhanced health check with balance monitoring
 */
async function performHealthChecks(): Promise<void> {
  console.log("🏥 [Health Check] Running optimized health check...");
  
  const { healthMonitor } = await import("./utils/healthCheck");
  const health = await healthMonitor.quickCheck();
  
  // Display brief status
  const emoji = health.overall === 'healthy' ? '✅' : 
               health.overall === 'warning' ? '⚠️' : '🚨';
  
  console.log(`${emoji} System Health: ${health.overall.toUpperCase()}`);
  console.log(`💰 Balance: ${health.metrics.balanceSOL.toFixed(4)} SOL (${health.metrics.estimatedTrades} trades)`);
  console.log(`🔫 APIs: Sniperoo ${health.components.sniperoo ? '✅' : '❌'}, DexScreener ${health.components.priceFeed ? '✅' : '❌'}`);
}

/**
 * Initialize balance tracking for daily stats
 */
async function initializeBalanceTracking(): Promise<void> {
  try {
    const initialBalance = await balanceManager.getBalance();
    dailyStats.startingBalance = initialBalance.solBalance;
    dailyStats.currentBalance = initialBalance.solBalance;
    console.log(`💰 [Init] Starting balance tracking: ${initialBalance.solBalance.toFixed(4)} SOL`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ [Init] Failed to initialize balance tracking:", errorMsg);
  }
}

// Main function to start the application
async function main(): Promise<void> {
  console.clear();
  console.log("🚀 Starting Enhanced Solana Token Sniper v2.0...");
  console.log("⚡ Features: Dynamic Balance Management, Risk Management, Take Profit Grid, Telegram Notifications");
  
  try {
    // Load environment variables
    const env = validateEnv();
    
    // Initialize balance tracking
    await initializeBalanceTracking();
    
    // Perform initial health checks
    await performHealthChecks();
    
    // Test Telegram if enabled
    if (config.telegram.enabled) {
      console.log("📱 [Startup] Testing Telegram notifications...");
      const telegramOk = await telegramManager.testConnection();
      if (!telegramOk) {
        console.warn("⚠️ [Startup] Telegram test failed - check bot token and chat IDs");
      }
    }

    // Display balance configuration
    console.log("\n💰 === BALANCE CONFIGURATION ===");
    const balanceStats = await balanceManager.getBalanceStats();
    console.log(`⚙️  Mode: ${balanceStats.buyMode.toUpperCase()}`);
    console.log(`💰 Total Balance: ${balanceStats.currentBalance.toFixed(4)} SOL`);
    console.log(`📊 Trading Balance: ${balanceStats.tradingBalance.toFixed(4)} SOL`);
    console.log(`🔒 Reserved: ${balanceStats.reservedAmount.toFixed(4)} SOL`);
    console.log(`🎯 Next Buy Amount: ${balanceStats.nextBuyAmount.toFixed(4)} SOL`);
    if (balanceStats.buyMode === "percentage") {
      console.log(`📈 Percentage: ${balanceStats.balancePercentage}%`);
    }
    console.log(`🔢 Estimated Trades: ${balanceStats.estimatedTrades}`);
    console.log("================================\n");

    // Check if balance is sufficient for trading
    if (balanceStats.estimatedTrades < 1) {
      console.warn("⚠️ WARNING: Insufficient balance for trading!");
      console.warn("💰 Please refund your wallet to continue");
      
      if (config.telegram.enabled) {
        await telegramManager.notifyError(
          "⚠️ Bot started but balance too low for trading!\n" +
          `💰 Current: ${balanceStats.currentBalance.toFixed(4)} SOL\n` +
          `🎯 Need: ${balanceStats.nextBuyAmount.toFixed(4)} SOL per trade`
        );
      }
    }

    // Create WebSocket manager
    const wsManager = new WebSocketManager({
      url: env.HELIUS_WSS_URI,
      initialBackoff: 1000,
      maxBackoff: 30000,
      maxRetries: Infinity,
      debug: true,
    });

    // Set up event handlers
    wsManager.on("open", () => {
      // Create subscription request for each program ID
      SUBSCRIBE_LP.filter((pool) => pool.enabled).forEach((pool) => {
        const subscriptionMessage = {
          jsonrpc: "2.0",
          id: pool.id,
          method: "logsSubscribe",
          params: [
            {
              mentions: [pool.program],
            },
            {
              commitment: "processed",
            },
          ],
        };
        wsManager.send(JSON.stringify(subscriptionMessage));
      });
    });

    // FIXED: Safe error handling in WebSocket message handler
    wsManager.on("message", async (data: WebSocket.Data) => {
      try {
        // Quick JSON parsing
        const parsedData = JSON.parse(data.toString());

        // Quick check for subscription response
        if (parsedData.result !== undefined && !parsedData.error) {
          console.log("✅ Subscription confirmed");
          return;
        }

        // Quick check for RPC errors
        if (parsedData.error) {
          console.error("🚫 RPC Error:", parsedData.error);
          return;
        }

        // Optimized data extraction
        const params = parsedData?.params;
        if (!params) return;

        const result = params.result;
        if (!result) return;

        const value = result.value;
        if (!value) return;

        const { logs, signature } = value;

        // Quick validation
        if (!Array.isArray(logs) || !signature || typeof signature !== "string") return;

        // Quick check for pool creation
        const liquidityInstructions = SUBSCRIBE_LP
          .filter(pool => pool.enabled)
          .map(pool => pool.instruction);

        const isNewPool = logs.some((log: string) => 
          typeof log === "string" && 
          liquidityInstructions.some(instruction => log.includes(instruction))
        );

        if (!isNewPool) return;

        // Check concurrent transaction limit
        if (activeTransactions >= MAX_CONCURRENT) {
          console.log("⏳ Max concurrent transactions reached");
          return;
        }

        // Increment counter and process asynchronously
        activeTransactions++;

        // Don't await - maximum speed
        processTransaction(signature)
          .catch(error => {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("Transaction processing error:", errorMessage);
            telegramManager.notifyError(`Processing error: ${errorMessage}`).catch(() => {});
          })
          .finally(() => {
            activeTransactions--;
          });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown";
        console.error("💥 Message processing error:", errorMessage);
      }
    });

    wsManager.on("error", (error: Error) => {
      console.error("WebSocket error:", error.message);
      telegramManager.notifyError(`WebSocket error: ${error.message}`);
    });

    wsManager.on("state_change", (state: ConnectionState) => {
      if (state === ConnectionState.RECONNECTING) {
        console.log("📴 WebSocket connection lost, attempting to reconnect...");
      } else if (state === ConnectionState.CONNECTED) {
        console.log("🔄 WebSocket reconnected successfully.");
      }
    });

    // Start the connection
    wsManager.connect();

    // Setup periodic tasks
    
    // Position updates (every 15 seconds)
    const positionUpdateInterval = setInterval(async () => {
      if (ADVANCED_TRADING) {
        await updatePositionsWithRealPrices();
      }
    }, 15000);

    // Balance monitoring (every 5 minutes)
    const balanceMonitorInterval = setInterval(async () => {
      try {
        await balanceManager.checkBalanceWarnings();
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("Error in balance monitoring:", errorMsg);
      }
    }, 5 * 60 * 1000);

    // Daily tasks (every hour check)
    const dailyTasksInterval = setInterval(async () => {
      await performDailyTasks();
    }, 60 * 60 * 1000);

    // Health checks (every 5 minutes)
    const healthCheckInterval = setInterval(async () => {
      await performHealthChecks();
    }, 5 * 60 * 1000);

    // Balance status report (every 30 minutes)
    const balanceReportInterval = setInterval(async () => {
      try {
        const stats = await balanceManager.getBalanceStats();
        await telegramManager.notifyBalanceStatus({
          balance: stats.currentBalance,
          tradingBalance: stats.tradingBalance,
          nextBuyAmount: stats.nextBuyAmount,
          estimatedTrades: stats.estimatedTrades,
          buyMode: stats.buyMode,
          percentage: stats.balancePercentage,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("Error sending balance status report:", errorMsg);
      }
    }, 30 * 60 * 1000);

    // Handle application shutdown
    const shutdown = () => {
      console.log("\n🛑 Shutting down Enhanced Sniper with Balance Management...");
      
      // Clear intervals
      clearInterval(positionUpdateInterval);
      clearInterval(balanceMonitorInterval);
      clearInterval(dailyTasksInterval);
      clearInterval(healthCheckInterval);
      clearInterval(balanceReportInterval);
      
      // Stop position monitoring
      positionManager.stopMonitoring();
      
      // Disconnect WebSocket
      wsManager.disconnect();
      
      // Send shutdown notification with final balance
      (async () => {
        try {
          const finalBalance = await balanceManager.getBalance();
          await telegramManager.notifyError(
            `🛑 Sniper bot shutdown\n💰 Final Balance: ${finalBalance.solBalance.toFixed(4)} SOL`
          );
        } catch (error) {
          await telegramManager.notifyError("🛑 Sniper bot shutdown");
        }
      })();
      
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Emergency commands
    process.on("SIGUSR1", async () => {
      console.log("🚨 Emergency sell all triggered!");
      await tradingEngine.emergencyStop();
    });

    // Balance check command
    process.on("SIGUSR2", async () => {
      console.log("💰 Balance check triggered!");
      try {
        const formattedInfo = await balanceManager.getFormattedBalanceInfo();
        console.log(formattedInfo);
        
        await telegramManager.notifyBalanceStatus({
          balance: balanceStats.currentBalance,
          tradingBalance: balanceStats.tradingBalance,
          nextBuyAmount: balanceStats.nextBuyAmount,
          estimatedTrades: balanceStats.estimatedTrades,
          buyMode: balanceStats.buyMode,
          percentage: balanceStats.balancePercentage,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error("Error in balance check:", errorMsg);
      }
    });

    // Log startup completion
    console.log("✅ Enhanced Solana Token Sniper v2.0 with Dynamic Balance Management is running!");
    console.log("🎯 Advanced Trading:", ADVANCED_TRADING ? "ENABLED" : "DISABLED");
    console.log("📱 Telegram Notifications:", config.telegram.enabled ? "ENABLED" : "DISABLED");
    console.log("💰 Balance Mode:", BUY_MODE.toUpperCase());
    
    if (BUY_MODE === "percentage") {
      console.log("📊 Balance Percentage:", `${config.token_buy.balance_percentage}%`);
      console.log("🎯 Next Buy Amount:", `${balanceStats.nextBuyAmount.toFixed(4)} SOL`);
    } else {
      console.log("🔫 Fixed Buy Amount:", `${config.token_buy.sol_amount} SOL`);
    }
    
    console.log("🔢 Estimated Trades Remaining:", balanceStats.estimatedTrades);
    console.log("⏰ Started at:", new Date().toLocaleString());
    
    if (ADVANCED_TRADING) {
      console.log("\n🎯 ADVANCED FEATURES ACTIVE:");
      console.log("🛡️ Breakeven Protection:", config.advanced_trading.risk_management.breakeven.enabled ? "✅" : "❌");
      console.log("📈 Trailing Stop Loss:", config.advanced_trading.risk_management.trailing_stop.enabled ? "✅" : "❌");
      console.log("🎯 Take Profit Grid:", config.advanced_trading.take_profit_grid.enabled ? "✅" : "❌");
      console.log(`📊 TP Levels: ${config.advanced_trading.take_profit_grid.levels.length}`);
    }
    
    console.log("\n💰 BALANCE MANAGEMENT FEATURES:");
    console.log("📊 Dynamic Balance Calculation: ✅");
    console.log("⚠️ Balance Warnings: ✅");
    console.log("🏥 Health Monitoring: ✅");
    console.log("📈 Balance Reports: ✅");
    console.log("🔒 Reserve Protection: ✅");
    
    console.log("\n🚀 Ready to snipe tokens with advanced balance management!");
    console.log("💡 Pro Tips:");
    console.log("   - Your balance is monitored continuously");
    console.log("   - Buy amounts adapt to your current balance");
    console.log("   - You'll receive warnings when balance gets low");
    console.log("   - Emergency sell: kill -USR1 <process_id>");
    console.log("   - Balance check: kill -USR2 <process_id>");
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ [Startup] Fatal error:", errorMessage);
    
    if (config.telegram.enabled) {
      await telegramManager.notifyError(`Bot startup failed: ${errorMessage}`).catch(() => {});
    }
    
    throw error;
  }
}

// Export main function
export { main };

// Start the application only if this file is run directly
if (require.main === module) {
  main().catch((err) => {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Fatal error:", errorMessage);
    telegramManager.notifyError(`Fatal startup error: ${errorMessage}`);
    process.exit(1);
  });
}