-- ============================================================
-- Modül 1: Veri Toplayıcı ve Veritabanı Entegrasyonu
-- Migration 001: assets ve stock_candles tablolarını oluştur
-- ============================================================

-- ========================
-- 1. ASSETS TABLOSU
-- Takip edilecek hisseleri tutar.
-- ========================
CREATE TABLE IF NOT EXISTS assets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker      VARCHAR(20)  NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Aktif hisseleri hızlıca filtrelemek için partial index
CREATE INDEX IF NOT EXISTS idx_assets_is_active
    ON assets (is_active)
    WHERE is_active = true;

-- updated_at otomatik güncelleme trigger'ı
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_assets_updated_at
    BEFORE UPDATE ON assets
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================
-- 2. STOCK_CANDLES TABLOSU
-- OHLCV fiyat verilerini tutar.
-- ========================
CREATE TABLE IF NOT EXISTS stock_candles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id    UUID           NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    timestamp   TIMESTAMPTZ    NOT NULL,
    open        NUMERIC(18,6)  NOT NULL,
    high        NUMERIC(18,6)  NOT NULL,
    low         NUMERIC(18,6)  NOT NULL,
    close       NUMERIC(18,6)  NOT NULL,
    volume      BIGINT         NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),

    -- Upsert için composite unique constraint
    -- Aynı hissenin aynı zamandaki mumu tekrar eklenemez
    CONSTRAINT uq_stock_candles_asset_timestamp UNIQUE (asset_id, timestamp)
);

-- Zaman serisi sorguları için birleşik index (asset_id + timestamp DESC)
-- "Belirli bir hissenin son N mumunu getir" gibi sorgular için optimize
CREATE INDEX IF NOT EXISTS idx_stock_candles_asset_timestamp
    ON stock_candles (asset_id, timestamp DESC);

-- Sadece zamana göre sorgular için index
-- "Tüm hisselerin belirli bir tarihteki verilerini getir" gibi sorgular için optimize
CREATE INDEX IF NOT EXISTS idx_stock_candles_timestamp
    ON stock_candles (timestamp DESC);

-- ========================
-- 3. ROW LEVEL SECURITY (RLS)
-- Server-side erişim için basit yapılandırma
-- ========================
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_candles ENABLE ROW LEVEL SECURITY;

-- Service role key kullanıldığında tüm işlemlere izin ver
CREATE POLICY "Service role full access on assets"
    ON assets FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on stock_candles"
    ON stock_candles FOR ALL
    USING (true)
    WITH CHECK (true);
