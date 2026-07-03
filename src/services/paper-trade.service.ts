// ============================================================
// Paper Trade Servisi
// Sanal canlı işlem motoru — Gerçek piyasa verileriyle
// sanal para üzerinden alım/satım simülasyonu yapar.
//
// Ana fonksiyonlar:
//   initAccount()           — Sanal hesap oluştur
//   checkOpenPositions()    — Açık pozisyonları SL/TP kontrol et
//   scanSignalsAndExecute() — Sinyal tara ve pozisyon aç
// ============================================================

import { supabase } from "../config/supabase.js";
import { fetchCandles } from "./yahoo-finance.service.js";
import { calculateEMA, calculateSMA } from "./indicators.service.js";
import type {
  PaperAccount,
  PaperPosition,
  PositionCloseResult,
  PaperTradingRunSummary,
  Asset,
} from "../types/database.js";

// ------------------------------------------------------------
// Sabitler
// ------------------------------------------------------------

const STOP_LOSS_RATIO = 0.02;
const TAKE_PROFIT_RATIO = 0.06;
const INDICATOR_PERIOD = 20;
const VOLUME_MULTIPLIER = 2;
const CANDLE_LOOKBACK_DAYS = 40; // 20 periyot + yeterli geçmiş veri

// ------------------------------------------------------------
// 1. HESAP YÖNETİMİ
// ------------------------------------------------------------

/**
 * Sanal paper trading hesabı oluşturur veya mevcut olanı döndürür.
 *
 * @param name - Hesap adı (unique)
 * @param initialBalance - Başlangıç bakiyesi (TL)
 * @returns Hesap kaydı
 */
export async function initAccount(
  name: string,
  initialBalance: number = 100_000
): Promise<PaperAccount> {
  // Mevcut hesabı kontrol et
  const { data: existing } = await supabase
    .from("paper_accounts")
    .select("*")
    .eq("name", name)
    .single();

  if (existing) {
    console.log(
      `[Paper] Mevcut hesap bulundu: "${existing.name}" — ` +
        `Bakiye: ₺${existing.balance.toLocaleString("tr-TR")}`
    );
    return existing;
  }

  // Yeni hesap oluştur
  const { data, error } = await supabase
    .from("paper_accounts")
    .insert({ name, balance: initialBalance })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`[Paper] Hesap oluşturulamadı: ${error?.message}`);
  }

  console.log(
    `[Paper] Yeni hesap oluşturuldu: "${data.name}" — ` +
      `Bakiye: ₺${data.balance.toLocaleString("tr-TR")}`
  );
  return data;
}

// ------------------------------------------------------------
// 2. AÇIK POZİSYON KONTROLÜ
// ------------------------------------------------------------

/**
 * Tüm açık pozisyonları kontrol eder:
 * - Güncel fiyatı Yahoo Finance'ten alır
 * - Stop-loss veya take-profit tetiklendiyse pozisyonu kapatır
 * - Kasayı günceller
 *
 * @param accountId - Paper trading hesap ID'si
 * @returns Kapatılan pozisyonların listesi
 */
