// ============================================================
// Crypto Daemon — 7/24 Kripto Trading Motoru
//
// PM2 ile arka planda çalışır. Borsa gibi kapanmaz!
// Her 5 dakikada uyanır ve 3 stratejiyi çalıştırır:
//   🐢 TREND  → 4h mum, sabırlı swing
//   🦅 AVCI   → 1h mum, orta vadeli
//   ⚡ SCALPER → 15m mum, hızlı scalping
//
// Binance Public API kullanır (API key gerekmez)
// ============================================================

import { supabase } from "../config/supabase.js";
import { fetchBinanceCandles, fetchBinancePrice, type BinanceInterval } from "../services/binance.service.js";
import { calculateEMA, calculateSMA, calculateRSI } from "../services/indicators.service.js";

// ------------------------------------------------------------
// Sabitler
// ------------------------------------------------------------

const INITIAL_BALANCE = 100_000;          // 100K USDT sanal
const CYCLE_INTERVAL_MS = 5 * 60 * 1000; // 5 dk — kripto daha hızlı
const MAX_CONCURRENT_POSITIONS = 8;
const POSITION_SIZE_RATIO = 0.25;

// Kripto strateji profilleri
interface CryptoProfile {
  mode: string;
  name: string;
  icon: string;
  interval: BinanceInterval;
  scanIntervalMs: number;
  indicatorPeriod: number;
  stopLossRatio: number;
  takeProfitRatio: number;
  volumeMultiplier: number;
  lookbackCandles: number;
}

const CRYPTO_PROFILES: CryptoProfile[] = [
  {
    mode: "CRYPTO_TREND",
    name: "Kripto Trend",
    icon: "🐢",
    interval: "4h",
    scanIntervalMs: 4 * 60 * 60 * 1000,
    indicatorPeriod: 20,
    stopLossRatio: 0.03,       // %3 — kripto daha volatil
    takeProfitRatio: 0.08,     // %8
    volumeMultiplier: 1.5,
    lookbackCandles: 50,
  },
  {
    mode: "CRYPTO_AVCI",
    name: "Kripto Avcı",
    icon: "🦅",
    interval: "1h",
    scanIntervalMs: 60 * 60 * 1000,
    indicatorPeriod: 20,
    stopLossRatio: 0.015,      // %1.5
    takeProfitRatio: 0.04,     // %4
    volumeMultiplier: 1.3,
    lookbackCandles: 60,
  },
  {
    mode: "CRYPTO_SCALPER",
    name: "Kripto Scalper",
    icon: "⚡",
    interval: "15m",
    scanIntervalMs: 5 * 60 * 1000,
    indicatorPeriod: 20,
    stopLossRatio: 0.005,      // %0.5
    takeProfitRatio: 0.015,    // %1.5
    volumeMultiplier: 1.0,
    lookbackCandles: 80,
  },
];

interface Asset { id: string; ticker: string; name: string; }

// ------------------------------------------------------------
// ANA DÖNGÜ
// ------------------------------------------------------------

function accountName(profile: CryptoProfile): string {
  return `Sanal Kasa - ${profile.name} (${profile.interval})`;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("🚀 Crypto Daemon Başlatılıyor...");
  console.log("   7/24 çalışır — borsa kapanmaz!\n");

  // Hesapları oluştur
  for (const profile of CRYPTO_PROFILES) {
    const name = accountName(profile);
    const { data } = await supabase.from("paper_accounts").select("id").eq("name", name).single();
    if (!data) {
      await supabase.from("paper_accounts").insert({ name, balance: INITIAL_BALANCE, currency: "USDT" });
      console.log(`  💰 ${profile.icon} Hesap oluşturuldu: ${name}`);
    }
  }

  console.log("\n🔄 Döngü başlıyor...\n");

  while (true) {
    const now = new Date();
    console.log(`\n⏰ [${now.toLocaleString("tr-TR")}] ──────────────────────────`);

    for (const profile of CRYPTO_PROFILES) {
      try {
        const name = accountName(profile);
        const { data: account } = await supabase
          .from("paper_accounts").select("id, balance").eq("name", name).single();
        if (!account) continue;

        // Pozisyon kontrolü
        await checkAndClosePositions(account.id, profile);
        // Sinyal taraması
        await scanAndOpen(account.id, profile);
      } catch (err) {
        console.error(`  ${profile.icon} ❌ Hata: ${err}`);
      }
    }

    console.log(`\n💤 ${CYCLE_INTERVAL_MS / 60000} dk uyuyor...\n`);
    await delay(CYCLE_INTERVAL_MS);
  }
}

