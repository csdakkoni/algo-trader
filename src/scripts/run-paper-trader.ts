// ============================================================
// Paper Trader Runner Script
//
// Bu script çalıştırıldığında:
// 1. 100.000 TL bakiye ile "Ana Sanal Hesap" init eder
// 2. Açık pozisyonları kontrol eder (SL/TP)
// 3. Sinyal taraması yapar ve uygunsa pozisyon açar
// 4. Konsola işlem özeti yazdırır
//
// Kullanım:
//   npm run paper:trade
// ============================================================

import {
  initAccount,
  checkOpenPositions,
  scanSignalsAndExecute,
  getOpenPositionCount,
} from "../services/paper-trade.service.js";
import { supabase } from "../config/supabase.js";

// ------------------------------------------------------------
// Yapılandırma
// ------------------------------------------------------------

const ACCOUNT_NAME = "Ana Sanal Hesap";
const INITIAL_BALANCE = 100_000;

// ------------------------------------------------------------
// Yardımcı: Konsol Formatlama
// ------------------------------------------------------------

function formatCurrency(value: number): string {
  return value.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ------------------------------------------------------------
// Ana Fonksiyon
// ------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = new Date();

  console.log("━".repeat(60));
  console.log("🏦 PAPER TRADING ENGINE — Sanal Canlı İşlem Motoru");
  console.log("━".repeat(60));
  console.log(`📅 ${startTime.toLocaleString("tr-TR")}`);
  console.log("");

  // --------------------------------------------------------
  // Adım 1: Hesap Init
  // --------------------------------------------------------
  console.log("📌 Adım 1: Hesap kontrol ediliyor...");
  const account = await initAccount(ACCOUNT_NAME, INITIAL_BALANCE);

  // --------------------------------------------------------
  // Adım 2: Açık Pozisyonları Kontrol Et
  // --------------------------------------------------------
  console.log("\n📌 Adım 2: Açık pozisyonlar kontrol ediliyor...");
  const closedPositions = await checkOpenPositions(account.id);

  // --------------------------------------------------------
  // Adım 3: Sinyal Tara ve İşlem Aç
  // --------------------------------------------------------
  console.log("\n📌 Adım 3: Sinyal taraması yapılıyor...");
  const openedPosition = await scanSignalsAndExecute(account.id);

  // --------------------------------------------------------
  // Adım 4: Güncel Durum Raporu
  // --------------------------------------------------------

  // Güncel hesap bakiyesini çek
  const { data: updatedAccount } = await supabase
    .from("paper_accounts")
    .select("balance")
    .eq("id", account.id)
    .single();

  const currentBalance = updatedAccount?.balance ?? account.balance;
  const activeCount = await getOpenPositionCount(account.id);

  // Açık pozisyon detayları
  const { data: openPositions } = await supabase
    .from("paper_positions")
    .select("*, assets:asset_id(ticker)")
    .eq("account_id", account.id)
    .eq("status", "OPEN");

  console.log("\n" + "━".repeat(60));
  console.log("📋 İŞLEM ÖZETİ");
  console.log("━".repeat(60));

  // Kasa durumu
  let totalInvested = 0;
  if (openPositions) {
    for (const p of openPositions) {
      totalInvested += p.entry_price * p.quantity;
    }
  }
  const totalEquity = currentBalance + totalInvested;
  const totalPnl = totalEquity - INITIAL_BALANCE;
  const totalPnlPercent = ((totalPnl / INITIAL_BALANCE) * 100).toFixed(2);

  console.log("\n### 🏦 Kasa Durumu\n");
  console.log("| Metrik | Değer |");
  console.log("|--------|-------|");
  console.log(`| Nakit Bakiye | ₺${formatCurrency(currentBalance)} |`);
  console.log(`| Pozisyondaki Tutar | ₺${formatCurrency(totalInvested)} |`);
  console.log(`| Toplam Özkaynak | ₺${formatCurrency(totalEquity)} |`);
  console.log(
    `| Genel K/Z | ${totalPnl >= 0 ? "🟢" : "🔴"} ₺${formatCurrency(totalPnl)} (${totalPnlPercent}%) |`
  );

  // Kapatılan pozisyonlar
  if (closedPositions.length > 0) {
    console.log("\n### 🔒 Bu Çalışmada Kapatılan Pozisyonlar\n");
    console.log("| Hisse | Çıkış ₺ | K/Z ₺ | Neden |");
    console.log("|-------|---------|-------|-------|");
    for (const cp of closedPositions) {
      const emoji = cp.profitLoss >= 0 ? "🟢" : "🔴";
      const reason = cp.reason === "STOP_LOSS" ? "⛔ Stop Loss" : "🎯 Take Profit";
      console.log(
        `| ${cp.ticker} | ₺${formatCurrency(cp.exitPrice)} | ${emoji} ₺${formatCurrency(cp.profitLoss)} | ${reason} |`
      );
    }
  } else {
    console.log("\n— Bu çalışmada kapatılan pozisyon yok.");
  }

  // Yeni açılan pozisyon
  if (openedPosition) {
    console.log("\n### 🆕 Yeni Açılan Pozisyon\n");
    console.log("| Metrik | Değer |");
    console.log("|--------|-------|");
    console.log(`| Hisse | ${openedPosition.ticker} |`);
    console.log(`| Giriş Fiyatı | ₺${formatCurrency(openedPosition.entryPrice)} |`);
    console.log(`| Adet | ${openedPosition.quantity} |`);
    console.log(`| Stop Loss | ₺${formatCurrency(openedPosition.stopLoss)} |`);
    console.log(`| Take Profit | ₺${formatCurrency(openedPosition.takeProfit)} |`);
  } else {
    console.log("\n— Bu çalışmada yeni pozisyon açılmadı.");
  }

  // Aktif pozisyonlar
  if (openPositions && openPositions.length > 0) {
    console.log(`\n### 📊 Aktif Pozisyonlar (${activeCount})\n`);
    console.log("| Hisse | Giriş ₺ | Adet | SL ₺ | TP ₺ | Açılış Tarihi |");
    console.log("|-------|---------|------|------|------|--------------|");
    for (const p of openPositions) {
      const assetInfo = p.assets as unknown as { ticker: string } | null;
      const ticker = assetInfo?.ticker ?? "?";
      const date = new Date(p.created_at).toLocaleDateString("tr-TR");
      console.log(
        `| ${ticker} | ₺${formatCurrency(p.entry_price)} | ${p.quantity} | ₺${formatCurrency(p.stop_loss_price)} | ₺${formatCurrency(p.take_profit_price)} | ${date} |`
      );
    }
  } else {
    console.log(`\n— Aktif pozisyon yok.`);
  }

  const durationMs = Date.now() - startTime.getTime();
  console.log("\n" + "━".repeat(60));
  console.log(`⏱️  Süre: ${(durationMs / 1000).toFixed(1)}s`);
  console.log("━".repeat(60) + "\n");
}

// Script'i çalıştır
main().catch((error) => {
  console.error("❌ Kritik hata:", error);
  process.exit(1);
});
