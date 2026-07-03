// ============================================================
// Backtest Motoru
// Kronolojik mum verileri üzerinde strateji simülasyonu yapar.
//
// STRATEJİ:
//   AL     : Pozisyon yok VE Close > EMA(20) VE Volume > 2×SMA_Vol(20)
//   STOP   : Pozisyon var VE Low ≤ giriş × (1 - stopLoss)
//   TAKE   : Pozisyon var VE High ≥ giriş × (1 + takeProfit)
//   ZORUNLU: Veri sonu → son close'tan kapat
//
// ÇIKTI: BacktestResult (toplam işlem, win rate, PnL, max drawdown)
// ============================================================

import { calculateEMA, calculateSMA } from "./indicators";

// Inline tip tanımları (parent projenin database.ts'inden bağımsız)
export interface BacktestOptions {
  initialCapital?: number;
  stopLossRatio?: number;
  takeProfitRatio?: number;
  indicatorPeriod?: number;
  volumeMultiplier?: number;
}

export type TradeExitReason = "STOP_LOSS" | "TAKE_PROFIT" | "END_OF_DATA";

export interface TradeRecord {
  tradeNo: number;
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPercent: number;
  exitReason: TradeExitReason;
}

export interface BacktestResult {
  ticker: string;
  totalCandles: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  initialCapital: number;
  finalCapital: number;
  netPnl: number;
  netPnlPercent: number;
  maxDrawdownPercent: number;
  trades: TradeRecord[];
}

export interface StockCandle {
  id: string;
  asset_id: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  created_at: string;
}

// ------------------------------------------------------------
// Varsayılan Değerler
// ------------------------------------------------------------

const DEFAULT_OPTIONS: Required<BacktestOptions> = {
  initialCapital: 100_000,
  stopLossRatio: 0.02,
  takeProfitRatio: 0.06,
  indicatorPeriod: 20,
  volumeMultiplier: 2,
};

// ------------------------------------------------------------
// Dahili Yardımcı Tipler
// ------------------------------------------------------------

/** Aktif pozisyon bilgisi */
interface OpenPosition {
  entryDate: string;
  entryPrice: number;
  quantity: number;
  stopLossPrice: number;
  takeProfitPrice: number;
}

// ------------------------------------------------------------
// Backtest Motoru
// ------------------------------------------------------------

/**
 * Verilen mum verileri üzerinde backtest simülasyonu çalıştırır.
 *
 * İşlem akışı:
 * 1. Kapanış fiyatlarından EMA(period), hacimlerden SMA(period) hesapla
 * 2. Her mum için strateji kurallarını uygula (AL / STOP / TAKE)
 * 3. Veri sonunda açık pozisyon varsa zorunlu kapat
 * 4. Performans metriklerini hesapla ve döndür
 *
 * @param ticker - Hisse kodu (rapor için)
 * @param candles - Kronolojik sıralı mum verileri (eskiden yeniye)
 * @param options - Backtest yapılandırma seçenekleri
 * @returns Backtest sonuç raporu
 *
 * @example
 * ```ts
 * const result = runBacktest("THYAO.IS", candles, {
 *   initialCapital: 100_000,
 *   stopLossRatio: 0.02,
 *   takeProfitRatio: 0.06,
 * });
 * console.log(`Win Rate: ${result.winRate}%`);
 * ```
 */