// ------------------------------------------------------------
// POZİSYON KONTROLÜ (SL/TP)
// ------------------------------------------------------------

async function checkAndClosePositions(accountId: string, profile: CryptoProfile): Promise<void> {
  const { data: positions } = await supabase
    .from("paper_positions")
    .select("*, assets(ticker, name)")
    .eq("account_id", accountId)
    .eq("status", "OPEN");

  if (!positions || positions.length === 0) return;

  for (const pos of positions) {
    try {
      const ticker = (pos.assets as { ticker: string })?.ticker;
      if (!ticker) continue;

      const currentPrice = await fetchBinancePrice(ticker);

      if (currentPrice <= pos.stop_loss_price) {
        // STOP LOSS
        const pnl = (pos.stop_loss_price - pos.entry_price) * pos.quantity;
        await closePosition(pos.id, accountId, pos.stop_loss_price, pnl, profile, ticker, "SL");
      } else if (currentPrice >= pos.take_profit_price) {
        // TAKE PROFIT
        const pnl = (pos.take_profit_price - pos.entry_price) * pos.quantity;
        await closePosition(pos.id, accountId, pos.take_profit_price, pnl, profile, ticker, "TP");
      }
    } catch (err) {
      // Sessiz geç — fiyat çekilemezse skip
    }
    await delay(200);
  }
}

async function closePosition(
  posId: string, accountId: string, exitPrice: number,
  pnl: number, profile: CryptoProfile, ticker: string, reason: string
): Promise<void> {
  await supabase.from("paper_positions").update({
    status: "CLOSED", exit_price: exitPrice,
    exit_timestamp: new Date().toISOString(),
    profit_loss: parseFloat(pnl.toFixed(2)),
  }).eq("id", posId);

  const { data: account } = await supabase
    .from("paper_accounts").select("balance").eq("id", accountId).single();
  if (account) {
    // Yatırılan tutarı + kar/zararı geri ekle
    const { data: pos } = await supabase.from("paper_positions").select("entry_price, quantity").eq("id", posId).single();
    const invested = pos ? pos.entry_price * pos.quantity : 0;
    const newBalance = parseFloat((account.balance + invested + pnl).toFixed(2));
    await supabase.from("paper_accounts").update({ balance: newBalance }).eq("id", accountId);
  }

  const emoji = reason === "TP" ? "🎯" : "⛔";
  const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
  console.log(`  ${profile.icon} ${emoji} ${reason}: ${ticker} | ${pnlStr}`);
}

// ------------------------------------------------------------
// SİNYAL TARAMA & POZİSYON AÇMA
// ------------------------------------------------------------

