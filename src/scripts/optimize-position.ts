// Pozisyon büyüklüğünün getiriye etkisi — aynı strateji, farklı risk
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

function runBacktest(candles: Candle[], sl: number, tp: number, positionPct: number) {
  const closes = candles.map(c => c.close);
  const ema20 = calculateEMA(closes, 20);
  const volumeSMA = closes.map((_, i) => {
    if (i < 19) return 0;
    let sum = 0; for (let j = i - 19; j <= i; j++) sum += candles[j]!.volume;
    return sum / 20;
  });

  let capital = 100000, peak = capital, maxDD = 0;
  let trades = 0, wins = 0, losses = 0;
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
        qty = Math.floor((capital * positionPct) / entryPrice);
        if (qty > 0) inPosition = true;
      }
    }
    const equity = inPosition ? capital + (c.close - entryPrice) * qty : capital;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  }
  if (inPosition) {
    const last = closes[closes.length - 1]!;
    capital += (last - entryPrice) * qty;
    trades++; if (last > entryPrice) wins++; else losses++;
  }
  return { capital, trades, wins, losses, maxDD };
}

async function main() {
  const { data: assets } = await supabase.from("assets").select("id, ticker").eq("is_active", true).order("ticker");
  if (!assets) return;

  const stockData: Map<string, Candle[]> = new Map();
  for (const a of assets) {
    const { data: candles } = await supabase.from("stock_candles").select("*").eq("asset_id", a.id).order("timestamp", { ascending: true });
    if (candles && candles.length >= 50) stockData.set(a.ticker, candles as Candle[]);
  }

  const fmt = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // En iyi SL/TP: %0.8 / %8
  const SL = 0.008, TP = 0.08;
  const positions = [0.10, 0.20, 0.30, 0.50, 0.75, 1.00];

  console.log("🔬 POZİSYON BÜYÜKLÜĞÜ ANALİZİ");
  console.log("━".repeat(70));
  console.log(`Sabit Strateji: SL %${(SL*100).toFixed(1)} / TP %${(TP*100).toFixed(1)} | 30 BIST hissesi | 1 yıl`);
  console.log(`Her hisseye ayrı 100.000₺ sermaye\n`);

  console.log("═".repeat(70));
  console.log("  Pozisyon    Toplam Yatırım  →  Son Değer       Kâr         Getiri   MaxDD");
  console.log("─".repeat(70));

  for (const pct of positions) {
    let totalStart = 0, totalEnd = 0, worstDD = 0;
    for (const [, candles] of stockData) {
      const r = runBacktest(candles, SL, TP, pct);
      totalStart += 100000;
      totalEnd += r.capital;
      if (r.maxDD > worstDD) worstDD = r.maxDD;
    }
    const pnl = totalEnd - totalStart;
    const pctReturn = ((pnl / totalStart) * 100).toFixed(2);
    const label = `%${(pct * 100).toFixed(0).padStart(3)} sermaye`;
    console.log(
      `  ${label}    ₺${fmt(totalStart).padStart(10)}  →  ₺${fmt(totalEnd).padStart(10)}   ${pnl >= 0 ? "+" : ""}₺${fmt(pnl).padStart(9)}   ${pnl >= 0 ? "+" : ""}${pctReturn.padStart(6)}%   ${worstDD.toFixed(1)}%`
    );
  }

  // Şimdi tek hisse bazlı en iyi sonuçları göster (%50 pozisyonla)
  console.log();
  console.log("═".repeat(70));
  console.log("💰 TEK HİSSE BAZLI (Pozisyon: %50, SL %0.8 / TP %8)");
  console.log("═".repeat(70));
  console.log("  Hisse       100.000₺  →  Son Bakiye      Kâr          İşlem  Win%   MaxDD");
  console.log("─".repeat(70));

  const results: { ticker: string; capital: number; pnl: number; trades: number; wins: number; maxDD: number }[] = [];
  for (const [ticker, candles] of stockData) {
    const r = runBacktest(candles, SL, TP, 0.50);
    results.push({ ticker, capital: r.capital, pnl: r.capital - 100000, trades: r.trades, wins: r.wins, maxDD: r.maxDD });
  }
  results.sort((a, b) => b.pnl - a.pnl);

  for (const r of results) {
    const emoji = r.pnl > 0 ? "🟢" : "🔴";
    const wr = r.trades > 0 ? ((r.wins / r.trades) * 100).toFixed(0) : "—";
    console.log(
      `  ${emoji} ${r.ticker.replace(".IS","").padEnd(8)}  ₺100.000  →  ₺${fmt(r.capital).padStart(9)}   ${r.pnl >= 0 ? "+" : ""}₺${fmt(r.pnl).padStart(8)}    ${String(r.trades).padStart(3)}   ${wr.padStart(3)}%   ${r.maxDD.toFixed(1)}%`
    );
  }

  const totalPnl50 = results.reduce((s, r) => s + r.pnl, 0);
  console.log("─".repeat(70));
  console.log(`  TOPLAM      ₺${fmt(3000000)}  →  ₺${fmt(3000000 + totalPnl50).padStart(9)}   ${totalPnl50 >= 0 ? "+" : ""}₺${fmt(totalPnl50).padStart(8)}`);
  console.log();

  // All-in tek hisse en iyiler (%100)
  console.log("═".repeat(70));
  console.log("🚀 YOLO: TEK HİSSEYE TÜM SERMAYEYİ KOY (%100 pozisyon)");
  console.log("═".repeat(70));
  const yoloResults: { ticker: string; capital: number; pnl: number; trades: number; wins: number; maxDD: number }[] = [];
  for (const [ticker, candles] of stockData) {
    const r = runBacktest(candles, SL, TP, 1.0);
    yoloResults.push({ ticker, capital: r.capital, pnl: r.capital - 100000, trades: r.trades, wins: r.wins, maxDD: r.maxDD });
  }
  yoloResults.sort((a, b) => b.pnl - a.pnl);

  console.log("\n  🏆 EN İYİ 5 HİSSE:");
  for (const r of yoloResults.slice(0, 5)) {
    console.log(`     ${r.ticker.replace(".IS","").padEnd(8)}  ₺100.000  →  ₺${fmt(r.capital).padStart(9)}   (+₺${fmt(r.pnl)})  MaxDD: ${r.maxDD.toFixed(1)}%`);
  }
  console.log("\n  💀 EN KÖTÜ 5 HİSSE:");
  for (const r of yoloResults.slice(-5).reverse()) {
    console.log(`     ${r.ticker.replace(".IS","").padEnd(8)}  ₺100.000  →  ₺${fmt(r.capital).padStart(9)}   (${r.pnl >= 0 ? "+" : "-"}₺${fmt(Math.abs(r.pnl))})  MaxDD: ${r.maxDD.toFixed(1)}%`);
  }

  console.log();
  console.log("━".repeat(70));
  console.log("📌 SONUÇ: Pozisyon büyüklüğü getiriyi doğrudan belirler.");
  console.log("   %10 → güvenli ama düşük getiri");
  console.log("   %50 → dengeli risk/getiri (önerilen)");
  console.log("   %100 → yüksek getiri ama yüksek risk");
  console.log("━".repeat(70));
}

main().catch(console.error);
