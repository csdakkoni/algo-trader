-- ============================================================
-- Modül 3: Paper Trading Engine
-- Migration 002: paper_accounts ve paper_positions tablolarını oluştur
-- ============================================================

-- ========================
-- 1. PAPER_ACCOUNTS TABLOSU
-- Sanal kasa hesaplarını tutar.
-- ========================
CREATE TABLE IF NOT EXISTS paper_accounts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL UNIQUE,
    balance     NUMERIC(18,2) NOT NULL DEFAULT 100000.00,
    currency    VARCHAR(10)   NOT NULL DEFAULT 'TRY',
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ========================
-- 2. PAPER_POSITIONS TABLOSU
-- Sanal açık/kapalı pozisyonları tutar.
-- ========================
CREATE TABLE IF NOT EXISTS paper_positions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id        UUID           NOT NULL REFERENCES paper_accounts(id) ON DELETE CASCADE,
    asset_id          UUID           NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    type              VARCHAR(10)    NOT NULL DEFAULT 'BUY',
    entry_price       NUMERIC(18,6)  NOT NULL,
    stop_loss_price   NUMERIC(18,6)  NOT NULL,
    take_profit_price NUMERIC(18,6)  NOT NULL,
    quantity          NUMERIC(18,6)  NOT NULL,
    status            VARCHAR(10)    NOT NULL DEFAULT 'OPEN',
    exit_price        NUMERIC(18,6),
    exit_timestamp    TIMESTAMPTZ,
    profit_loss       NUMERIC(18,2),
    created_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),

    -- Durum kısıtlaması
    CONSTRAINT chk_position_status CHECK (status IN ('OPEN', 'CLOSED')),
    CONSTRAINT chk_position_type   CHECK (type IN ('BUY'))
);

-- İndexler
CREATE INDEX IF NOT EXISTS idx_paper_positions_status
    ON paper_positions (status)
    WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_paper_positions_account
    ON paper_positions (account_id);

CREATE INDEX IF NOT EXISTS idx_paper_positions_asset
    ON paper_positions (asset_id);

-- ========================
-- 3. ROW LEVEL SECURITY
-- ========================
ALTER TABLE paper_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on paper_accounts"
    ON paper_accounts FOR ALL
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role full access on paper_positions"
    ON paper_positions FOR ALL
    USING (true)
    WITH CHECK (true);
