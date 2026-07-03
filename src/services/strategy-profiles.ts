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
  TREND: {
    mode: "TREND",
    name: "Trend Takipçisi",
    icon: "🐢",
    description: "Günlük mumlarla swing trading. Dar SL, geniş TP — sabırlı ama kârlı.",
    interval: "1d",
    scanIntervalMs: 60 * 60 * 1000, // 1 saat (günlük mumu her saat kontrol)
    indicatorPeriod: 20,
    stopLossRatio: 0.005,     // %0.5 — eskiden %2.0
    takeProfitRatio: 0.10,    // %10  — eskiden %6.0
    volumeMultiplier: 1.5,    // ×1.5 — eskiden ×2.0
    lookbackCandles: 40,
  },
  AVCI: {
    mode: "AVCI",
    name: "Avcı",
    icon: "🦅",
    description: "Saatlik mumlarla agresif trading. Dengeli SL/TP, yüksek profit factor.",
    interval: "1h",
    scanIntervalMs: 60 * 60 * 1000, // 1 saat
    indicatorPeriod: 20,
    stopLossRatio: 0.008,     // %0.8 — aynı
    takeProfitRatio: 0.08,    // %8.0 — eskiden %2.5
    volumeMultiplier: 1.5,    // ×1.5 — aynı
    lookbackCandles: 60,
  },
  SCALPER: {
    mode: "SCALPER",
    name: "Keskin Nişancı",
    icon: "⚡",
    description: "15 dakikalık mumlarla scalping. Dar SL, geniş TP — patlamaları yakalar.",
    interval: "15m",
    scanIntervalMs: 15 * 60 * 1000, // 15 dakika
    indicatorPeriod: 20,
    stopLossRatio: 0.005,     // %0.5 — eskiden %0.4
    takeProfitRatio: 0.10,    // %10  — eskiden %1.2
    volumeMultiplier: 1.5,    // ×1.5 — eskiden ×1.2
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
