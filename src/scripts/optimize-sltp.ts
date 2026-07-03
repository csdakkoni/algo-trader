// ============================================================
// SL/TP Optimizasyon Analizi
// 30 BIST hissesinin 1 yıllık verisini farklı SL/TP
// kombinasyonlarıyla tarayarak en karlı parametreleri bulur.
// ============================================================

import { supabase } from "../config/supabase.js";

// ─── Backtest Motor (Hafif versiyon) ─────────────────────────
interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  if (data.length === 0) return ema;
  const k = 2 / (period + 1);
  ema.push(data[0]!);
  for (let i = 1; i < data.length; i++) {
    ema.push(data[i]! * k + ema[i - 1]! * (1 - k));
  }
  return ema;
}

function runBacktest(
  candles: Candle[],
  sl: number,
  tp: number
): { trades: number; wins: number; losses: number; netPnlPct: number; maxDD: number } {
  const closes = candles.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const volumeSMA = closes.map((_, i) => {
    if (i < 19) return 0;
    let sum = 0;
    for (let j = i - 19; j <= i; j++) sum += candles[j]!.volume;
    return sum / 20;
  });

  let capital = 100000;
  let peak = capital;
  let maxDD = 0;
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let inPosition = false;
  let entryPrice = 0;
  let qty = 0;

  for (let i = 20; i < candles.length; i++) {
    const c = candles[i]!;
    const prevClose = closes[i - 1]!;

    if (inPosition) {
      // SL/TP kontrolü
      if (c.low <= entryPrice * (1 - sl)) {
        const exitPrice = entryPrice * (1 - sl);
        capital += (exitPrice - entryPrice) * qty;
        losses++;
        trades++;
        inPosition = false;
      } else if (c.high >= entryPrice * (1 + tp)) {
        const exitPrice = entryPrice * (1 + tp);
        capital += (exitPrice - entryPrice) * qty;
        wins++;
        trades++;
        inPosition = false;
      }
    } else {
      // Giriş sinyali: Fiyat > EMA20 ve Hacim > Ortalama×1.5
      if (
        prevClose > ema20[i - 1]! &&
        candles[i - 1]!.volume > volumeSMA[i - 1]! * 1.5 &&
        capital > 1000
      ) {
        entryPrice = c.open;
        qty = Math.floor((capital * 0.1) / entryPrice); // sermayenin %10'u
        if (qty > 0) {
          inPosition = true;
        }
      }
    }

    // Drawdown hesapla
    const equity = inPosition ? capital + (c.close - entryPrice) * qty : capital;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }

  // Açık pozisyonu kapat
  if (inPosition) {
    const lastClose = closes[closes.length - 1]!;
    capital += (lastClose - entryPrice) * qty;
    trades++;
    if (lastClose > entryPrice) wins++;
    else losses++;
  }

  const netPnlPct = ((capital - 100000) / 100000) * 100;
  return { trades, wins, losses, netPnlPct, maxDD };
}

