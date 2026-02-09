-- Migration: Initial schema for AQUÉ TA$A API
-- Creates table for caching dollar rates

CREATE TABLE IF NOT EXISTS rates_cache (
    id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at TEXT NOT NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rates_cache_cached_at 
ON rates_cache(cached_at);
