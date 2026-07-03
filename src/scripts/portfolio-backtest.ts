// ============================================================
// GERÇEKÇI PORTFÖY BACKTEST
// Tek sermaye havuzu, 30 hisse paralel tarama, 
// aynı anda birden fazla pozisyon, bileşik getiri
// ============================================================
import { supabase } from "../config/supabase.js";

interface Candle { timestamp: string; open: number; high: number; low: number; close: number; volume: number; }
interface Position { ticker: string; entryPrice: number; qty: number; sl: number; tp: number; entryDate: string; }
interface Trade { ticker: string; entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; qty: number; pnl: number; reason: string; }

function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  if (data.length === 0) return ema;
  const k = 2 / (period + 1);
  ema.push(data[0]!);
  for (let i = 1; i < data.length; i++) ema.push(data[i]! * k + ema[i - 1]! * (1 - k));
  return ema;
}

interface StockAnalysis {
  ticker: string;
  candles: Candle[];
  ema20: number[];
  volSMA20: number[];
}

async function main() {
  const { data: assets } = await supabase.from("assets").select("id, ticker").eq("is_active", true).order("ticker");
  if (!assets) return;

  // Tüm hisse verilerini çek
  const stocks: StockAnalysis[] = [];
  for (const a of assets) {
    const { data: candles } = await supabase.from("stock_candles").select("*").eq("asset_id", a.id).order("timestamp", { ascending: true });
    if (!candles || candles.length < 30) continue;
    const closes = candles.map((c: any) => c.close);
    const ema20 = calculateEMA(closes, 20);
    const volSMA20 = closes.map((_: any, i: number) => {
      if (i < 19) return 0;
      let sum = 0; for (let j = i - 19; j <= i; j++) sum += (candles[j] as any).volume;
      return sum / 20;
    });
    stocks.push({ ticker: a.ticker, candles: candles as Candle[], ema20, volSMA20 });
  }

  // Tüm hisselerin tarih bazlı ortak takvimini oluştur
  const allDates = new Set<string>();
  for (const s of stocks) {
    for (const c of s.candles) allDates.add(c.timestamp.split("T")[0]!);
  }
  const sortedDates = [...allDates].sort();

  const fmt = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtD = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Farklı senaryolar
  const scenarios = [
    { name: "Muhafazakâr", sl: 0.02, tp: 0.06, posSize: 0.15, maxPos: 5 },
    { name: "Dengeli", sl: 0.008, tp: 0.08, posSize: 0.20, maxPos: 8 },
    { name: "Agresif", sl: 0.008, tp: 0.08, posSize: 0.25, maxPos: 10 },
    { name: "Çok Agresif", sl: 0.005, tp: 0.10, posSize: 0.30, maxPos: 12 },
    { name: "Maksimum", sl: 0.005, tp: 0.10, posSize: 0.40, maxPos: 15 },
  ];

  // Mevduat karşılaştırması
  const MEVDUAT_YILLIK = 0.45; // %45 yıllık faiz
  const INITIAL = 100000;
  const mevduatFinal = INITIAL * (1 + MEVDUAT_YILLIK);

  console.log("🔬 GERÇEKÇI PORTFÖY BACKTEST — TEK SERMAYE HAVUZU");
  console.log("━".repeat(75));
  console.log(`Başlangıç Sermayesi: ₺${fmt(INITIAL)}`);
  console.log(`30 BIST hissesi paralel taranıyor | ${sortedDates.length} işlem günü (1 yıl)`);
  console.log(`Mevduat Faizi Karşılaştırma: %${(MEVDUAT_YILLIK * 100).toFixed(0)} yıllık → ₺${fmt(mevduatFinal)}`);
  console.log("━".repeat(75));

  for (const scenario of scenarios) {
    let cash = INITIAL;
    let peak = INITIAL;
    let maxDD = 0;
    const openPositions: Position[] = [];
    const closedTrades: Trade[] = [];

    // Her gün için simülasyon
    for (const date of sortedDates) {
      // 1. Açık pozisyonları kontrol et (SL/TP)
      const toClose: number[] = [];
      for (let p = 0; p < openPositions.length; p++) {
        const pos = openPositions[p]!;
        const stock = stocks.find(s => s.ticker === pos.ticker);
        if (!stock) continue;
        const candle = stock.candles.find(c => c.timestamp.split("T")[0] === date);
        if (!candle) continue;

        let exitPrice: number | null = null;
        let reason = "";

        if (candle.low <= pos.entryPrice * (1 - scenario.sl)) {
          exitPrice = pos.entryPrice * (1 - scenario.sl);
          reason = "STOP_LOSS";
        } else if (candle.high >= pos.entryPrice * (1 + scenario.tp)) {
          exitPrice = pos.entryPrice * (1 + scenario.tp);
          reason = "TAKE_PROFIT";
        }

        if (exitPrice !== null) {
          const pnl = (exitPrice - pos.entryPrice) * pos.qty;
          cash += exitPrice * pos.qty; // Pozisyonu nakite çevir
          closedTrades.push({
            ticker: pos.ticker, entryDate: pos.entryDate, exitDate: date,
            entryPrice: pos.entryPrice, exitPrice, qty: pos.qty, pnl, reason
          });
          toClose.push(p);
        }
      }
      // Kapatılan pozisyonları temizle
      for (let i = toClose.length - 1; i >= 0; i--) {
        openPositions.splice(toClose[i]!, 1);
      }

      // 2. Yeni sinyalleri tara (max pozisyon sınırı)
      if (openPositions.length < scenario.maxPos) {
        for (const stock of stocks) {
          if (openPositions.length >= scenario.maxPos) break;
          if (openPositions.some(p => p.ticker === stock.ticker)) continue; // Aynı hissede zaten pozisyon var

          const idx = stock.candles.findIndex(c => c.timestamp.split("T")[0] === date);
          if (idx < 20) continue;

          const prevClose = stock.candles[idx - 1]!.close;
          const prevVol = stock.candles[idx - 1]!.volume;
          const prevEMA = stock.ema20[idx - 1]!;
          const prevVolSMA = stock.volSMA20[idx - 1]!;

          // AL sinyali
          if (prevClose > prevEMA && prevVol > prevVolSMA * 1.5) {
            const entryPrice = stock.candles[idx]!.open;
            const allocAmount = cash * scenario.posSize;
            if (allocAmount < 1000) continue;
            const qty = Math.floor(allocAmount / entryPrice);
            if (qty <= 0) continue;

            cash -= entryPrice * qty; // Nakit azalt
            openPositions.push({
              ticker: stock.ticker, entryPrice, qty,
              sl: entryPrice * (1 - scenario.sl),
              tp: entryPrice * (1 + scenario.tp),
              entryDate: date,
            });
          }
        }
      }

      // 3. Drawdown hesapla
      let posValue = 0;
      for (const pos of openPositions) {
        const stock = stocks.find(s => s.ticker === pos.ticker);
        const candle = stock?.candles.find(c => c.timestamp.split("T")[0] === date);
        if (candle) posValue += candle.close * pos.qty;
        else posValue += pos.entryPrice * pos.qty;
      }
      const equity = cash + posValue;
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDD) maxDD = dd;
    }

    // Açık pozisyonları son fiyattan kapat
    let finalPosValue = 0;
    for (const pos of openPositions) {
      const stock = stocks.find(s => s.ticker === pos.ticker);
      if (stock) {
        const lastClose = stock.candles[stock.candles.length - 1]!.close;
        finalPosValue += lastClose * pos.qty;
      }
    }
    const finalEquity = cash + finalPosValue;
    const totalPnl = finalEquity - INITIAL;
    const totalReturn = (totalPnl / INITIAL) * 100;
    const winCount = closedTrades.filter(t => t.pnl > 0).length;
    const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length * 100) : 0;
    const totalProfit = closedTrades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
    const totalLoss = closedTrades.filter(t => t.pnl <= 0).reduce((s, t) => s + Math.abs(t.pnl), 0);
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : Infinity;

    console.log();
    console.log("═".repeat(75));
    console.log(`💰 ${scenario.name.toUpperCase()} — SL %${(scenario.sl*100).toFixed(1)} / TP %${(scenario.tp*100).toFixed(0)} | Poz: %${(scenario.posSize*100).toFixed(0)} | Max: ${scenario.maxPos} eşzamanlı`);
    console.log("═".repeat(75));
    console.log(`  Başlangıç     : ₺${fmt(INITIAL)}`);
    console.log(`  Son Değer     : ₺${fmt(finalEquity)}`);
    console.log(`  Net Kâr/Zarar : ${totalPnl >= 0 ? "+" : ""}₺${fmt(totalPnl)} (${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(1)}%)`);
    console.log(`  Toplam İşlem  : ${closedTrades.length} (${winCount} kazanç, ${closedTrades.length - winCount} kayıp)`);
    console.log(`  Win Rate      : %${winRate.toFixed(1)}`);
    console.log(`  Profit Factor : ${profitFactor === Infinity ? "∞" : fmtD(profitFactor)}`);
    console.log(`  Max Drawdown  : %${maxDD.toFixed(1)}`);
    console.log(`  Açık Pozisyon : ${openPositions.length}`);
    
    const beatsMevduat = totalReturn > MEVDUAT_YILLIK * 100;
    console.log(`  vs Mevduat    : ${beatsMevduat ? "✅ MEVDUATI GEÇTİ" : "❌ Mevduatın altında"} (Mevduat: +%${(MEVDUAT_YILLIK*100).toFixed(0)} = ₺${fmt(mevduatFinal)})`);

    // En kârlı işlemler
    const sortedTrades = [...closedTrades].sort((a, b) => b.pnl - a.pnl);
    if (sortedTrades.length > 0) {
      console.log(`\n  🏆 En kârlı 3 işlem:`);
      for (const t of sortedTrades.slice(0, 3)) {
        console.log(`     ${t.ticker.replace(".IS","")} | ₺${fmtD(t.entryPrice)} → ₺${fmtD(t.exitPrice)} | +₺${fmt(t.pnl)} | ${t.reason}`);
      }
      console.log(`  💀 En zararlı 3 işlem:`);
      for (const t of sortedTrades.slice(-3).reverse()) {
        console.log(`     ${t.ticker.replace(".IS","")} | ₺${fmtD(t.entryPrice)} → ₺${fmtD(t.exitPrice)} | -₺${fmt(Math.abs(t.pnl))} | ${t.reason}`);
      }
    }
  }

  console.log();
  console.log("━".repeat(75));
  console.log("📌 NOT: Bu simülasyon tek sermaye havuzundan 30 hisseyi paralel tarar.");
  console.log("   Aynı anda birden fazla pozisyon açar ve bileşik getiri hesaplar.");
  console.log("   Mevduat faizi yıllık %45 olarak kabul edilmiştir.");
  console.log("━".repeat(75));
}

main().catch(console.error);