async function scanAndOpen(accountId: string, profile: CryptoProfile): Promise<void> {
  const { count } = await supabase
    .from("paper_positions")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "OPEN");

  if (count && count >= MAX_CONCURRENT_POSITIONS) {
    console.log(`  ${profile.icon} 📌 ${count} açık pozisyon (max ${MAX_CONCURRENT_POSITIONS})`);
    return;
  }

  // Kripto varlıkları çek (USDT ile bitenler)
  const { data: assets } = await supabase
    .from("assets").select("id, ticker, name")
    .eq("is_active", true)
    .like("ticker", "%USDT")
    .order("ticker");

  if (!assets || assets.length === 0) return;

  // Zaten pozisyonu olan varlıkları atla
  const { data: openPos } = await supabase
    .from("paper_positions").select("asset_id")
    .eq("account_id", accountId).eq("status", "OPEN");
  const openAssetIds = new Set((openPos ?? []).map((p) => p.asset_id));
  let openedCount = 0;

  for (const asset of assets) {
    if (openAssetIds.has(asset.id)) continue;
    if ((count ?? 0) + openedCount >= MAX_CONCURRENT_POSITIONS) break;

    try {
      const signal = await checkCryptoSignal(asset.ticker, profile);

      if (signal) {
        const { data: freshAccount } = await supabase
          .from("paper_accounts").select("balance").eq("id", accountId).single();
        const currentBalance = freshAccount?.balance ?? 0;
        if (currentBalance < 100) break;

        console.log(`  ${profile.icon} 🚀 AL: ${asset.ticker} @ $${signal.price.toFixed(4)} | RSI: ${signal.rsi.toFixed(1)}`);
        await openCryptoPosition(accountId, asset, signal.price, currentBalance, profile);
        openedCount++;
      }
    } catch (err) {
      // Sessiz geç
    }
    await delay(300);
  }

  if (openedCount === 0) {
    console.log(`  ${profile.icon} Sinyal yok`);
  }
}

async function checkCryptoSignal(
  symbol: string, profile: CryptoProfile
): Promise<{ price: number; rsi: number } | null> {
  const candles = await fetchBinanceCandles(symbol, profile.interval, profile.lookbackCandles);
  if (candles.length < profile.indicatorPeriod) return null;

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const emaVals = calculateEMA(closes, profile.indicatorPeriod);
  const smaVols = calculateSMA(volumes, profile.indicatorPeriod);
  const rsiVals = calculateRSI(closes, 14);

  if (emaVals.length === 0 || smaVols.length === 0) return null;

  const lastClose = closes[closes.length - 1]!;
  const lastVolume = volumes[volumes.length - 1]!;
  const lastEMA = emaVals[emaVals.length - 1]!;
  const lastVolSMA = smaVols[smaVols.length - 1]!;
  const lastRSI = rsiVals.length > 0 ? rsiVals[rsiVals.length - 1]! : 50;

  // RSI > 70 → aşırı alım, alma!
  if (lastRSI > 70) return null;

  if (lastClose > lastEMA && lastVolume > profile.volumeMultiplier * lastVolSMA) {
    return { price: lastClose, rsi: lastRSI };
  }
  return null;
}

async function openCryptoPosition(
  accountId: string, asset: Asset, entryPrice: number,
  balance: number, profile: CryptoProfile
): Promise<void> {
  const allocAmount = balance * POSITION_SIZE_RATIO;
  // Kripto'da lot büyüklüğü farklı — dolar bazında al
  const quantity = parseFloat((allocAmount / entryPrice).toFixed(6));
  if (quantity <= 0) return;

  const cost = quantity * entryPrice;
  const sl = parseFloat((entryPrice * (1 - profile.stopLossRatio)).toFixed(6));
  const tp = parseFloat((entryPrice * (1 + profile.takeProfitRatio)).toFixed(6));

  await supabase.from("paper_positions").insert({
    account_id: accountId, asset_id: asset.id, type: "BUY",
    entry_price: entryPrice, stop_loss_price: sl, take_profit_price: tp,
    quantity, status: "OPEN",
  });

  await supabase.from("paper_accounts")
    .update({ balance: parseFloat((balance - cost).toFixed(2)) })
    .eq("id", accountId);

  console.log(
    `  ${profile.icon} ✅ POZİSYON: ${asset.ticker} | $${entryPrice.toFixed(4)} × ${quantity} | SL: $${sl.toFixed(4)} | TP: $${tp.toFixed(4)}`
  );
}

// ------------------------------------------------------------
// BAŞLAT
// ------------------------------------------------------------
main().catch((err) => { console.error("💥 Kritik hata:", err); process.exit(1); });