export function runBacktest(
  ticker: string,
  candles: StockCandle[],
  options?: BacktestOptions
): BacktestResult {
  // Opsiyonları varsayılanlarla birleştir
  const opts: Required<BacktestOptions> = { ...DEFAULT_OPTIONS, ...options };

  // Yeterli veri kontrolü
  if (candles.length < opts.indicatorPeriod) {
    return createEmptyResult(ticker, candles.length, opts.initialCapital);
  }

  // --------------------------------------------------------
  // 1. İndikatörleri hesapla
  // --------------------------------------------------------
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  // EMA ve SMA dizileri: uzunluk = candles.length - period + 1
  // Bu dizilerin [i] indeksi, candles'ın [i + period - 1] indeksine karşılık gelir
  const priceEMA = calculateEMA(closes, opts.indicatorPeriod);
  const volumeSMA = calculateSMA(volumes, opts.indicatorPeriod);

  // İndikatörlerin başladığı candle indeksi
  const indicatorStartIndex = opts.indicatorPeriod - 1;

  // --------------------------------------------------------
  // 2. Simülasyon
  // --------------------------------------------------------
  let capital = opts.initialCapital;
  let peakCapital = capital; // Max drawdown hesabı için
  let maxDrawdownPercent = 0;
  let position: OpenPosition | null = null;
  const trades: TradeRecord[] = [];
  let tradeCounter = 0;

  /**
   * Pozisyonu kapatır ve işlem kaydı oluşturur.
   */
  function closePosition(
    exitDate: string,
    exitPrice: number,
    reason: TradeExitReason
  ): void {
    if (!position) return;

    tradeCounter++;
    const pnl = (exitPrice - position.entryPrice) * position.quantity;
    const pnlPercent =
      ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

    capital += position.quantity * exitPrice;

    trades.push({
      tradeNo: tradeCounter,
      entryDate: position.entryDate,
      entryPrice: position.entryPrice,
      exitDate,
      exitPrice,
      quantity: position.quantity,
      pnl,
      pnlPercent,
      exitReason: reason,
    });

    // Max drawdown güncelle
    if (capital > peakCapital) {
      peakCapital = capital;
    }
    const currentDrawdown = ((peakCapital - capital) / peakCapital) * 100;
    if (currentDrawdown > maxDrawdownPercent) {
      maxDrawdownPercent = currentDrawdown;
    }

    position = null;
  }

  // Her mum için strateji kurallarını uygula
  for (let i = indicatorStartIndex; i < candles.length; i++) {
    const candle = candles[i]!;
    const indicatorIdx = i - indicatorStartIndex;
    const currentEMA = priceEMA[indicatorIdx]!;
    const currentVolSMA = volumeSMA[indicatorIdx]!;

    // -- ÇIKIŞ KONTROLLERI (pozisyondaysak) --
    if (position) {
      const stopPrice = position.entryPrice * (1 - opts.stopLossRatio);
      const takePrice = position.entryPrice * (1 + opts.takeProfitRatio);

      // Stop Loss: mumun Low'u stop fiyatına dokundu mu?
      if (candle.low <= stopPrice) {
        closePosition(candle.timestamp, stopPrice, "STOP_LOSS");
        continue; // Bu mumda başka işlem yapma
      }

      // Take Profit: mumun High'ı take-profit fiyatına dokundu mu?
      if (candle.high >= takePrice) {
        closePosition(candle.timestamp, takePrice, "TAKE_PROFIT");
        continue; // Bu mumda başka işlem yapma
      }

      // Drawdown takibi (pozisyondayken mark-to-market)
      const markToMarket =
        capital + position.quantity * candle.close;
      if (markToMarket > peakCapital) {
        peakCapital = markToMarket;
      }
      const unrealizedDrawdown =
        ((peakCapital - markToMarket) / peakCapital) * 100;
      if (unrealizedDrawdown > maxDrawdownPercent) {
        maxDrawdownPercent = unrealizedDrawdown;
      }

      continue; // Pozisyondayken yeni alım yapma
    }

    // -- GİRİŞ KONTROLÜ (pozisyon yoksa) --
    const isBullish = candle.close > currentEMA;
    const isHighVolume = candle.volume > opts.volumeMultiplier * currentVolSMA;

    if (isBullish && isHighVolume) {
      // Tüm kasayla AL
      const quantity = Math.floor(capital / candle.close);
      if (quantity <= 0) continue; // Yeterli kasa yok

      const cost = quantity * candle.close;
      capital -= cost;

      position = {
        entryDate: candle.timestamp,
        entryPrice: candle.close,
        quantity,
        stopLossPrice: candle.close * (1 - opts.stopLossRatio),
        takeProfitPrice: candle.close * (1 + opts.takeProfitRatio),
      };
    }
  }

  // --------------------------------------------------------
  // 3. Veri sonu: açık pozisyon varsa zorunlu kapat
  // --------------------------------------------------------
  if (position) {
    const lastCandle = candles[candles.length - 1]!;
    closePosition(lastCandle.timestamp, lastCandle.close, "END_OF_DATA");
  }

  // --------------------------------------------------------
  // 4. Sonuç raporu oluştur
  // --------------------------------------------------------
  const winningTrades = trades.filter((t) => t.pnl > 0).length;
  const losingTrades = trades.filter((t) => t.pnl <= 0).length;
  const winRate =
    trades.length > 0
      ? parseFloat(((winningTrades / trades.length) * 100).toFixed(2))
      : 0;

  const finalCapital = capital;
  const netPnl = finalCapital - opts.initialCapital;
  const netPnlPercent = parseFloat(
    ((netPnl / opts.initialCapital) * 100).toFixed(2)
  );

  return {
    ticker,
    totalCandles: candles.length,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRate,
    initialCapital: opts.initialCapital,
    finalCapital: parseFloat(finalCapital.toFixed(2)),
    netPnl: parseFloat(netPnl.toFixed(2)),
    netPnlPercent,
    maxDrawdownPercent: parseFloat(maxDrawdownPercent.toFixed(2)),
    trades,
  };
}

// ------------------------------------------------------------
// Yardımcı Fonksiyonlar
// ------------------------------------------------------------

/** Yetersiz veri durumunda boş sonuç oluşturur */
function createEmptyResult(
  ticker: string,
  totalCandles: number,
  initialCapital: number
): BacktestResult {
  return {
    ticker,
    totalCandles,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    initialCapital,
    finalCapital: initialCapital,
    netPnl: 0,
    netPnlPercent: 0,
    maxDrawdownPercent: 0,
    trades: [],
  };
}
