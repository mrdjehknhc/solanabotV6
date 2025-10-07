// src/utils/emergencySell.ts
import { enhancedSniperooHandler } from "./handlers/enhancedSniperooHandler";
import { positionManager } from "./handlers/positionManager";

/**
 * IMPROVED: Emergency sell result interface
 */
interface EmergencySellResult {
  total: number;
  successful: number;
  failed: number;
  details: Array<{
    tokenAddress: string;
    success: boolean;
    error?: string;
  }>;
}

/**
 * IMPROVED: Emergency sell all positions with detailed tracking
 */
async function emergencySellAll(): Promise<EmergencySellResult> {
  console.log("🚨 EMERGENCY SELL ALL POSITIONS");
  console.log("=".repeat(50));
  
  try {
    // Get current positions
    const positions = positionManager.getPositions();
    
    if (positions.size === 0) {
      console.log("ℹ️ No active positions found");
      
      // Check Sniperoo API for any positions
      const walletPositions = await enhancedSniperooHandler.getWalletHoldings();
      
      if (!walletPositions || walletPositions.length === 0) {
        console.log("✅ No positions found in Sniperoo API either");
        
        return {
          total: 0,
          successful: 0,
          failed: 0,
          details: []
        };
      }
      
      console.log(`📊 Found ${walletPositions.length} positions in Sniperoo API`);
    } else {
      console.log(`⚠️ Found ${positions.size} active positions`);
    }
    
    console.log("🚨 Starting emergency sell process...");
    
    // IMPROVED: Execute emergency sell and capture results
    const result = await enhancedSniperooHandler.emergencySellAll();
    
    // IMPROVED: Log detailed results
    console.log("\n📊 EMERGENCY SELL RESULTS:");
    console.log("=".repeat(50));
    console.log(`✅ Successful: ${result.successful}/${result.total}`);
    console.log(`❌ Failed: ${result.failed}/${result.total}`);
    
    if (result.failed > 0) {
      console.log(`\n⚠️ FAILED POSITIONS:`);
      result.details
        .filter(d => !d.success)
        .forEach(d => {
          console.log(`   ${d.tokenAddress.slice(0, 8)}... - ${d.error || 'Unknown error'}`);
        });
    }
    
    // IMPROVED: Send detailed notification
    try {
      const { telegramManager } = await import("./handlers/telegramHandler");
      
      let message = `🚨 EMERGENCY SELL COMPLETED\n\n`;
      message += `📊 Results:\n`;
      message += `✅ Successful: ${result.successful}/${result.total}\n`;
      message += `❌ Failed: ${result.failed}/${result.total}\n`;
      
      if (result.failed > 0) {
        message += `\n⚠️ Some positions failed to sell!\n`;
        message += `Check logs for details.`;
      } else {
        message += `\n✅ All positions sold successfully!`;
      }
      
      await telegramManager.notifyError(message);
      
    } catch (notifyError) {
      console.log("💡 Could not send Telegram notification (bot may be disabled)");
    }
    
    return result;
    
  } catch (error) {
    console.error("❌ Emergency sell failed:", error);
    
    // IMPROVED: Better error notification
    try {
      const { telegramManager } = await import("./handlers/telegramHandler");
      await telegramManager.notifyError(
        `🚨 EMERGENCY SELL FAILED!\n\n` +
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
        `⚠️ Manual intervention required!`
      );
    } catch (notifyError) {
      console.log("💡 Could not send error notification");
    }
    
    throw error;
  }
}

/**
 * Quick emergency sell without detailed reporting
 */
async function quickEmergencySell(): Promise<void> {
  console.log("🚨 QUICK EMERGENCY SELL");
  
  try {
    await enhancedSniperooHandler.emergencySellAll();
    console.log("✅ Quick emergency sell completed");
  } catch (error) {
    console.error("❌ Quick emergency sell failed:", error);
    throw error;
  }
}

/**
 * IMPROVED: Emergency sell with retry logic
 */
async function emergencySellWithRetry(maxRetries: number = 2): Promise<EmergencySellResult> {
  console.log(`🚨 EMERGENCY SELL WITH RETRY (max ${maxRetries} retries)`);
  console.log("=".repeat(50));
  
  let lastResult: EmergencySellResult | null = null;
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    console.log(`\n🔄 Attempt ${attempt}/${maxRetries + 1}...`);
    
    try {
      lastResult = await emergencySellAll();
      
      // If all successful, we're done
      if (lastResult.failed === 0) {
        console.log(`\n✅ All positions sold successfully on attempt ${attempt}`);
        return lastResult;
      }
      
      // If some failed and we have retries left, try again
      if (lastResult.failed > 0 && attempt < maxRetries + 1) {
        console.log(`\n⚠️ ${lastResult.failed} positions failed. Retrying in 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
    } catch (error) {
      console.error(`❌ Attempt ${attempt} failed:`, error);
      
      if (attempt < maxRetries + 1) {
        console.log(`\n🔄 Retrying in 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
    }
  }
  
  // If we get here, we've exhausted retries
  if (lastResult && lastResult.failed > 0) {
    console.log(`\n⚠️ WARNING: ${lastResult.failed} positions could not be sold after ${maxRetries + 1} attempts`);
    
    try {
      const { telegramManager } = await import("./handlers/telegramHandler");
      await telegramManager.notifyError(
        `🚨 EMERGENCY SELL INCOMPLETE!\n\n` +
        `After ${maxRetries + 1} attempts:\n` +
        `✅ Successful: ${lastResult.successful}\n` +
        `❌ Failed: ${lastResult.failed}\n\n` +
        `⚠️ Manual intervention required!`
      );
    } catch (notifyError) {
      console.log("💡 Could not send notification");
    }
  }
  
  return lastResult || {
    total: 0,
    successful: 0,
    failed: 0,
    details: []
  };
}

// Export functions
export { emergencySellAll, quickEmergencySell, emergencySellWithRetry };

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--quick')) {
    quickEmergencySell()
      .then(() => {
        console.log("\n✅ Emergency sell completed successfully");
        process.exit(0);
      })
      .catch(error => {
        console.error("Emergency sell failed:", error);
        process.exit(1);
      });
  } else if (args.includes('--retry')) {
    const retries = parseInt(args[args.indexOf('--retry') + 1] || '2', 10);
    emergencySellWithRetry(retries)
      .then(result => {
        if (result.failed === 0) {
          console.log("\n✅ All positions sold successfully");
          process.exit(0);
        } else {
          console.log(`\n⚠️ ${result.failed} positions could not be sold`);
          process.exit(1);
        }
      })
      .catch(error => {
        console.error("Emergency sell with retry failed:", error);
        process.exit(1);
      });
  } else {
    emergencySellAll()
      .then(result => {
        if (result.failed === 0) {
          console.log("\n✅ All positions sold successfully");
          process.exit(0);
        } else {
          console.log(`\n⚠️ ${result.failed}/${result.total} positions failed to sell`);
          process.exit(1);
        }
      })
      .catch(error => {
        console.error("Emergency sell failed:", error);
        process.exit(1);
      });
  }
}