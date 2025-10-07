import dotenv from "dotenv";

// Load environment variables
dotenv.config();

export const config = {
  // 🎯 LIQUIDITY POOL MONITORING - Ловим только лучшие пулы
  liquidity_pool: [
    {
      enabled: true,
      id: "pump1",
      name: "pumpswap",
      program: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      instruction: "Program log: Instruction: CreatePool",
    },
    {
      enabled: true,
      id: "rad1", 
      name: "Raydium",
      program: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
      instruction: "Program log: initialize2: InitializeInstruction2",
    },
  ],
  concurrent_transactions: 1, // Держим 1 для стабильности
  wsol_pc_mint: "So11111111111111111111111111111111111111112",
  db: {
    pathname: "src/tracker/tokens.db",
  },
  
  // 💰 ENHANCED BALANCE MANAGEMENT - Агрессивно но безопасно
  token_buy: {
    provider: "sniperoo",
    
    buy_mode: "percentage", // Используем процентный режим
    balance_percentage: 8,  // 8% - агрессивно но не безумно
    min_sol_amount: 0.005, // Минимум снижен для мелких токенов
    max_sol_amount: 0.5,   // Максимум на случай больших балансов
    reserve_sol: 0.2,      // Увеличили резерв для стабильности
    
    // Для fixed режима (резерв)
    sol_amount: 0.05,
  },
  
  // 🎯 ENHANCED TRADING - Активируем все фичи риск-менеджмента
  advanced_trading: {
    enabled: true,
    
    risk_management: {
      initial_stop_loss_percent: 60, // Жесткий стоп-лосс для мемкоинов
      
      breakeven: {
        enabled: true,
        trigger_profit_percent: 25, // Быстрее переносим в безубыток
        breakeven_offset_percent: 8, // Гарантируем 8% прибыли
      },
      
      trailing_stop: {
        enabled: true,
        activation_profit_percent: 40, // Активируем трейлинг раньше
        trailing_distance_percent: 25, // Увеличили дистанцию для волатильности
      },
    },
    
    // 💰 TAKE PROFIT GRID - Оптимизированная сетка для гемов
    take_profit_grid: {
      enabled: true,
      levels: [
        {
          profit_percent: 30,    // Первая фиксация на 30%
          sell_percent: 15,      // Продаем 15% - осторожно
          description: "Quick profit lock"
        },
        {
          profit_percent: 75,    // При 75% прибыли
          sell_percent: 25,      // Продаем еще 25% (40% всего)
          description: "Major profit taking"
        },
        {
          profit_percent: 150,   // При 150% прибыли
          sell_percent: 30,      // Продаем еще 30% (70% всего)
          description: "Gem profit realization"
        },
        {
          profit_percent: 300,   // При 300% прибыли
          sell_percent: 20,      // Продаем еще 20% (90% всего)
          description: "Moon bag reduction"
        },
        {
          profit_percent: 800,   // При 800% прибыли (10x)
          sell_percent: 10,      // Продаем остатки (100% всего)
          description: "Final moon bag"
        }
      ]
    },
  },
  
  // 📱 TELEGRAM NOTIFICATIONS - Все включено
  telegram: {
    enabled: true,
    bot_token: process.env.TELEGRAM_BOT_TOKEN || "",
    
    whitelist: (process.env.TELEGRAM_CHAT_IDS || "")
      .split(",")
      .map(id => id.trim())
      .filter(id => id !== ""),
    
    notifications: {
      token_bought: true,
      token_sold: true,
      breakeven_moved: true,
      trailing_activated: true,
      errors: true,
      daily_summary: true,
      balance_warnings: true,
    },
    
    messages: {
      token_bought: "🎯 GEM SNIPED! 💎\n💰 Amount: {amount} SOL ({percentage}% of balance)\n🪙 Token: {token}\n💲 Entry: ${price}\n🔗 {links}",
      token_sold: "💸 GEM SOLD! 🚀\n📊 Reason: {reason}\n💰 P&L: {pnl}% ({pnl_sol} SOL)\n🪙 Token: {token}\n💲 Exit: ${price}",
      breakeven_moved: "🛡️ BREAKEVEN PROTECTION ACTIVE!\n🪙 Token: {token}\n📈 Profit: {profit}%\n🔒 Protected: {new_sl}%",
      trailing_activated: "🚀 TRAILING STOP ENGAGED!\n🪙 Token: {token}\n📈 Profit: {profit}%\n📉 Trailing: {distance}%",
      error: "❌ SNIPER ERROR\n{error_message}",
      balance_warning: "⚠️ BALANCE ALERT\n💰 Balance: {balance} SOL\n📉 Issue: {reason}",
    }
  },
  
  // 🔍 RUG CHECK SETTINGS - СТРОГИЕ ПАРАМЕТРЫ ДЛЯ ГЕМОВ
  checks: {
    simulation_mode: false,
    mode: "full", // Полная проверка обязательна
    verbose_logs: false, // Отключаем для скорости
    
    settings: {
      // 🚫 AUTHORITY CHECKS - Строго
      allow_mint_authority: false,     // Mint должен быть сожжен
      allow_freeze_authority: false,   // Freeze должен быть сожжен
      allow_not_initialized: false,    // Токен должен быть инициализирован
      allow_mutable: false,           // Метаданные не должны меняться
      allow_rugged: false,            // Очевидно
      
      // 👥 HOLDER DISTRIBUTION - Критично для гемов
      max_alowed_pct_topholders: 15,  // Макс 15% у одного холдера (строже!)
      exclude_lp_from_topholders: true,
      allow_insider_topholders: false,
      
      // 💧 LIQUIDITY REQUIREMENTS - Высокие стандарты
      min_total_lp_providers: 25,      // Минимум LP провайдеров (снизили немного)
      min_total_markets: 1,            // Минимум маркетов (реалистично)
      min_total_market_Liquidity: 8000, // Минимум $8K ликвидности (снизили)
      
      // 🛡️ SECURITY FILTERS
      block_returning_token_names: true,    // Блокируем дубли имен
      block_returning_token_creators: true, // Блокируем повторных создателей
      
      // 📝 NAME/SYMBOL FILTERS - Фильтруем мусор
      block_symbols: [
        "TEST", "SCAM", "RUG", "FAKE", "BOT", 
        "$", "XXX", "PUMP", "DUMP", "SHIT",
        "PEPE2", "DOGE2", "SHIB2" // Избегаем копии
      ],
      block_names: [
        "Test Token", "Scam Coin", "Rug Pull", "Fake Token",
        "Test", "Scam", "Rug", "Fake", "Bot Token", "Shit Coin",
        "PumpCoin", "DumpCoin", "TestNet"
      ],
      
      // 🎯 ADVANCED FILTERS
      ignore_ends_with_pump: true,  // Игнорируем .pump токены
      max_score: 500,               // Максимальный риск скор (средний)
    },
  },
  
  // ⚡ PERFORMANCE SETTINGS
  axios: {
    get_timeout: 8000, // Снизили для скорости
  },
};