// ============================================================
// Daemon Trader v2 — 3'lü Paralel Yarış Motoru
//
// PM2 ile 7/24 arka planda çalışır.
// Her 15 dakikada uyanır ve 3 stratejiyi sırayla çalıştırır:
//   🐢 TREND  → Günlük mum, kendi sanal kasası
//   🦅 AVCI   → Saatlik mum, kendi sanal kasası
//   ⚡ SCALPER → 15dk mum, kendi sanal kasası
//
// Her stratejinin bağımsız hesabı, bağımsız pozisyonları vardır.
// ============================================================

import { supabase } from "../config/supabase.js";
import { fetchCandles } from "../services/yahoo-finance.service.js";
import { calculateEMA, calculateSMA, calculateRSI } from "../services/indicators.service.js";
import {
  getAllProfiles,
  type StrategyProfile,
} from "../services/strategy-profiles.js";
import type { Asset } from "../types/database.js";

// ------------------------------------------------------------
// Sabitler
// ------------------------------------------------------------

const INITIAL_BALANCE = 100_000;
const CYCLE_INTERVAL_MS = 15 * 60 * 1000; // 15 dk — en kısa mod
const MAX_CONCURRENT_POSITIONS = 8;       // Aynı anda max açık pozisyon
const POSITION_SIZE_RATIO = 0.25;         // Bakiyenin %25'i her işleme

/** Her mod için sanal kasa adı */
function accountName(profile: StrategyProfile): string {
  return `Sanal Kasa - ${profile.name} (${profile.interval})`;
}

// ------------------------------------------------------------
// 1. HESAP İLKLENDİRME
// ------------------------------------------------------------

async function ensureAccounts(): Promise<void> {
  const profiles = getAllProfiles();

  for (const profile of profiles) {
    const name = accountName(profile);
    const { data } = await supabase
      .from("paper_accounts")
      .select("id")
      .eq("name", name)
      .single();

    if (!data) {
      await supabase.from("paper_accounts").insert({
        name,
        balance: INITIAL_BALANCE,
        currency: "TRY",
      });
      console.log(`[Init] ✅ Hesap oluşturuldu: "${name}" — ₺${INITIAL_BALANCE.toLocaleString()}`);
    } else {
      console.log(`[Init] 📌 Hesap mevcut: "${name}"`);
    }
  }
}

/** Hesap ID'sini bul */
async function getAccountId(profile: StrategyProfile): Promise<string | null> {
  const { data } = await supabase
    .from("paper_accounts")
    .select("id")
    .eq("name", accountName(profile))
    .single();
  return data?.id ?? null;
}

// ------------------------------------------------------------
// 2. AÇIK POZİSYON KONTROLÜ (SL / TP)
// ------------------------------------------------------------

async function checkOpenPositions(
  accountId: string,
  profile: StrategyProfile
): Promise<void> {
  const { data: positions } = await supabase
    .from("paper_positions")
    .select("*, assets:asset_id(ticker)")
    .eq("account_id", accountId)
    .eq("status", "OPEN");

  if (!positions || positions.length === 0) return;

  for (const pos of positions) {
    const ticker = (pos.assets as unknown as { ticker: string } | null)?.ticker ?? "?";

    try {
      const price = await getLatestPrice(ticker);

      // Stop Loss
      if (price <= pos.stop_loss_price) {
        const pnl = (pos.stop_loss_price - pos.entry_price) * pos.quantity;
        const returnAmt = pos.quantity * pos.stop_loss_price;

        await supabase.from("paper_positions").update({
          status: "CLOSED", exit_price: pos.stop_loss_price,
          exit_timestamp: new Date().toISOString(),
          profit_loss: parseFloat(pnl.toFixed(2)),
        }).eq("id", pos.id);

        await addBalance(accountId, returnAmt);
        console.log(`  ${profile.icon} ⛔ STOP ${ticker} @ ₺${pos.stop_loss_price.toFixed(2)} | K/Z: ₺${pnl.toFixed(2)}`);
        continue;
      }

      // Take Profit
      if (price >= pos.take_profit_price) {
        const pnl = (pos.take_profit_price - pos.entry_price) * pos.quantity;
        const returnAmt = pos.quantity * pos.take_profit_price;

        await supabase.from("paper_positions").update({
          status: "CLOSED", exit_price: pos.take_profit_price,
          exit_timestamp: new Date().toISOString(),
          profit_loss: parseFloat(pnl.toFixed(2)),
        }).eq("id", pos.id);

        await addBalance(accountId, returnAmt);
        console.log(`  ${profile.icon} 🎯 TAKE PROFIT ${ticker} @ ₺${pos.take_profit_price.toFixed(2)} | K/Z: ₺${pnl.toFixed(2)}`);
        continue;
      }

      console.log(`  ${profile.icon} 📊 ${ticker}: ₺${price.toFixed(2)} (SL: ₺${pos.stop_loss_price.toFixed(2)} / TP: ₺${pos.take_profit_price.toFixed(2)})`);
    } catch (err) {
      console.error(`  ${profile.icon} ❌ ${ticker}: ${err}`);
    }
  }
}

