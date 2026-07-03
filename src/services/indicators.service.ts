// ============================================================
// İndikatör Servisi
// Saf TypeScript ile teknik analiz indikatörleri.
// Dışarıdan hiçbir finans kütüphanesi kullanılmaz.
// ============================================================

/**
 * Basit Hareketli Ortalama (Simple Moving Average)
 *
 * Her bir noktada, kendisi dahil önceki `period` adet verinin
 * aritmetik ortalamasını hesaplar.
 *
 * İlk (period - 1) eleman için yeterli veri olmadığından
 * sonuç dizisi girdiden `period - 1` eleman daha kısadır.
 *
 * @param data - Girdi veri dizisi (Örn: kapanış fiyatları veya hacimler)
 * @param period - Periyot (kaç elemanlı pencere)
 * @returns SMA değerleri dizisi (uzunluk: data.length - period + 1)
 *
 * @example
 * ```ts
 * const closes = [10, 11, 12, 13, 14, 15];
 * const sma3 = calculateSMA(closes, 3);
 * // → [11, 12, 13, 14]  (her biri 3'lü pencerenin ortalaması)
 * ```
 */
export function calculateSMA(data: number[], period: number): number[] {
  // Güvenlik kontrolü: yeterli veri yoksa boş dizi döndür
  if (data.length === 0 || period <= 0 || data.length < period) {
    return [];
  }

  const result: number[] = [];

  // İlk pencere toplamını hesapla
  let windowSum = 0;
  for (let i = 0; i < period; i++) {
    windowSum += data[i]!;
  }
  result.push(windowSum / period);

  // Kayan pencere: bir eleman ekle, bir eleman çıkar
  for (let i = period; i < data.length; i++) {
    windowSum += data[i]! - data[i - period]!;
    result.push(windowSum / period);
  }

  return result;
}

/**
 * Üssel Hareketli Ortalama (Exponential Moving Average)
 *
 * İlk değer SMA ile başlatılır, sonraki değerler üssel
 * ağırlıklandırma ile hesaplanır:
 *   EMA_t = close_t * k + EMA_(t-1) * (1 - k)
 *   k (multiplier) = 2 / (period + 1)
 *
 * İlk (period - 1) eleman için yeterli veri olmadığından
 * sonuç dizisi girdiden `period - 1` eleman daha kısadır.
 *
 * @param data - Girdi veri dizisi (Örn: kapanış fiyatları)
 * @param period - Periyot
 * @returns EMA değerleri dizisi (uzunluk: data.length - period + 1)
 *
 * @example
 * ```ts
 * const closes = [22, 24, 23, 25, 26, 28, 27, 29, 30, 28];
 * const ema5 = calculateEMA(closes, 5);
 * // İlk değer = SMA(ilk 5 eleman), sonrakiler üssel ağırlıklı
 * ```
 */
export function calculateEMA(data: number[], period: number): number[] {
  // Güvenlik kontrolü: yeterli veri yoksa boş dizi döndür
  if (data.length === 0 || period <= 0 || data.length < period) {
    return [];
  }

  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  // İlk EMA değeri = ilk `period` elemanın SMA'sı
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i]!;
  }
  let ema = sum / period;
  result.push(ema);

  // Sonraki değerler: EMA formülü
  for (let i = period; i < data.length; i++) {
    ema = data[i]! * multiplier + ema * (1 - multiplier);
    result.push(ema);
  }

  return result;
}

/**
 * Göreceli Güç Endeksi (Relative Strength Index - RSI)
 *
 * Fiyatın aşırı alım (>70) veya aşırı satım (<30) bölgesinde
 * olup olmadığını gösterir. Wilder'ın orijinal formülünü kullanır.
 *
 * RSI = 100 - (100 / (1 + RS))
 * RS  = Ortalama Kazanç / Ortalama Kayıp
 *
 * @param data - Kapanış fiyatları dizisi
 * @param period - RSI periyodu (genellikle 14)
 * @returns RSI değerleri dizisi (0-100 arası)
 *
 * @example
 * ```ts
 * const rsi = calculateRSI(closes, 14);
 * if (rsi[rsi.length - 1] > 70) console.log("Aşırı alım!");
 * ```
 */
export function calculateRSI(data: number[], period: number = 14): number[] {
  if (data.length < period + 1) return [];

  const result: number[] = [];

  // İlk ortalama kazanç/kayıp hesapla
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = data[i]! - data[i - 1]!;
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }

  avgGain /= period;
  avgLoss /= period;

  // İlk RSI
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs));

  // Wilder's smoothing ile devam et
  for (let i = period + 1; i < data.length; i++) {
    const change = data[i]! - data[i - 1]!;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rsI = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rsI));
  }

  return result;
}
