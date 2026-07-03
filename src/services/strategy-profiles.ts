// ============================================================
// Strateji Profilleri (Çoklu Mod Yapısı)
//
// 3 farklı trading karakteri:
//   🐢 TREND  — Trend Takipçisi (Swing): Günlük, geniş SL/TP
//   🦅 AVCI   — Avcı (Agresif): Saatlik, orta SL/TP
//   ⚡ SCALPER — Keskin Nişancı (Scalper): 15dk, dar SL/TP
// ============================================================

import type { CandleInterval } from "../types/database.js";

// ------------------------------------------------------------
// Tip Tanımları
// ------------------------------------------------------------

/** Strateji modu tanımlayıcısı */
export type StrategyMode = "TREND" | "AVCI" | "SCALPER";

/** Strateji profili yapılandırması */
export interface StrategyProfile {
  /** Mod tanımlayıcı */
  mode: StrategyMode;
  /** Görünen ad */
  name: string;
  /** Emoji ikonu */
  icon: string;
  /** Açıklama */
  description: string;
  /** Mum zaman dilimi */
  interval: CandleInterval;
  /** Tarama sıklığı (milisaniye) */
  scanIntervalMs: number;
  /** EMA/SMA periyodu */
  indicatorPeriod: number;
  /** Stop-loss oranı (0-1) */
  stopLossRatio: number;
  /** Take-profit oranı (0-1) */
  takeProfitRatio: number;
  /** Hacim çarpanı (Hacim > multiplier × SMA_Vol ise sinyal) */
  volumeMultiplier: number;
  /** Sinyal taraması için geriye bakılacak mum sayısı */
  lookbackCandles: number;
}

// ------------------------------------------------------------
// Profil Tanımları
// ------------------------------------------------------------

const PROFILES: Record<StrategyMode, StrategyProfile> = {
  // ── Sabırlı, büyük balık avlar ──────────────────────
  // Haftada 1-2 işlem, günlerce tutar
  // Geniş SL ile gürültüyü filtreler, büyük TP ile trendi bitirir
  TREND: {
    mode: "TREND",
    name: "Trend Takipçisi",
    icon: "🐢",
    description: "Günlük mumlarla swing trading. Sabırlı, güçlü trendleri yakalar.",
    interval: "1d",
    scanIntervalMs: 60 * 60 * 1000, // 1 saat
    indicatorPeriod: 20,
    stopLossRatio: 0.02,       // %2.0 — geniş, günlük gürültüye dayanır
    takeProfitRatio: 0.06,     // %6.0 — büyük hareket bekler
    volumeMultiplier: 1.5,     // ×1.5 — güçlü hacim ister
    lookbackCandles: 40,
  },
  // ── Aktif, orta dalgaları yakalar ───────────────────
  // Günde 2-3 işlem, saatlerce tutar
  // Orta SL/TP, daha sık sinyal, dengeli risk
  AVCI: {
    mode: "AVCI",
    name: "Avcı",
    icon: "🦅",
    description: "Saatlik mumlarla aktif trading. Hızlı giriş-çıkış, sık işlem.",
    interval: "1h",
    scanIntervalMs: 60 * 60 * 1000, // 1 saat
    indicatorPeriod: 20,
    stopLossRatio: 0.008,      // %0.8 — dar, hızlı kes
    takeProfitRatio: 0.025,    // %2.5 — orta hedef
    volumeMultiplier: 1.2,     // ×1.2 — daha kolay tetiklenir
    lookbackCandles: 60,
  },
  // ── Makineli tüfek, çok sayıda küçük işlem ─────────
  // Günde 5-8 işlem, 15 dakikada kapatır
  // Çok dar SL/TP, düşük hacim eşiği, maksimum aktivite
  SCALPER: {
    mode: "SCALPER",
    name: "Keskin Nişancı",
    icon: "⚡",
    description: "15dk mumlarla scalping. Çok sık işlem, küçük ama tutarlı kârlar.",
    interval: "15m",
    scanIntervalMs: 15 * 60 * 1000, // 15 dakika
    indicatorPeriod: 20,
    stopLossRatio: 0.004,      // %0.4 — çok dar
    takeProfitRatio: 0.012,    // %1.2 — küçük hedef, hızlı kapat
    volumeMultiplier: 1.0,     // ×1.0 — her hacimde tetiklenir
    lookbackCandles: 80,
  },
};

// ------------------------------------------------------------
// Erişim Fonksiyonları
// ------------------------------------------------------------

/** Belirtilen modun strateji profilini döndürür */
export function getProfile(mode: StrategyMode): StrategyProfile {
  return PROFILES[mode];
}

/** Tüm strateji profillerini döndürür */
export function getAllProfiles(): StrategyProfile[] {
  return Object.values(PROFILES);
}

/** Verilen string'in geçerli bir StrategyMode olup olmadığını kontrol eder */
export function isValidMode(value: string): value is StrategyMode {
  return value === "TREND" || value === "AVCI" || value === "SCALPER";
}
