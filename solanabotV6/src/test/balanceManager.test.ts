// src/test/balanceManager.test.ts
import { balanceManager } from "../utils/handlers/balanceManager";
import { config } from "../config";

async function testBalanceManager() {
  console.log("💰 === Testing Enhanced Balance Manager ===\n");

  try {
    // 1. Test balance fetching
    console.log("1. 📊 Testing balance fetching...");
    const balance = await balanceManager.getBalance();
    console.log(`   ✅ Balance fetched successfully`);
    console.log(`   💰 SOL Balance: ${balance.solBalance.toFixed(4)}`);
    console.log(`   🔒 Reserved: ${balance.reservedAmount.toFixed(4)} SOL`);
    console.log(`   📈 Available for trading: ${balance.availableForTrading.toFixed(4)}`);
    console.log(`   🎯 Calculated buy amount: ${balance.calculatedBuyAmount.toFixed(4)}`);
    if (balance.percentageUsed) {
      console.log(`   📊 Percentage used: ${balance.percentageUsed.toFixed(1)}%`);
    }

    // 2. Test affordability check
    console.log("\n2. 💸 Testing affordability check...");
    const canAfford = await balanceManager.canAffordTrade();
    console.log(`   ${canAfford.canTrade ? "✅" : "❌"} Can trade: ${canAfford.canTrade ? "YES" : "NO"}`);
    if (!canAfford.canTrade) {
      console.log(`   ⚠️  Reason: ${canAfford.reason}`);
    }
    if (canAfford.availableAmount) {
      console.log(`   💰 Available amount: ${canAfford.availableAmount.toFixed(4)} SOL`);
    }
    if (canAfford.recommendedAmount) {
      console.log(`   💡 Recommended minimum: ${canAfford.recommendedAmount.toFixed(4)} SOL`);
    }

    // 3. Test balance statistics
    console.log("\n3. 📈 Testing balance statistics...");
    const stats = await balanceManager.getBalanceStats();
    console.log(`   💰 Current balance: ${stats.currentBalance.toFixed(4)} SOL`);
    console.log(`   🔒 Reserved amount: ${stats.reservedAmount.toFixed(4)} SOL`);
    console.log(`   📊 Trading balance: ${stats.tradingBalance.toFixed(4)} SOL`);
    console.log(`   🎯 Next buy amount: ${stats.nextBuyAmount.toFixed(4)} SOL`);
    console.log(`   ⚙️  Buy mode: ${stats.buyMode.toUpperCase()}`);
    if (stats.buyMode === "percentage") {
      console.log(`   📊 Balance percentage: ${stats.balancePercentage}%`);
    }
    console.log(`   🔢 Estimated trades: ${stats.estimatedTrades}`);

    // 4. Test percentage simulations
    console.log("\n4. 🎲 Testing percentage simulations...");
    const percentages = [1, 2, 5, 10, 20, 50];
    const simulations = await balanceManager.simulatePercentages(percentages);
    
    console.log("   📊 Percentage scenarios:");
    console.log("   ┌─────────┬──────────────┬─────────┬─────────────┐");
    console.log("   │ Percent │ Buy Amount   │ Trades  │ Total Usage │");
    console.log("   ├─────────┼──────────────┼─────────┼─────────────┤");
    simulations.forEach(sim => {
      const percent = sim.percentage.toString().padStart(6);
      const amount = sim.buyAmount.toFixed(4).padStart(11);
      const trades = sim.numberOfTrades.toString().padStart(6);
      const usage = sim.totalUsage.toFixed(4).padStart(10);
      console.log(`   │  ${percent}% │ ${amount} SOL │  ${trades}  │ ${usage} SOL │`);
    });
    console.log("   └─────────┴──────────────┴─────────┴─────────────┘");

    // 5. Test optimal buy amount
    console.log("\n5. 🎯 Testing optimal buy amount...");
    const optimalAmount = await balanceManager.getOptimalBuyAmount();
    console.log(`   ✅ Optimal buy amount: ${optimalAmount.toFixed(4)} SOL`);

    // 6. Test cache behavior
    console.log("\n6. ⚡ Testing cache behavior...");
    console.time("   Cached request");
    await balanceManager.getBalance(); // Should use cache
    console.timeEnd("   Cached request");

    balanceManager.clearCache();
    console.time("   Fresh request");
    await balanceManager.getBalance(true); // Force refresh
    console.timeEnd("   Fresh request");

    // 7. Test health status
    console.log("\n7. 🏥 Testing health status...");
    const health = await balanceManager.getHealthStatus();
    const healthEmoji = health.status === 'healthy' ? '✅' : health.status === 'warning' ? '⚠️' : '🚨';
    console.log(`   ${healthEmoji} Health Status: ${health.status.toUpperCase()}`);
    console.log(`   📝 Message: ${health.message}`);
    console.log(`   💰 Details:`);
    console.log(`      Balance: ${health.details.balance.toFixed(4)} SOL`);
    console.log(`      Trading: ${health.details.tradingBalance.toFixed(4)} SOL`);
    console.log(`      Next Buy: ${health.details.nextBuyAmount.toFixed(4)} SOL`);
    console.log(`      Possible Trades: ${health.details.possibleTrades}`);

    // 8. Test formatted balance info
    console.log("\n8. 📋 Testing formatted balance info...");
    const formattedInfo = await balanceManager.getFormattedBalanceInfo();
    console.log("   📄 Formatted info:");
    console.log(formattedInfo.split('\n').map(line => `      ${line}`).join('\n'));

    // 9. Test balance warnings (simulation)
    console.log("\n9. ⚠️  Testing balance warnings...");
    console.log("   📝 Checking if warnings would be triggered...");
    await balanceManager.checkBalanceWarnings();
    console.log("   ✅ Warning check completed");

    console.log("\n💰 === Balance Manager Test Complete ===");
    
    // Summary with recommendations
    console.log("\n📊 SUMMARY & RECOMMENDATIONS:");
    console.log("=".repeat(50));
    
    const currentMode = config.token_buy.buy_mode || "fixed";
    const currentBalance = stats.currentBalance;
    const tradingBalance = stats.tradingBalance;
    const nextBuy = stats.nextBuyAmount;
    
    console.log(`💰 Current Setup:`);
    console.log(`   Mode: ${currentMode.toUpperCase()}`);
    console.log(`   Balance: ${currentBalance.toFixed(4)} SOL`);
    console.log(`   Next Buy: ${nextBuy.toFixed(4)} SOL (${(nextBuy/tradingBalance*100).toFixed(1)}% of trading balance)`);
    console.log(`   Estimated Trades: ${stats.estimatedTrades}`);
    
    console.log(`\n🎯 Analysis:`);
    if (currentMode === "fixed") {
      console.log(`   💡 Consider switching to 'percentage' mode for better balance management`);
      console.log(`   💡 Current fixed amount represents ${(nextBuy/tradingBalance*100).toFixed(1)}% of your trading balance`);
      console.log(`   💡 Recommended percentage mode: 3-10% for conservative, 10-20% for aggressive`);
    } else {
      console.log(`   ✅ Using percentage mode: ${stats.balancePercentage}%`);
      if (stats.balancePercentage < 2) {
        console.log(`   💡 Very conservative approach - consider 3-5% for more activity`);
      } else if (stats.balancePercentage > 20) {
        console.log(`   ⚠️  Aggressive approach - consider reducing to 10-15% for better risk management`);
      } else {
        console.log(`   ✅ Good percentage range for balanced trading`);
      }
    }
    
    // Balance health recommendations
    if (health.status === 'critical') {
      console.log(`   🚨 CRITICAL: Refund wallet immediately!`);
    } else if (health.status === 'warning') {
      console.log(`   ⚠️  WARNING: Consider refunding wallet soon`);
    } else if (stats.estimatedTrades < 10) {
      console.log(`   💡 Low number of possible trades - consider refunding for more opportunities`);
    }
    
    // Efficiency recommendations
    const efficiency = (nextBuy / currentBalance) * 100;
    console.log(`\n⚡ Efficiency:`);
    console.log(`   Capital Efficiency: ${efficiency.toFixed(1)}% of total balance per trade`);
    if (efficiency < 5) {
      console.log(`   💡 Very safe but slow growth - consider increasing buy amount`);
    } else if (efficiency > 15) {
      console.log(`   ⚠️  High risk per trade - consider reducing buy amount`);
    } else {
      console.log(`   ✅ Good balance between safety and growth potential`);
    }

  } catch (error) {
    console.error("❌ Balance Manager test failed:", error);
    console.error("\n🔧 Troubleshooting:");
    console.error("   1. Check your .env file has correct SNIPEROO_PUBKEY");
    console.error("   2. Check your Helius RPC endpoints are working");
    console.error("   3. Ensure wallet address is valid");
  }
}