export async function checkOpenPositions(
  accountId: string
): Promise<PositionCloseResult[]> {
  console.log("\n[Paper] 📡 Açık pozisyonlar kontrol ediliyor...");

  // Açık pozisyonları çek (asset bilgisiyle birlikte)
  const { data: positions, error } = await supabase
    .from("paper_positions")
    .select("*, assets:asset_id(ticker, name)")
    .eq("account_id", accountId)
    .eq("status", "OPEN");

  if (error) {
    throw new Error(`[Paper] Pozisyonlar alınamadı: ${error.message}`);
  }

  if (!positions || positions.length === 0) {
    console.log("[Paper] Açık pozisyon yok.");
    return [];
  }

  console.log(`[Paper] ${positions.length} açık pozisyon bulundu.`);

  const closedPositions: PositionCloseResult[] = [];

  for (const pos of positions) {
    // Asset bilgisini çıkar (join'den gelen)
    const assetInfo = pos.assets as unknown as { ticker: string; name: string } | null;
    const ticker = assetInfo?.ticker ?? "UNKNOWN";

    try {
      // Güncel fiyatı al (son 2 günlük veri çek, en son mumu kullan)
      const currentPrice = await getLatestPrice(ticker);

      console.log(
        `[Paper] ${ticker}: Güncel ₺${currentPrice.toFixed(2)} | ` +
          `Giriş ₺${pos.entry_price.toFixed(2)} | ` +
          `SL ₺${pos.stop_loss_price.toFixed(2)} | TP ₺${pos.take_profit_price.toFixed(2)}`
      );

      // Stop Loss kontrolü
      if (currentPrice <= pos.stop_loss_price) {
        const result = await closePosition(
          pos,
          ticker,
          pos.stop_loss_price,
          "STOP_LOSS",
          accountId
        );
        closedPositions.push(result);
        continue;
      }

      // Take Profit kontrolü
      if (currentPrice >= pos.take_profit_price) {
        const result = await closePosition(
          pos,
          ticker,
          pos.take_profit_price,
          "TAKE_PROFIT",
          accountId
        );
        closedPositions.push(result);
        continue;
      }

      console.log(`[Paper] ${ticker}: Pozisyon açık kalıyor.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Paper] ❌ ${ticker} fiyat kontrolü başarısız: ${msg}`);
    }
  }

  return closedPositions;
}

/**
 * Bir pozisyonu kapatır, kasa bakiyesini günceller.
 */
async function closePosition(
  position: PaperPosition,
  ticker: string,
  exitPrice: number,
  reason: "STOP_LOSS" | "TAKE_PROFIT",
  accountId: string
): Promise<PositionCloseResult> {
  const profitLoss =
    (exitPrice - position.entry_price) * position.quantity;
  const pnlPercent =
    ((exitPrice - position.entry_price) / position.entry_price) * 100;

  const reasonEmoji = reason === "STOP_LOSS" ? "⛔" : "🎯";
  const pnlEmoji = profitLoss >= 0 ? "🟢" : "🔴";

  console.log(
    `[Paper] ${reasonEmoji} ${ticker}: Pozisyon kapatılıyor — ` +
      `Çıkış ₺${exitPrice.toFixed(2)} | ` +
      `${pnlEmoji} K/Z: ₺${profitLoss.toFixed(2)} (${pnlPercent.toFixed(2)}%)`
  );

  // 1. Pozisyonu güncelle
  const { error: posError } = await supabase
    .from("paper_positions")
    .update({
      status: "CLOSED",
      exit_price: exitPrice,
      exit_timestamp: new Date().toISOString(),
      profit_loss: parseFloat(profitLoss.toFixed(2)),
    })
    .eq("id", position.id);

  if (posError) {
    throw new Error(`[Paper] Pozisyon güncellenemedi: ${posError.message}`);
  }

  // 2. Kasayı güncelle (geri dönen tutar = quantity * exitPrice)
  const returnAmount = position.quantity * exitPrice;
  const { data: account } = await supabase
    .from("paper_accounts")
    .select("balance")
    .eq("id", accountId)
    .single();

  if (account) {
    const newBalance = account.balance + returnAmount;
    await supabase
      .from("paper_accounts")
      .update({ balance: parseFloat(newBalance.toFixed(2)) })
      .eq("id", accountId);
  }

  return {
    positionId: position.id,
    ticker,
    exitPrice,
    profitLoss: parseFloat(profitLoss.toFixed(2)),
    reason,
  };
}

// ------------------------------------------------------------
// 3. SİNYAL TARAMA VE İŞLEM AÇMA
// ------------------------------------------------------------

/**
 * Aktif hisseleri tarar, EMA/SMA sinyali tetiklenirse pozisyon açar.
 *
 * Kurallar:
 * - Hesapta açık pozisyon yoksa sinyal taraması yapar
 * - Kapanış > EMA(20) VE Hacim > 2 × SMA_Vol(20) → AL sinyali
 * - Tüm bakiyeyle pozisyon açar, SL %2, TP %6
 *
 * @param accountId - Paper trading hesap ID'si
 * @returns Açılan pozisyon bilgisi veya null
 */
