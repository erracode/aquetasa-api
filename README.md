# AQUÉ TA$A Backend API

Backend service for caching and serving dollar exchange rates for Venezuela.

## Features

- **Rate Caching**: Fetches rates from dolarapi.com every 15 minutes
- **Binance P2P**: Fetches USDT/VES rates from Binance P2P market
- **Dual Cache Layer**: In-memory cache + D1 database persistence
- **Rate Limiting**: 30 requests/minute per IP
- **Fallback Strategy**: Returns stale cache if API is unavailable
- **CORS Protection**: Configurable allowed origins

## API Endpoints

### GET /rates
Returns current dollar exchange rates.

**Response:**
```json
{
  "data": [
    {
      "fuente": "oficial",
      "nombre": "Oficial",
      "compra": null,
      "venta": null,
      "promedio": 385.272,
      "fechaActualizacion": "2026-02-09T21:01:25.501Z"
    }
  ],
  "source": "api|db-cache|memory-cache",
  "cachedAt": "2026-02-09T21:01:25.501Z"
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-09T21:01:25.501Z",
  "database": "connected",
  "version": "1.0.0"
}
```

### GET /binance/usdt-ves
Returns current USDT/VES rate from Binance P2P.

**Response:**
```json
{
  "data": {
    "fiat": "VES",
    "asset": "USDT",
    "tradeType": "BUY",
    "averagePrice": 84.50,
    "medianPrice": 84.45,
    "prices": [84.20, 84.45, 84.50, 84.60, 84.80],
    "timestamp": "2026-02-09T21:01:25.501Z"
  },
  "source": "binance-p2p"
}
```

### GET /binance/history?limit=24
Returns historical USDT/VES rates.

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 24)

**Response:**
```json
{
  "data": [
    {
      "fiat": "VES",
      "asset": "USDT",
      "tradeType": "BUY",
      "averagePrice": 84.50,
      "medianPrice": 84.45,
      "prices": [84.20, 84.45, 84.50],
      "timestamp": "2026-02-09T21:01:25.501Z"
    }
  ],
  "source": "binance-p2p",
  "count": 1
}
```

## Setup

1. **Install dependencies:**
```bash
bun install
```

2. **Create D1 database:**
```bash
wrangler d1 create aquetasa-db
# Copy the database_id to wrangler.toml
```

3. **Run migrations:**
```bash
bun run db:migrate:local  # For local development
# or
bun run db:migrate        # For production
```

4. **Set secrets:**
```bash
wrangler secret put ALLOWED_ORIGINS
# Enter: https://your-app.com,https://your-other-app.com
```

5. **Deploy:**
```bash
bun run deploy
```

## Development

```bash
bun run dev
```

## Architecture

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Mobile     │────▶│  Cloudflare     │────▶│   D1 Cache   │
│    App       │◄────│    Workers      │◄────│              │
└──────────────┘     └─────────────────┘     └──────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │    dolarapi.com (BCV)       │
              │    Binance P2P (USDT/VES)   │
              └─────────────────────────────┘
```

## Cache Strategy

1. **Memory Cache**: Fastest, resets on worker restart (5 min TTL)
2. **D1 Cache**: Persistent, survives restarts (5 min TTL)
3. **Stale Fallback**: Returns expired cache if API is down

## Rate Limiting

- 30 requests per minute per IP
- Headers included: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429 status with `Retry-After` header when exceeded
