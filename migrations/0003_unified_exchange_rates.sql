-- Migration: Unified exchange rates table
-- Consolidates BCV and Binance data into single normalized table
-- Adds notification tracking

-- Create unified exchange_rates table
CREATE TABLE IF NOT EXISTS exchange_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,           -- 'bcv', 'binance'
    currency TEXT NOT NULL,         -- 'USD', 'EUR', 'USDT'
    rate_type TEXT NOT NULL,        -- 'official', 'p2p'
    buy_rate REAL,                  -- NULL for BCV (only avg)
    sell_rate REAL,                 -- NULL for BCV
    avg_rate REAL NOT NULL,         -- Main rate (promedio)
    raw_data TEXT,                  -- JSON for debugging
    fetched_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast latest rate lookups
CREATE INDEX IF NOT EXISTS idx_exchange_rates_latest 
ON exchange_rates(source, currency, fetched_at DESC);

-- Index for time-based queries (historical data)
CREATE INDEX IF NOT EXISTS idx_exchange_rates_time 
ON exchange_rates(fetched_at DESC);

-- Create notification tracking table
CREATE TABLE IF NOT EXISTS notification_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    notification_type TEXT NOT NULL,    -- 'rate_change'
    rates_data TEXT NOT NULL,           -- JSON of rates that triggered notification
    changes_summary TEXT,               -- Human-readable summary of changes
    sent_at TEXT NOT NULL,
    recipient_count INTEGER DEFAULT 0
);

-- Index for checking recent notifications
CREATE INDEX IF NOT EXISTS idx_notification_log_sent_at 
ON notification_log(sent_at DESC);

-- Migrate data from old rates_cache table (BCV data)
INSERT INTO exchange_rates (source, currency, rate_type, buy_rate, sell_rate, avg_rate, raw_data, fetched_at)
SELECT 
    'dolarapi' as source,
    CASE 
        WHEN json_extract(value, '$.fuente') = 'oficial' THEN 'USD'
        WHEN json_extract(value, '$.fuente') = 'paralelo' THEN 'USD_PARALLEL'
        ELSE 'UNKNOWN'
    END as currency,
    CASE 
        WHEN json_extract(value, '$.fuente') = 'oficial' THEN 'official'
        ELSE 'parallel'
    END as rate_type,
    json_extract(value, '$.compra') as buy_rate,
    json_extract(value, '$.venta') as sell_rate,
    COALESCE(
        json_extract(value, '$.promedio'),
        json_extract(value, '$.venta'),
        json_extract(value, '$.compra')
    ) as avg_rate,
    json_object('original_fuente', json_extract(value, '$.fuente'), 'original_nombre', json_extract(value, '$.nombre')) as raw_data,
    rc.cached_at as fetched_at
FROM rates_cache rc, json_each(rc.data)
WHERE rc.id = 1;

-- Migrate data from old binance_p2p_rates table
INSERT INTO exchange_rates (source, currency, rate_type, avg_rate, raw_data, fetched_at)
SELECT 
    'binance' as source,
    'USDT' as currency,
    'p2p' as rate_type,
    median_price as avg_rate,
    json_object('average_price', average_price, 'prices', prices, 'fiat', fiat, 'asset', asset, 'trade_type', trade_type) as raw_data,
    timestamp as fetched_at
FROM binance_p2p_rates
ORDER BY timestamp ASC;

-- Note: After verification, you can drop old tables:
-- DROP TABLE IF EXISTS rates_cache;
-- DROP TABLE IF EXISTS binance_p2p_rates;