// ------------------------------------------------------------
// 3. SİNYAL TARA & OTOMATİK İŞLEM AÇ
// ------------------------------------------------------------

async function scanAndExecute(
  accountId: string,
  profile: StrategyProfile
): Promise<void> {
  // Açık pozisyon varsa yeni alım yapma
  const { count } = await supabase
    .from("paper_positions")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "OPEN");

  if (count && count >= MAX_CONCURRENT_POSITIONS) {
    console.log(`  ${profile.icon} 📌 ${count} açık pozisyon (max ${MAX_CONCURRENT_POSITIONS}) — sinyal atlanıyor`);
    return;
  }

  const { data: assets } = await supabase
    .from("assets").select("*").eq("is_active", true).like("ticker", "%.IS").order("ticker");

  if (!assets || assets.length === 0) return;

  const { data: account } = await supabase
    .from("paper_accounts").select("balance").eq("id", accountId).single();

  if (!account || account.balance <= 0) {
    console.log(`  ${profile.icon} 💸 Yetersiz bakiye`);
    return;
  }

  // Zaten pozisyonu olan hisseleri atla
  const { data: openPos } = await supabase
    .from("paper_positions")
    .select("asset_id")
    .eq("account_id", accountId)
    .eq("status", "OPEN");
  const openAssetIds = new Set((openPos ?? []).map((p) => p.asset_id));
  let openedCount = 0;

  for (const asset of assets) {
    if (openAssetIds.has(asset.id)) continue; // Aynı hissede zaten pozisyon var
    if ((count ?? 0) + openedCount >= MAX_CONCURRENT_POSITIONS) break; // Max'a ulaşıldı

    try {
      const signal = await checkSignal(asset, profile);

      if (signal) {
        // Güncel bakiyeyi tekrar çek (önceki pozisyonlar düşmüş olabilir)
        const { data: freshAccount } = await supabase
          .from("paper_accounts").select("balance").eq("id", accountId).single();
        const currentBalance = freshAccount?.balance ?? 0;
        if (currentBalance < 1000) break;

        console.log(`  ${profile.icon} 🚀 AL SİNYALİ: ${asset.ticker} @ ₺${signal.price.toFixed(2)} | RSI: ${signal.rsi.toFixed(1)}`);
        await openPosition(accountId, asset, signal.price, currentBalance, profile);
        openedCount++;
        continue; // Birden fazla pozisyon açabilir
      }
    } catch (err) {
      console.error(`  ${profile.icon} ❌ ${asset.ticker}: ${err}`);
    }
    await delay(1000);
  }

  console.log(`  ${profile.icon} Sinyal yok`);
}

async function checkSignal(
  asset: Asset,
  profile: StrategyProfile
): Promise<{ price: number; rsi: number } | null> {
  const period1 = new Date();
  if (profile.interval === "1d") period1.setDate(period1.getDate() - profile.lookbackCandles);
  else if (profile.interval === "1h") period1.setHours(period1.getHours() - profile.lookbackCandles);
  else period1.setMinutes(period1.getMinutes() - profile.lookbackCandles * 15);

  const candles = await fetchCandles(asset.ticker, {
    period1: period1.toISOString(),
    interval: profile.interval,
  });

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

  // RSI > 70 → Aşırı alım bölgesi, alma!
  if (lastRSI > 70) return null;

  if (lastClose > lastEMA && lastVolume > profile.volumeMultiplier * lastVolSMA) {
    return { price: lastClose, rsi: lastRSI };
  }
  return null;
}

async function openPosition(
  accountId: string, asset: Asset, entryPrice: number, balance: number, profile: StrategyProfile
): Promise<void> {
  const allocAmount = balance * POSITION_SIZE_RATIO;
  const quantity = Math.floor(allocAmount / entryPrice);
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
    `  ${profile.icon} ✅ POZİSYON: ${asset.ticker} | ₺${entryPrice.toFixed(2)} × ${quantity} | SL: ₺${sl.toFixed(2)} | TP: ₺${tp.toFixed(2)}`
  );
}

