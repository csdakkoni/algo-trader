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
