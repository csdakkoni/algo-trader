// ============================================================
// Test Script: Backtest Motoru
//
// Bu script:
// 1. Supabase'den THYAO.IS ve EREGL.IS mum verilerini çeker
// 2. Her hisse için backtest motorunu çalıştırır
// 3. Sonuçları Markdown tablosu formatında konsola yazdırır
//
// Kullanım:
//   npm run test:backtest
// ============================================================

import { supabase } from "../config/supabase.js";
import { runBacktest } from "../services/backtest.service.js";
import type { StockCandle, BacktestResult } from "../types/database.js";

// ------------------------------------------------------------
// Yardımcı: Supabase'den mum verisi çek
// ------------------------------------------------------------

/**
 * Belirtilen ticker'a ait tüm mum verilerini kronolojik sırayla çeker.
 * Supabase varsayılan 1000 satır limitini aşmak için sayfalama yapar.
 */
async function fetchAllCandles(ticker: string): Promise<StockCandle[]> {
  // Önce asset'i bul
  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .select("id, ticker, name")
    .eq("ticker", ticker)
    .single();

  if (assetError || !asset) {
    throw new Error(`[DB] Hisse bulunamadı: ${ticker} — ${assetError?.message}`);
  }

  // Tüm mumları çek (sayfalama ile)
  const allCandles: StockCandle[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("stock_candles")
      .select("*")
      .eq("asset_id", asset.id)
      .order("timestamp", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`[DB] Mum verisi çekilemedi (${ticker}): ${error.message}`);
    }

    allCandles.push(...data);
    hasMore = data.length === PAGE_SIZE;
    offset += PAGE_SIZE;
  }

  console.log(`[DB] ${ticker}: ${allCandles.length} mum verisi çekildi.`);
  return allCandles;
}

// ------------------------------------------------------------
// Sonuç Formatlama
// ------------------------------------------------------------