export async function scanSignalsAndExecute(
  accountId: string
): Promise<PaperTradingRunSummary["openedPosition"]> {
  console.log("\n[Paper] 🔍 Sinyal taraması başlatılıyor...");

  // Açık pozisyon var mı kontrol et
  const { count } = await supabase
    .from("paper_positions")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "OPEN");

  if (count && count > 0) {
    console.log(
      `[Paper] Aktif ${count} pozisyon var — yeni sinyal aranmıyor.`
    );
    return null;
  }

  // Aktif hisseleri çek
  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select("*")
    .eq("is_active", true)
    .order("ticker");

  if (assetsError || !assets || assets.length === 0) {
    console.log("[Paper] Aktif hisse bulunamadı.");
    return null;
  }

  // Hesap bakiyesini al
  const { data: account } = await supabase
    .from("paper_accounts")
    .select("balance")
    .eq("id", accountId)
    .single();

  if (!account || account.balance <= 0) {
    console.log("[Paper] Yetersiz bakiye.");
    return null;
  }

  console.log(
    `[Paper] ${assets.length} hisse taranıyor... ` +
      `(Bakiye: ₺${account.balance.toLocaleString("tr-TR")})`
  );

  // Her hisse için sinyal kontrolü
  for (const asset of assets) {
    try {
      const signal = await checkSignal(asset);

      if (!signal) {
        continue;
      }

      // 🚀 SİNYAL TETİKLENDİ — Pozisyon aç
      console.log(
        `\n[Paper] 🚀 AL SİNYALİ: ${asset.ticker} @ ₺${signal.currentPrice.toFixed(2)}`
      );

      const result = await openPosition(
        accountId,
        asset.id,
        asset.ticker,
        signal.currentPrice,
        account.balance
      );

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Paper] ❌ ${asset.ticker} sinyal hatası: ${msg}`);
    }

    // Rate limiting
    await delay(1000);
  }

  console.log("[Paper] Hiçbir hissede AL sinyali bulunamadı.");
  return null;
}

/**
 * Bir hisse için AL sinyali olup olmadığını kontrol eder.
 * Son 40 günlük veriyi çeker, EMA(20) ve SMA_Vol(20) hesaplar.
 */
async function checkSignal(
  asset: Asset
): Promise<{
  currentPrice: number;
  ema20: number;
  volume: number;
  volumeSma20: number;
} | null> {
  // Son N günlük veriyi Yahoo Finance'ten çek
  const period1 = new Date();
  period1.setDate(period1.getDate() - CANDLE_LOOKBACK_DAYS);

  const candles = await fetchCandles(asset.ticker, {
    period1: period1.toISOString(),
    interval: "1d",
  });

  if (candles.length < INDICATOR_PERIOD) {
    console.log(
      `[Paper] ${asset.ticker}: Yetersiz veri (${candles.length} < ${INDICATOR_PERIOD})`
    );
    return null;
  }

  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  // İndikatörleri hesapla
  const emaValues = calculateEMA(closes, INDICATOR_PERIOD);
  const smaVolValues = calculateSMA(volumes, INDICATOR_PERIOD);

  if (emaValues.length === 0 || smaVolValues.length === 0) {
    return null;
  }

  // Son değerleri al
  const lastClose = closes[closes.length - 1]!;
  const lastVolume = volumes[volumes.length - 1]!;
  const lastEMA = emaValues[emaValues.length - 1]!;
  const lastVolSMA = smaVolValues[smaVolValues.length - 1]!;

  // Sinyal kontrolü
  const isBullish = lastClose > lastEMA;
  const isHighVolume = lastVolume > VOLUME_MULTIPLIER * lastVolSMA;

  const signalStr = isBullish && isHighVolume ? "✅ AL" : "—";
  console.log(
    `[Paper] ${asset.ticker}: ` +
      `Close ₺${lastClose.toFixed(2)} ${isBullish ? ">" : "≤"} EMA ₺${lastEMA.toFixed(2)} | ` +
      `Vol ${(lastVolume / 1e6).toFixed(1)}M ${isHighVolume ? ">" : "≤"} ${VOLUME_MULTIPLIER}×SMA ${(lastVolSMA / 1e6).toFixed(1)}M | ` +
      `Sinyal: ${signalStr}`
  );

  if (isBullish && isHighVolume) {
    return {
      currentPrice: lastClose,
      ema20: lastEMA,
      volume: lastVolume,
      volumeSma20: lastVolSMA,
    };
  }

  return null;
}

/**
 * Yeni bir BUY pozisyonu açar ve kasayı günceller.
 */
async function openPosition(
  accountId: string,
  assetId: string,
  ticker: string,
  entryPrice: number,
  availableBalance: number
): Promise<PaperTradingRunSummary["openedPosition"]> {
  const quantity = Math.floor(availableBalance / entryPrice);
  if (quantity <= 0) {
    console.log("[Paper] Yetersiz bakiye, pozisyon açılamıyor.");
    return null;
  }

  const cost = quantity * entryPrice;
  const stopLossPrice = parseFloat(
    (entryPrice * (1 - STOP_LOSS_RATIO)).toFixed(6)
  );
  const takeProfitPrice = parseFloat(
    (entryPrice * (1 + TAKE_PROFIT_RATIO)).toFixed(6)
  );

  // 1. Pozisyonu oluştur
  const { error: posError } = await supabase
    .from("paper_positions")
    .insert({
      account_id: accountId,
      asset_id: assetId,
      type: "BUY",
      entry_price: entryPrice,
      stop_loss_price: stopLossPrice,
      take_profit_price: takeProfitPrice,
      quantity,
      status: "OPEN",
    });

  if (posError) {
    throw new Error(`[Paper] Pozisyon açılamadı: ${posError.message}`);
  }

  // 2. Kasayı güncelle
  const newBalance = parseFloat((availableBalance - cost).toFixed(2));
  await supabase
    .from("paper_accounts")
    .update({ balance: newBalance })
    .eq("id", accountId);

  console.log(
    `[Paper] ✅ Pozisyon açıldı: ${ticker}\n` +
      `   Giriş : ₺${entryPrice.toFixed(2)}\n` +
      `   Adet  : ${quantity}\n` +
      `   Maliyet: ₺${cost.toLocaleString("tr-TR")}\n` +
      `   SL    : ₺${stopLossPrice.toFixed(2)} (-${(STOP_LOSS_RATIO * 100).toFixed(0)}%)\n` +
      `   TP    : ₺${takeProfitPrice.toFixed(2)} (+${(TAKE_PROFIT_RATIO * 100).toFixed(0)}%)\n` +
      `   Kalan : ₺${newBalance.toLocaleString("tr-TR")}`
  );

  return {
    ticker,
    entryPrice,
    quantity,
    stopLoss: stopLossPrice,
    takeProfit: takeProfitPrice,
  };
}

// ------------------------------------------------------------
// Yardımcı Fonksiyonlar
// ------------------------------------------------------------

/**
 * Yahoo Finance'ten en güncel fiyatı çeker.
 * Son 5 günlük veri alıp en son mum kapanışını kullanır.
 */
async function getLatestPrice(ticker: string): Promise<number> {
  const period1 = new Date();
  period1.setDate(period1.getDate() - 5);

  const candles = await fetchCandles(ticker, {
    period1: period1.toISOString(),
    interval: "1d",
  });

  if (candles.length === 0) {
    throw new Error(`${ticker} için güncel fiyat alınamadı`);
  }

  return candles[candles.length - 1]!.close;
}

/** Belirtilen milisaniye kadar bekler */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hesaptaki aktif pozisyon sayısını döndürür.
 */
export async function getOpenPositionCount(
  accountId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("paper_positions")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "OPEN");

  if (error) {
    throw new Error(`[Paper] Pozisyon sayısı alınamadı: ${error.message}`);
  }

  return count ?? 0;
}