// ------------------------------------------------------------
// YARDIMCI
// ------------------------------------------------------------

async function getLatestPrice(ticker: string): Promise<number> {
  const period1 = new Date();
  period1.setDate(period1.getDate() - 5);
  const candles = await fetchCandles(ticker, { period1: period1.toISOString(), interval: "1d" });
  if (candles.length === 0) throw new Error(`${ticker} fiyat alınamadı`);
  return candles[candles.length - 1]!.close;
}

async function addBalance(accountId: string, amount: number): Promise<void> {
  const { data } = await supabase.from("paper_accounts").select("balance").eq("id", accountId).single();
  if (data) {
    await supabase.from("paper_accounts")
      .update({ balance: parseFloat((data.balance + amount).toFixed(2)) })
      .eq("id", accountId);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ------------------------------------------------------------
// ANA DÖNGÜ — 3 STRATEJİ PARALEL
// ------------------------------------------------------------

async function runCycle(): Promise<void> {
  const profiles = getAllProfiles();
  const now = new Date().toLocaleString("tr-TR");

  console.log(`\n${"━".repeat(60)}`);
  console.log(`🏁 PARALEL YARIŞ DÖNGÜSÜ — ${now}`);
  console.log(`${"━".repeat(60)}`);

  for (const profile of profiles) {
    const accountId = await getAccountId(profile);
    if (!accountId) {
      console.log(`${profile.icon} ⚠️ Hesap bulunamadı: ${accountName(profile)}`);
      continue;
    }

    console.log(`\n${profile.icon} ── ${profile.name} (${profile.interval}) ──`);

    try {
      await checkOpenPositions(accountId, profile);
      await scanAndExecute(accountId, profile);
    } catch (err) {
      console.error(`${profile.icon} ❌ Hata: ${err}`);
    }

    await delay(500); // Rate limiting
  }
}

// ------------------------------------------------------------
// BORSA SAATİ KONTROLÜ
// ------------------------------------------------------------

function isBISTOpen(): boolean {
  const now = new Date();
  // Türkiye saati (UTC+3)
  const tr = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const day = tr.getDay(); // 0=Pazar, 6=Cumartesi
  const hour = tr.getHours();
  const minute = tr.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  // Hafta sonu kapalı
  if (day === 0 || day === 6) return false;

  // 09:30 - 18:00 arası açık
  const openTime = 9 * 60 + 30;  // 09:30
  const closeTime = 18 * 60;      // 18:00
  return timeInMinutes >= openTime && timeInMinutes < closeTime;
}

function nextOpenTime(): string {
  const now = new Date();
  const tr = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
  const day = tr.getDay();
  const hour = tr.getHours();
  const minute = tr.getMinutes();
  const timeInMinutes = hour * 60 + minute;

  if (day >= 1 && day <= 5 && timeInMinutes < 9 * 60 + 30) {
    return "bugün 09:30'da";
  }
  if (day === 5 && timeInMinutes >= 18 * 60) return "Pazartesi 09:30'da";
  if (day === 6) return "Pazartesi 09:30'da";
  if (day === 0) return "Pazartesi 09:30'da";
  return "yarın 09:30'da";
}

async function main(): Promise<void> {
  console.log("🏁 Daemon Trader v2 — 3'lü Paralel Yarış Motoru");
  console.log("   🐢 Trend Takipçisi (1d) | 🦅 Avcı (1h) | ⚡ Keskin Nişancı (15m)");
  console.log("   BIST 09:30-18:00 | Hafta içi\n");

  // Hesapları oluştur/kontrol et
  await ensureAccounts();

  // Sonsuz döngü
  while (true) {
    if (!isBISTOpen()) {
      console.log(`\n🔒 Borsa kapalı — açılış ${nextOpenTime()}`);
      console.log("   💤 5 dk sonra tekrar kontrol...");
      await delay(5 * 60 * 1000); // 5 dk bekle
      continue;
    }

    try {
      await runCycle();
    } catch (err) {
      console.error(`❌ Döngü hatası: ${err}`);
      await delay(60_000);
    }

    console.log(`\n⏳ Sonraki döngü: 15 dk sonra...`);
    await delay(CYCLE_INTERVAL_MS);
  }
}

main().catch((err) => {
  console.error("❌ Daemon kritik hata:", err);
  process.exit(1);
});