/** Sayıyı Türk formatında binlik ayırıcıyla formatlar */
function formatCurrency(value: number): string {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** BacktestResult'ı Markdown tablosu olarak döndürür */
function formatResultAsTable(result: BacktestResult): string {
  const pnlEmoji = result.netPnl >= 0 ? "🟢" : "🔴";
  const winRateEmoji = result.winRate >= 50 ? "✅" : "⚠️";

  const lines = [
    `### 📊 ${result.ticker} — Backtest Sonuçları`,
    "",
    "| Metrik | Değer |",
    "|--------|-------|",
    `| Toplam Mum | ${result.totalCandles} |`,
    `| Toplam İşlem | ${result.totalTrades} |`,
    `| Kazanan İşlem | ${result.winningTrades} |`,
    `| Kaybeden İşlem | ${result.losingTrades} |`,
    `| ${winRateEmoji} Win Rate | **${result.winRate}%** |`,
    `| Başlangıç Kasası | ₺${formatCurrency(result.initialCapital)} |`,
    `| Bitiş Kasası | ₺${formatCurrency(result.finalCapital)} |`,
    `| ${pnlEmoji} Net Kâr/Zarar | **₺${formatCurrency(result.netPnl)}** |`,
    `| ${pnlEmoji} Net Kâr/Zarar (%) | **${result.netPnlPercent}%** |`,
    `| 📉 Max Drawdown | ${result.maxDrawdownPercent}% |`,
  ];

  return lines.join("\n");
}

/** İşlem geçmişini tablo formatında döndürür */
function formatTradesTable(result: BacktestResult): string {
  if (result.trades.length === 0) {
    return "_Hiç işlem yapılmadı._";
  }

  const lines = [
    `#### 📋 ${result.ticker} — İşlem Geçmişi`,
    "",
    "| # | Giriş Tarihi | Giriş ₺ | Çıkış Tarihi | Çıkış ₺ | Adet | K/Z ₺ | K/Z % | Neden |",
    "|---|-------------|---------|-------------|---------|------|-------|-------|-------|",
  ];

  for (const t of result.trades) {
    const entryDate = new Date(t.entryDate).toLocaleDateString("tr-TR");
    const exitDate = new Date(t.exitDate).toLocaleDateString("tr-TR");
    const emoji = t.pnl >= 0 ? "🟢" : "🔴";
    const reason =
      t.exitReason === "STOP_LOSS"
        ? "⛔ Stop"
        : t.exitReason === "TAKE_PROFIT"
          ? "🎯 Kâr Al"
          : "📅 Veri Sonu";

    lines.push(
      `| ${t.tradeNo} | ${entryDate} | ${formatCurrency(t.entryPrice)} | ${exitDate} | ${formatCurrency(t.exitPrice)} | ${t.quantity} | ${emoji} ${formatCurrency(t.pnl)} | ${t.pnlPercent.toFixed(2)}% | ${reason} |`
    );
  }

  return lines.join("\n");
}

// ------------------------------------------------------------
// Ana Test Fonksiyonu
// ------------------------------------------------------------

const TEST_TICKERS = ["THYAO.IS", "EREGL.IS"];

async function main(): Promise<void> {
  console.log("🚀 Algoritmik Trading — Modül 2: Backtest Motoru Testi");
  console.log("━".repeat(60));
  console.log(`📅 Tarih: ${new Date().toISOString()}`);
  console.log(`📊 Test hisseleri: ${TEST_TICKERS.join(", ")}`);
  console.log(`💰 Başlangıç kasası: ₺100.000`);
  console.log(`⛔ Stop Loss: %2 | 🎯 Take Profit: %6`);
  console.log(`📈 EMA Periyodu: 20 | Hacim Çarpanı: 2x`);
  console.log("━".repeat(60));

  const results: BacktestResult[] = [];

  for (const ticker of TEST_TICKERS) {
    console.log(`\n📌 ${ticker} için veriler çekiliyor...`);

    try {
      // 1. Mum verilerini çek
      const candles = await fetchAllCandles(ticker);

      if (candles.length === 0) {
        console.error(`❌ ${ticker}: Mum verisi bulunamadı!`);
        continue;
      }

      const firstDate = new Date(candles[0]!.timestamp).toLocaleDateString("tr-TR");
      const lastDate = new Date(
        candles[candles.length - 1]!.timestamp
      ).toLocaleDateString("tr-TR");
      console.log(`   Tarih aralığı: ${firstDate} — ${lastDate}`);

      // 2. Backtest çalıştır
      console.log(`   Backtest çalıştırılıyor...`);
      const result = runBacktest(ticker, candles);
      results.push(result);

      // 3. Sonuçları yazdır
      console.log("\n" + formatResultAsTable(result));
      console.log("");
      console.log(formatTradesTable(result));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ ${ticker}: Hata — ${message}`);
    }
  }

  // --------------------------------------------------------
  // Karşılaştırma Tablosu
  // --------------------------------------------------------
  if (results.length > 1) {
    console.log("\n" + "━".repeat(60));
    console.log("### 🏆 Karşılaştırma Tablosu\n");
    console.log(
      "| Hisse | İşlem | Win Rate | Net K/Z ₺ | Net K/Z % | Max DD % |"
    );
    console.log(
      "|-------|-------|----------|-----------|-----------|----------|"
    );

    for (const r of results) {
      const emoji = r.netPnl >= 0 ? "🟢" : "🔴";
      console.log(
        `| ${r.ticker} | ${r.totalTrades} | ${r.winRate}% | ${emoji} ₺${formatCurrency(r.netPnl)} | ${r.netPnlPercent}% | ${r.maxDrawdownPercent}% |`
      );
    }
  }

  console.log("\n" + "━".repeat(60));
  console.log("🎉 Backtest testi tamamlandı!");
  console.log("━".repeat(60) + "\n");
}

// Script'i çalıştır
main().catch((error) => {
  console.error("❌ Kritik hata:", error);
  process.exit(1);
});
