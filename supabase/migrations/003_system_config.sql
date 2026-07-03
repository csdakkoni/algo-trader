-- ============================================================
-- Modül 5: Çoklu Strateji Profilleri & Sistem Konfigürasyonu
-- Migration 003: system_config tablosu
-- ============================================================

-- ========================
-- SYSTEM_CONFIG TABLOSU
-- Key-value yapısında sistem ayarlarını tutar.
-- Örn: active_mode = 'TREND' | 'AVCI' | 'SCALPER'
-- ========================
CREATE TABLE IF NOT EXISTS system_config (
    key         VARCHAR(100) PRIMARY KEY,
    value       JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Varsayılan aktif mod: TREND (Trend Takipçisi)
INSERT INTO system_config (key, value)
VALUES ('active_mode', '"TREND"')
ON CONFLICT (key) DO NOTHING;

-- Trigger: updated_at otomatik güncelleme
CREATE OR REPLACE FUNCTION update_system_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_system_config_updated_at
    BEFORE UPDATE ON system_config
    FOR EACH ROW
    EXECUTE FUNCTION update_system_config_timestamp();

-- RLS
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on system_config"
    ON system_config FOR ALL
    USING (true)
    WITH CHECK (true);
