// ============================================================
// 3 MOD KARAKTER ANALİZİ
// Her modu kendi zaman dilimine uygun parametrelerle test eder
// ============================================================
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

interface StockData { ticker: string; candles: Candle[]; }

function runBacktest(candles: Candle[], sl: number, tp: number, volMul: number, posSize: number) {
  const closes = candles.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const volSMA = closes.map((_, i) => {
    if (i < 19) return 0;
    let sum = 0; for (let j = i - 19; j <= i; j++) sum += candles[j]!.volume;
    return sum / 20;
  });

  let capital = 100000, peak = capital, maxDD = 0;
  let trades = 0, wins = 0, totalHoldDays = 0;
  let inPosition = false, entryPrice = 0, qty = 0, entryIdx = 0;

  for (let i = 20; i < candles.length; i++) {
    const c = candles[i]!;
    if (inPosition) {
      if (c.low <= entryPrice * (1 - sl)) {
        capital += (entryPrice * (1 - sl) - entryPrice) * qty;
        trades++; totalHoldDays += (i - entryIdx); inPosition = false;
      } else if (c.high >= entryPrice * (1 + tp)) {
        capital += (entryPrice * (1 + tp) - entryPrice) * qty;
        wins++; trades++; totalHoldDays += (i - entryIdx); inPosition = false;
      }
    } else {
      if (closes[i-1]! > ema20[i-1]! && candles[i-1]!.volume > volMul * volSMA[i-1]! && capital > 1000) {
        entryPrice = c.open;
        qty = Math.floor((capital * posSize) / entryPrice);
        if (qty > 0) { inPosition = true; entryIdx = i; }
      }
    }
    const eq = inPosition ? capital + (c.close - entryPrice) * qty : capital;
    if (eq > peak) peak = eq;
    const dd = ((peak - eq) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  if (inPosition) {
    const last = closes[closes.length - 1]!;
    capital += (last - entryPrice) * qty;
    trades++; totalHoldDays += (candles.length - 1 - entryIdx);
    if (last > entryPrice) wins++;
  }

  return {
    capital, trades, wins, maxDD,
    avgHold: trades > 0 ? totalHoldDays / trades : 0,
    pnlPct: ((capital - 100000) / 100000) * 100,
    winRate: trades > 0 ? (wins / trades) * 100 : 0,
  };
}

async function main() {
  const { data: assets } = await supabase.from("assets").select("id, ticker").eq("is_active", true).order("ticker");
  if (!assets) return;

  const stockData: StockData[] = [];
  for (const a of assets) {
    const { data: candles } = await supabase.from("stock_candles").select("*").eq("asset_id", a.id).order("timestamp", { ascending: true });
    if (candles && candles.length >= 50) stockData.push({ ticker: a.ticker, candles: candles as Candle[] });
  }

  const fmt = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // ─── 3 MOD KARAKTERİ ───────────────────────────────
  const modeTests = [
    {
      title: "🐢 TREND TAKİPÇİSİ (Uzun Vade — Günlük)",
      desc: "Sabırlı, güçlü trendleri yakalar, günlerce/haftalarca tutar",
      variants: [
        { label: "Mevcut (Optimize)", sl: 0.005, tp: 0.10, vol: 1.5, pos: 0.25 },
        { label: "Karakter A: Geniş SL", sl: 0.03, tp: 0.08, vol: 2.0, pos: 0.20 },
        { label: "Karakter B: Çok Geniş", sl: 0.04, tp: 0.10, vol: 2.0, pos: 0.20 },
        { label: "Karakter C: Dengeli", sl: 0.02, tp: 0.06, vol: 1.5, pos: 0.25 },
      ]
    },
    {
      title: "🦅 AVCI (Orta Vade — Saatlik)",
      desc: "Dengeli, orta vadeli dalgaları yakalar, saatler-günler tutar",
      variants: [
        { label: "Mevcut (Optimize)", sl: 0.008, tp: 0.08, vol: 1.5, pos: 0.25 },
        { label: "Karakter A: Orta SL/TP", sl: 0.015, tp: 0.04, vol: 1.5, pos: 0.20 },
        { label: "Karakter B: Dengeli", sl: 0.01, tp: 0.03, vol: 1.3, pos: 0.25 },
        { label: "Karakter C: Agresif", sl: 0.008, tp: 0.025, vol: 1.2, pos: 0.30 },
      ]
    },
    {
      title: "⚡ KESKİN NİŞANCI (Kısa Vade — 15dk)",
      desc: "Hızlı, çok sayıda küçük işlem, dakikalar-saatler tutar",
      variants: [
        { label: "Mevcut (Optimize)", sl: 0.005, tp: 0.10, vol: 1.5, pos: 0.25 },
        { label: "Karakter A: Gerçek Scalp", sl: 0.004, tp: 0.012, vol: 1.0, pos: 0.15 },
        { label: "Karakter B: Hızlı", sl: 0.005, tp: 0.015, vol: 1.2, pos: 0.20 },
        { label: "Karakter C: Orta Scalp", sl: 0.006, tp: 0.02, vol: 1.2, pos: 0.20 },
      ]
    },
  ];

  for (const mode of modeTests) {
    console.log();
    console.log("═".repeat(80));
    console.log(`${mode.title}`);
    console.log(`${mode.desc}`);
    console.log("═".repeat(80));
    console.log("  Varyant                SL%    TP%   R:R   Vol×   100K→       Getiri  İşlem  Win%  OrtTut  MaxDD");
    console.log("─".repeat(80));

    for (const v of mode.variants) {
      let sumCap = 0, sumTrades = 0, sumWins = 0, sumHold = 0, worstDD = 0, count = 0;

      for (const stock of stockData) {
        const r = runBacktest(stock.candles, v.sl, v.tp, v.vol, v.pos);
        sumCap += r.capital;
        sumTrades += r.trades;
        sumWins += r.wins;
        sumHold += r.avgHold * r.trades;
        if (r.maxDD > worstDD) worstDD = r.maxDD;
        count++;
      }

      const avgCap = sumCap / count;
      const avgReturn = ((avgCap - 100000) / 100000) * 100;
      const avgWinRate = sumTrades > 0 ? (sumWins / sumTrades) * 100 : 0;
      const avgHold = sumTrades > 0 ? sumHold / sumTrades : 0;
      const rr = v.tp / v.sl;

      console.log(
        `  ${v.label.padEnd(22)} ${(v.sl*100).toFixed(1).padStart(4)}  ${(v.tp*100).toFixed(1).padStart(5)}  ${rr.toFixed(1).padStart(4)}  ×${v.vol.toFixed(1)}  ₺${fmt(avgCap).padStart(9)}  ${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(1).padStart(5)}%  ${String(Math.round(sumTrades/count)).padStart(4)}   ${avgWinRate.toFixed(0).padStart(3)}%  ${avgHold.toFixed(1).padStart(5)}  ${worstDD.toFixed(1).padStart(5)}%`
      );
    }
  }

  console.log();
  console.log("━".repeat(80));
  console.log("📌 R:R = Risk:Ödül oranı (TP/SL)");
  console.log("   OrtTut = Ortalama tutma süresi (mum sayısı)");
  console.log("   Trend: 1 mum = 1 gün | Avcı: 1 mum = 1 saat | Scalper: 1 mum = 15dk");
  console.log("━".repeat(80));
}

main().catch(console.error);
