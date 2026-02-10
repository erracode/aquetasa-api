-- Migration: Add Binance P2P rates table
-- Stores USDT/VES rates from Binance P2P

CREATE TABLE IF NOT EXISTS binance_p2p_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiat TEXT NOT NULL,
    asset TEXT NOT NULL,
    trade_type TEXT NOT NULL,
    average_price REAL,
    median_price REAL,
    prices TEXT NOT NULL, -- JSON array of prices
    timestamp TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_binance_rates_timestamp 
ON binance_p2p_rates(timestamp);

CREATE INDEX IF NOT EXISTS idx_binance_rates_fiat_asset 
ON binance_p2p_rates(fiat, asset);
