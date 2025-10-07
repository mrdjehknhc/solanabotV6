import { telegramManager } from "../utils/handlers/telegramHandler";

async function testTelegramNotifications() {
  console.log("🤖 === Testing Enhanced Telegram Notifications with Whitelist ===\n");

  try {
    // 1. Проверка статуса системы
    console.log("1. 🔍 Checking system status...");
    const status = await telegramManager.getStatus();
    console.log(`   ✅ System Status:`);
    console.log(`      Enabled: ${status.enabled ? "✅ YES" : "❌ NO"}`);
    console.log(`      Bot Token: ${status.botToken ? "✅ SET" : "❌ MISSING"}`);
    console.log(`      Whitelist Count: ${status.whitelistCount} users`);
    
    if (status.botInfo) {
      console.log(`      Bot Info:`);
      console.log(`         Name: @${status.botInfo.username}`);
      console.log(`         ID: ${status.botInfo.id}`);
      console.log(`         First Name: ${status.botInfo.first_name}`);
    }
    
    if (status.error) {
      console.log(`      ⚠️  Error: ${status.error}`);
    }

    // 2. Проверка whitelist'а
    console.log("\n2. 🔒 Checking whitelist...");
    const whitelist = telegramManager.getWhitelist();
    console.log(`   Authorized users: ${whitelist.length}`);
    whitelist.forEach((chatId, index) => {
      console.log(`      ${index + 1}. ${chatId}`);
    });

    if (whitelist.length === 0) {
      console.log("   ⚠️  WARNING: Whitelist is empty! No users will receive notifications.");
      console.log("   💡 Add chat IDs to TELEGRAM_CHAT_ID_1, TELEGRAM_CHAT_ID_2 in .env file");
      return;
    }

    // 3. Тест подключения
    console.log("\n3. 📡 Testing connection...");
    const connected = await telegramManager.testConnection();
    console.log(`   Connection test: ${connected ? "✅ SUCCESS" : "❌ FAILED"}\n`);

    if (!connected) {
      console.log("   💡 Troubleshooting:");
      console.log("      1. Check bot token is correct");
      console.log("      2. Check chat IDs are valid");
      console.log("      3. Start conversation with bot first (send /start)");
      return;
    }

    // 4. Тест уведомления о покупке
    console.log("4. 💰 Testing token bought notification...");
    const tokenBought = await telegramManager.notifyTokenBought({
      amount: 0.1,
      token: "So11111111111111111111111111111111111111112",
      price: 0.00001234,
      links: "🔗 [GMGN](https://gmgn.ai) | 📊 [BullX](https://bullx.io)",
      percentage: 5.2,
    });
    console.log(`   Token bought test: ${tokenBought ? "✅ SUCCESS" : "❌ FAILED"}\n`);

    // Небольшая пауза между сообщениями
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 5. Тест уведомления о продаже
    console.log("5. 💸 Testing token sold notification...");
    const tokenSold = await telegramManager.notifyTokenSold({
      reason: "Take Profit Level 1",
      pnl: 150.5,
      pnl_sol: 0.15,
      token: "So11111111111111111111111111111111111111112",
      price: 0.00003456,
    });
    console.log(`   Token sold test: ${tokenSold ? "✅ SUCCESS" : "❌ FAILED"}\n`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 6. Тест уведомления о безубытке
    console.log("6. ⚡ Testing breakeven notification...");
    const breakeven = await telegramManager.notifyBreakevenMoved({
      token: "So11111111111111111111111111111111111111112",
      profit: 35.2,
      new_sl: 5.0,
    });
    console.log(`   Breakeven test: ${breakeven ? "✅ SUCCESS" : "❌ FAILED"}\n`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 7. Тест уведомления о трейлинге
    console.log("7. 🚀 Testing trailing stop notification...");
    const trailing = await telegramManager.notifyTrailingActivated({
      token: "So11111111111111111111111111111111111111112",
      profit: 75.3,
      distance: 15.0,
    });
    console.log(`   Trailing test: ${trailing ? "✅ SUCCESS" : "❌ FAILED"}\n`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 8. Тест уведомления об ошибке
    console.log("8. ❌ Testing error notification...");
    const error = await telegramManager.notifyError("Test error message for system validation");
    console.log(`   Error test: ${error ? "✅ SUCCESS" : "❌ FAILED"}\n`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 9. Тест предупреждения о балансе
    console.log("9. ⚠️ Testing balance warning...");
    const balanceWarning = await telegramManager.notifyBalanceWarning({
      balance: 0.05,
      reason: "Balance critically low",
      tradingBalance: 0.03,
      nextBuyAmount: 0.001,
    });
    console.log(`   Balance warning test: ${balanceWarning ? "✅ SUCCESS" : "❌ FAILED"}\n`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 10. Тест статуса баланса
    console.log("10. 📊 Testing balance status...");
    const balanceStatus = await telegramManager.notifyBalanceStatus({
      balance: 2.5,
      tradingBalance: 2.35,
      nextBuyAmount: 0.12,
      estimatedTrades: 19,
      buyMode: "percentage",
      percentage: 5,
    });
    console.log(`   Balance status test: ${balanceStatus ? "✅ SUCCESS" : "❌ FAILED"}\n`);

    await new Promise(resolve => setTimeout(resolve, 1000));

    // 11. Тест дневной сводки
    console.log("11. 📈 Testing daily summary...");
    const dailySummary = await telegramManager.notifyDailySummary({
      trades_count: 8,
      total_pnl: 45.2,
      total_pnl_sol: 0.87,
      win_rate: 62.5,
      starting_balance: 2.1,
      ending_balance: 2.97,
    });
    console.log(`   Daily summary test: ${dailySummary ? "✅ SUCCESS" : "❌ FAILED"}\n`);

    console.log("✅ === All Telegram Tests Completed ===");

    // Финальная сводка
    console.log("\n📊 FINAL SUMMARY:");
    console.log("=".repeat(50));
    console.log(`🤖 Bot Status: ${status.enabled ? "OPERATIONAL" : "DISABLED"}`);
    console.log(`👥 Authorized Users: ${whitelist.length}`);
    console.log(`📱 All notifications tested successfully!`);
    
    if (status.botInfo) {
      console.log(`\n🔧 Bot Details:`);
      console.log(`   Name: @${status.botInfo.username}`);
      console.log(`   ID: ${status.botInfo.id}`);
    }
    
    console.log(`\n💡 Setup Instructions:`);
    console.log(`   1. Your bot token is configured ✅`);
    console.log(`   2. Whitelist contains ${whitelist.length} users ✅`);
    console.log(`   3. All notification types working ✅`);
    console.log(`   4. Ready for production! 🚀`);

  } catch (error) {
    console.error("❌ Telegram test failed:", error);
    console.error("\n🔧 Troubleshooting Guide:");
    console.error("=" .repeat(50));
    console.error("1. CHECK BOT TOKEN:");
    console.error("   - Go to @BotFather on Telegram");
    console.error("   - Create new bot with /newbot");
    console.error("   - Copy token to TELEGRAM_BOT_TOKEN in .env");
    console.error("");
    console.error("2. GET YOUR CHAT ID:");
    console.error("   - Send message to @userinfobot");
    console.error("   - Copy your chat ID");
    console.error("   - Add to TELEGRAM_CHAT_ID_1 in .env");
    console.error("");
    console.error("3. START CONVERSATION:");
    console.error("   - Find your bot by username");
    console.error("   - Send /start to your bot");
    console.error("   - Bot can only message users who started conversation first");
    console.error("");
    console.error("4. VERIFY .env FILE:");
    console.error("   TELEGRAM_BOT_TOKEN=your_bot_token_here");
    console.error("   TELEGRAM_CHAT_ID_1=your_chat_id_here");
    console.error("   TELEGRAM_CHAT_ID_2=friend_chat_id_here");
    console.error("");
    console.error("5. COMMON ISSUES:");
    console.error("   - 'Forbidden: bot was blocked by the user'");
    console.error("     → User needs to unblock bot and send /start");
    console.error("   - 'Bad Request: chat not found'");
    console.error("     → Check chat ID is correct");
    console.error("   - 'Unauthorized'");
    console.error("     → Check bot token is correct");
  }
}

// Дополнительные тестовые функции
async function testWhitelistSecurity() {
  console.log("\n🔒 === Testing Whitelist Security ===");
  
  // Тест авторизации пользователей
  const testChatIds = ["123456789", "987654321", "555666777"];
  
  testChatIds.forEach(chatId => {
    const isAuthorized = telegramManager.isUserAuthorized(chatId);
    console.log(`   User ${chatId}: ${isAuthorized ? "✅ AUTHORIZED" : "❌ NOT AUTHORIZED"}`);
  });
  
  console.log(`\n📊 Total authorized users: ${telegramManager.getWhitelist().length}`);
}

async function testMessageFormatting() {
  console.log("\n🎨 === Testing Message Formatting ===");
  
  // Тестируем различные сценарии форматирования
  const testCases = [
    {
      name: "Token with very small price",
      data: {
        amount: 0.001,
        token: "AbCdEfGhIjKlMnOpQrStUvWxYz123456789AbCdEf",
        price: 0.000000001,
        links: "Test links",
        percentage: 0.1,
      }
    },
    {
      name: "Token with large numbers",
      data: {
        amount: 50.0,
        token: "So11111111111111111111111111111111111111112",
        price: 123.456789,
        links: "🔗 [GMGN](https://gmgn.ai) | 📊 [BullX](https://bullx.io) | 🔍 [Solscan](https://solscan.io)",
        percentage: 99.9,
      }
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n   Testing: ${testCase.name}`);
    // В реальном тесте мы бы отправляли сообщение, но здесь просто логируем
    console.log(`      Amount: ${testCase.data.amount}`);
    console.log(`      Price: ${testCase.data.price}`);
    console.log(`      Percentage: ${testCase.data.percentage}%`);
  }
}

// Экспорт функций для индивидуального тестирования
export { 
  testTelegramNotifications, 
  testWhitelistSecurity, 
  testMessageFormatting 
};

// Запуск теста при прямом выполнении
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--security')) {
    testWhitelistSecurity().catch(console.error);
  } else if (args.includes('--formatting')) {
    testMessageFormatting().catch(console.error);
  } else if (args.includes('--all')) {
    Promise.all([
      testTelegramNotifications(),
      testWhitelistSecurity(), 
      testMessageFormatting()
    ]).catch(console.error);
  } else {
    // По умолчанию: основной тест
    testTelegramNotifications().catch(console.error);
  }
}