// Advanced test function for different scenarios
async function testDifferentScenarios() {
  console.log("\n🎯 === Advanced Scenario Testing ===");
  
  const scenarios = [
    { name: "Conservative", percentage: 3, description: "Safe for beginners" },
    { name: "Balanced", percentage: 7, description: "Good risk/reward balance" },
    { name: "Aggressive", percentage: 15, description: "Higher risk, faster growth" },
    { name: "YOLO", percentage: 25, description: "Maximum risk (not recommended)" },
  ];
  
  console.log("\n📊 Scenario Analysis:");
  console.log("┌─────────────┬────────┬──────────────┬─────────┬──────────────────┐");
  console.log("│ Scenario    │ Percent│ Buy Amount   │ Trades  │ Description      │");
  console.log("├─────────────┼────────┼──────────────┼─────────┼──────────────────┤");
  
  for (const scenario of scenarios) {
    try {
      const simulations = await balanceManager.simulatePercentages([scenario.percentage]);
      const sim = simulations[0];
      
      const name = scenario.name.padEnd(10);
      const percent = `${scenario.percentage}%`.padStart(6);
      const amount = `${sim.buyAmount.toFixed(4)} SOL`.padStart(13);
      const trades = sim.numberOfTrades.toString().padStart(6);
      const desc = scenario.description.substring(0, 15).padEnd(15);
      
      console.log(`│ ${name} │ ${percent} │ ${amount} │ ${trades} │ ${desc} │`);
    } catch (error) {
      console.log(`│ ${scenario.name.padEnd(10)} │   ERROR   │     ERROR    │  ERROR  │ Failed to calc   │`);
    }
  }
  console.log("└─────────────┴────────┴──────────────┴─────────┴──────────────────┘");
}