// ─── Ana Analiz ──────────────────────────────────────────────
async function main() {
  console.log("🔬 SL/TP OPTİMİZASYON ANALİZİ");
  console.log("━".repeat(60));
  console.log("30 BIST hissesi × farklı SL/TP kombinasyonları");
  console.log("━".repeat(60));
  console.log();

  // Tüm aktif hisseleri çek
  const { data: assets } = await supabase
    .from("assets")
    .select("id, ticker, name")
    .eq("is_active", true)
    .order("ticker");

  if (!assets || assets.length === 0) {
    console.log("❌ Hisse bulunamadı!");
    return;
  }

  // Her hissenin mum verilerini çek
  const stockData: Map<string, Candle[]> = new Map();
  for (const asset of assets) {
    const { data: candles } = await supabase
      .from("stock_candles")
      .select("*")
      .eq("asset_id", asset.id)
      .order("timestamp", { ascending: true });

    if (candles && candles.length >= 50) {
      stockData.set(asset.ticker, candles as Candle[]);
      console.log(`  ✅ ${asset.ticker}: ${candles.length} mum`);
    } else {
      console.log(`  ⏭️ ${asset.ticker}: yetersiz veri (${candles?.length ?? 0})`);
    }
  }

  console.log(`\n📊 ${stockData.size} hisse analiz edilecek\n`);

  // SL/TP kombinasyonları
  const slValues = [0.005, 0.008, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05];
  const tpValues = [0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.08, 0.10];

  interface ComboResult {
    sl: number;
    tp: number;
    avgPnlPct: number;
    totalTrades: number;
    avgWinRate: number;
    avgMaxDD: number;
    profitableStocks: number;
    totalStocks: number;
    ratio: number; // TP/SL oranı
  }

  const results: ComboResult[] = [];
  const totalCombos = slValues.length * tpValues.length;
  let combo = 0;

  for (const sl of slValues) {
    for (const tp of tpValues) {
      combo++;
      if (tp <= sl) continue; // TP, SL'den büyük olmalı

      let sumPnl = 0;
      let sumWinRate = 0;
      let sumMaxDD = 0;
      let totalTrades = 0;
      let profitable = 0;
      let count = 0;

      for (const [, candles] of stockData) {
        const r = runBacktest(candles, sl, tp);
        sumPnl += r.netPnlPct;
        sumWinRate += r.trades > 0 ? (r.wins / r.trades) * 100 : 0;
        sumMaxDD += r.maxDD;
        totalTrades += r.trades;
        if (r.netPnlPct > 0) profitable++;
        count++;
      }

      results.push({
        sl,
        tp,
        avgPnlPct: sumPnl / count,
        totalTrades,
        avgWinRate: sumWinRate / count,
        avgMaxDD: sumMaxDD / count,
        profitableStocks: profitable,
        totalStocks: count,
        ratio: tp / sl,
      });

      if (combo % 10 === 0) {
        process.stdout.write(`\r  İşleniyor: ${combo}/${totalCombos} kombinasyon...`);
      }
    }
  }

  console.log(`\r  ✅ ${results.length} kombinasyon analiz edildi.          \n`);

  // Sonuçları sırala
  const byPnl = [...results].sort((a, b) => b.avgPnlPct - a.avgPnlPct);
  const byWinRate = [...results].sort((a, b) => b.avgWinRate - a.avgWinRate);
  const byProfitableCount = [...results].sort((a, b) => b.profitableStocks - a.profitableStocks || b.avgPnlPct - a.avgPnlPct);

  // Skor bazlı sıralama (PnL × WinRate / MaxDD)
  const byScore = [...results]
    .filter((r) => r.totalTrades > 0 && r.avgMaxDD > 0)
    .map((r) => ({
      ...r,
      score: (r.avgPnlPct * r.avgWinRate) / (r.avgMaxDD || 1),
    }))
    .sort((a, b) => b.score - a.score);

  console.log("═".repeat(70));
  console.log("🏆 EN YÜKSEK ORTALAMA GETİRİ (Top 10)");
  console.log("═".repeat(70));
  console.log("  SL%    TP%    R:R   Ort.Getiri   WinRate   MaxDD   Kârlı Hisse");
  console.log("─".repeat(70));
  for (const r of byPnl.slice(0, 10)) {
    console.log(
      `  %${(r.sl * 100).toFixed(1).padStart(4)}  %${(r.tp * 100).toFixed(1).padStart(4)}   ${r.ratio.toFixed(1).padStart(4)}   ${r.avgPnlPct >= 0 ? "+" : ""}${r.avgPnlPct.toFixed(2).padStart(7)}%   ${r.avgWinRate.toFixed(1).padStart(5)}%   ${r.avgMaxDD.toFixed(1).padStart(5)}%   ${r.profitableStocks}/${r.totalStocks}`
    );
  }

  console.log();
  console.log("═".repeat(70));
  console.log("🎯 EN YÜKSEK WIN RATE (Top 10)");
  console.log("═".repeat(70));
  console.log("  SL%    TP%    R:R   Ort.Getiri   WinRate   MaxDD   Kârlı Hisse");
  console.log("─".repeat(70));
  for (const r of byWinRate.slice(0, 10)) {
    console.log(
      `  %${(r.sl * 100).toFixed(1).padStart(4)}  %${(r.tp * 100).toFixed(1).padStart(4)}   ${r.ratio.toFixed(1).padStart(4)}   ${r.avgPnlPct >= 0 ? "+" : ""}${r.avgPnlPct.toFixed(2).padStart(7)}%   ${r.avgWinRate.toFixed(1).padStart(5)}%   ${r.avgMaxDD.toFixed(1).padStart(5)}%   ${r.profitableStocks}/${r.totalStocks}`
    );
  }

  console.log();
  console.log("═".repeat(70));
  console.log("⚖️  EN İYİ DENGE SKORU (Getiri × WinRate / MaxDD) — Top 10");
  console.log("═".repeat(70));
  console.log("  SL%    TP%    R:R   Ort.Getiri   WinRate   MaxDD   Kârlı   Skor");
  console.log("─".repeat(70));
  for (const r of byScore.slice(0, 10)) {
    console.log(
      `  %${(r.sl * 100).toFixed(1).padStart(4)}  %${(r.tp * 100).toFixed(1).padStart(4)}   ${r.ratio.toFixed(1).padStart(4)}   ${r.avgPnlPct >= 0 ? "+" : ""}${r.avgPnlPct.toFixed(2).padStart(7)}%   ${r.avgWinRate.toFixed(1).padStart(5)}%   ${r.avgMaxDD.toFixed(1).padStart(5)}%   ${r.profitableStocks}/${r.totalStocks}    ${r.score.toFixed(1)}`
    );
  }

  console.log();
  console.log("═".repeat(70));
  console.log("📈 EN ÇOK HİSSEDE KÂRLI (Top 10)");
  console.log("═".repeat(70));
  console.log("  SL%    TP%    R:R   Ort.Getiri   WinRate   MaxDD   Kârlı Hisse");
  console.log("─".repeat(70));
  for (const r of byProfitableCount.slice(0, 10)) {
    console.log(
      `  %${(r.sl * 100).toFixed(1).padStart(4)}  %${(r.tp * 100).toFixed(1).padStart(4)}   ${r.ratio.toFixed(1).padStart(4)}   ${r.avgPnlPct >= 0 ? "+" : ""}${r.avgPnlPct.toFixed(2).padStart(7)}%   ${r.avgWinRate.toFixed(1).padStart(5)}%   ${r.avgMaxDD.toFixed(1).padStart(5)}%   ${r.profitableStocks}/${r.totalStocks}`
    );
  }

  // En iyi öneri
  const best = byScore[0];
  if (best) {
    console.log();
    console.log("━".repeat(70));
    console.log("💎 ÖNERİLEN OPTİMAL PARAMETRELER");
    console.log("━".repeat(70));
    console.log(`   Stop Loss  : %${(best.sl * 100).toFixed(1)}`);
    console.log(`   Take Profit: %${(best.tp * 100).toFixed(1)}`);
    console.log(`   Risk:Ödül   : 1:${best.ratio.toFixed(1)}`);
    console.log(`   Ort. Getiri : ${best.avgPnlPct >= 0 ? "+" : ""}${best.avgPnlPct.toFixed(2)}%`);
    console.log(`   Win Rate    : %${best.avgWinRate.toFixed(1)}`);
    console.log(`   Max Drawdown: %${best.avgMaxDD.toFixed(1)}`);
    console.log(`   Kârlı Hisse : ${best.profitableStocks}/${best.totalStocks}`);
    console.log("━".repeat(70));
  }
}

main().catch(console.error);
