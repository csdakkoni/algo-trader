// Top 5 SL/TP kombinasyonu — hisse bazlı detaylı kârlılık raporu
import { supabase } from "../config/supabase.js";

interface Candle { timestamp: string; open: number; high: number; low: number; close: number; volume: number; }

function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  if (data.length === 0) return ema;
  const k = 2 / (period + 1);
  ema.push(data[0]!);
  for (let i = 1; i < data.length; i++) ema.push(data[i]! * k + ema[i - 1]! * (1 - k));
  return ema;
}

function runBacktest(candles: Candle[], sl: number, tp: number) {
  const closes = candles.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const volumeSMA = closes.map((_, i) => {
    if (i < 19) return 0;
    let sum = 0; for (let j = i - 19; j <= i; j++) sum += candles[j]!.volume;
    return sum / 20;
  });

  let capital = 100000, peak = capital, maxDD = 0, trades = 0, wins = 0, losses = 0;
  let inPosition = false, entryPrice = 0, qty = 0;

  for (let i = 20; i < candles.length; i++) {
    const c = candles[i]!;
    if (inPosition) {
      if (c.low <= entryPrice * (1 - sl)) {
        capital += (entryPrice * (1 - sl) - entryPrice) * qty;
        losses++; trades++; inPosition = false;
      } else if (c.high >= entryPrice * (1 + tp)) {
        capital += (entryPrice * (1 + tp) - entryPrice) * qty;
        wins++; trades++; inPosition = false;
      }
    } else {
      if (closes[i-1]! > ema20[i-1]! && candles[i-1]!.volume > volumeSMA[i-1]! * 1.5 && capital > 1000) {
        entryPrice = c.open;
        qty = Math.floor((capital * 0.1) / entryPrice);
        if (qty > 0) inPosition = true;
      }
    }
    const equity = inPosition ? capital + (c.close - entryPrice) * qty : capital;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  if (inPosition) {
    capital += (closes[closes.length - 1]! - entryPrice) * qty;
    trades++; if (closes[closes.length - 1]! > entryPrice) wins++; else losses++;
  }
  return { capital, trades, wins, losses, maxDD };
}

async function main() {
  const { data: assets } = await supabase.from("assets").select("id, ticker, name").eq("is_active", true).order("ticker");
  if (!assets) return;

  const stockData: Map<string, { ticker: string; name: string; candles: Candle[] }> = new Map();
  for (const a of assets) {
    const { data: candles } = await supabase.from("stock_candles").select("*").eq("asset_id", a.id).order("timestamp", { ascending: true });
    if (candles && candles.length >= 50) stockData.set(a.ticker, { ticker: a.ticker, name: a.name, candles: candles as Candle[] });
  }

  // En iyi 5 kombinasyon
  const combos = [
    { sl: 0.005, tp: 0.10, label: "SL %0.5 / TP %10" },
    { sl: 0.008, tp: 0.08, label: "SL %0.8 / TP %8" },
    { sl: 0.01,  tp: 0.08, label: "SL %1.0 / TP %8" },
    { sl: 0.05,  tp: 0.08, label: "SL %5.0 / TP %8 (Dengeli)" },
    { sl: 0.02,  tp: 0.06, label: "SL %2.0 / TP %6 (Mevcut Trend)" },
    { sl: 0.008, tp: 0.025, label: "SL %0.8 / TP %2.5 (Mevcut Avcı)" },
    { sl: 0.004, tp: 0.012, label: "SL %0.4 / TP %1.2 (Mevcut Scalper)" },
  ];

  const fmt = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  for (const combo of combos) {
    console.log();
    console.log("═".repeat(75));
    console.log(`💰 ${combo.label}`);
    console.log("═".repeat(75));
    console.log("  Hisse          Başlangıç    →    Son Bakiye      K/Z          İşlem  Win%");
    console.log("─".repeat(75));

    let totalStart = 0, totalEnd = 0, totalTrades = 0, totalWins = 0, winners = 0;
    const results: { ticker: string; name: string; start: number; end: number; trades: number; wins: number; pnl: number }[] = [];

    for (const [, stock] of stockData) {
      const r = runBacktest(stock.candles, combo.sl, combo.tp);
      const pnl = r.capital - 100000;
      results.push({ ticker: stock.ticker, name: stock.name, start: 100000, end: r.capital, trades: r.trades, wins: r.wins, pnl });
      totalStart += 100000;
      totalEnd += r.capital;
      totalTrades += r.trades;
      totalWins += r.wins;
      if (pnl > 0) winners++;
    }

    // PnL'e göre sırala
    results.sort((a, b) => b.pnl - a.pnl);

    for (const r of results) {
      const pnlStr = r.pnl >= 0 ? `+₺${fmt(r.pnl)}` : `-₺${fmt(Math.abs(r.pnl))}`;
      const winRate = r.trades > 0 ? ((r.wins / r.trades) * 100).toFixed(0) : "—";
      const emoji = r.pnl > 0 ? "🟢" : r.pnl === 0 ? "⚪" : "🔴";
      console.log(
        `  ${emoji} ${r.ticker.replace(".IS","").padEnd(8)} ₺${fmt(r.start).padStart(9)}    →  ₺${fmt(r.end).padStart(9)}    ${pnlStr.padStart(10)}    ${String(r.trades).padStart(3)}   ${winRate.padStart(3)}%`
      );
    }

    const totalPnl = totalEnd - totalStart;
    const avgWinRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : "0";
    console.log("─".repeat(75));
    console.log(
      `  TOPLAM ${" ".repeat(5)} ₺${fmt(totalStart).padStart(9)}    →  ₺${fmt(totalEnd).padStart(9)}    ${(totalPnl >= 0 ? "+" : "")}₺${fmt(totalPnl).padStart(9)}    ${String(totalTrades).padStart(3)}   ${avgWinRate}%`
    );
    console.log(`  📊 ${winners}/${results.length} hissede kârlı | Portföy getirisi: ${totalPnl >= 0 ? "+" : ""}${((totalPnl / totalStart) * 100).toFixed(2)}%`);
  }
}

main().catch(console.error);