// Performance test
async function testPerformance() {
  console.log("\n⚡ === Performance Testing ===");
  
  const iterations = 10;
  const times: number[] = [];
  
  console.log(`Running ${iterations} balance fetch operations...`);
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now();
    await balanceManager.getBalance();
    const duration = Date.now() - start;
    times.push(duration);
    
    if (i === 0) {
      console.log(`   First call (no cache): ${duration}ms`);
    }
  }
  
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  console.log(`📊 Performance Results:`);
  console.log(`   Average time: ${avgTime.toFixed(2)}ms`);
  console.log(`   Fastest: ${minTime}ms`);
  console.log(`   Slowest: ${maxTime}ms`);
  console.log(`   Cache effectiveness: ${((times[0] - avgTime) / times[0] * 100).toFixed(1)}% faster with cache`);
}

// Run all tests
async function runAllTests() {
  try {
    await testBalanceManager();
    await testDifferentScenarios();
    await testPerformance();
    
    console.log("\n🎉 === ALL TESTS COMPLETED SUCCESSFULLY ===");
    console.log(`⏰ Completed at: ${new Date().toLocaleString()}`);
    
  } catch (error) {
    console.error("\n💥 Test suite failed:", error);
    process.exit(1);
  }
}

// Export functions for individual testing
export { 
  testBalanceManager, 
  testDifferentScenarios, 
  testPerformance, 
  runAllTests 
};

// Run test if this file is executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--all')) {
    runAllTests().catch(console.error);
  } else if (args.includes('--scenarios')) {
    testDifferentScenarios().catch(console.error);
  } else if (args.includes('--performance')) {
    testPerformance().catch(console.error);
  } else {
    // Default: run main test
    testBalanceManager().catch(console.error);
  }
}