import { Hono } from 'hono'
import { Env } from '../index'

interface ExchangeRate {
  fuente: string
  nombre: string
  compra: number | null
  venta: number | null
  promedio: number | null
  fechaActualizacion: string
}

interface CachedRates {
  data: ExchangeRate[]
  cachedAt: string
  expiresAt: string
}

// In-memory cache (resets on worker restart)
let memoryCache: CachedRates | null = null

export const ratesRouter = new Hono<Env>()

// GET /rates - Get current exchange rates (consolidated BCV + USDT)
ratesRouter.get('/', async (c) => {
  const db = c.env.DB
  const now = new Date()
  
  try {
    // Query latest rates for each currency
    const results = await db.prepare(`
      SELECT 
        e.source,
        e.currency,
        e.rate_type,
        e.buy_rate,
        e.sell_rate,
        e.avg_rate,
        e.fetched_at
      FROM exchange_rates e
      INNER JOIN (
        SELECT currency, MAX(fetched_at) as max_fetched
        FROM exchange_rates
        WHERE currency IN ('USD', 'EUR', 'USDT')
        GROUP BY currency
      ) latest ON e.currency = latest.currency AND e.fetched_at = latest.max_fetched
      ORDER BY 
        CASE e.currency
          WHEN 'USD' THEN 1
          WHEN 'EUR' THEN 2
          WHEN 'USDT' THEN 3
        END
    `).all<{
      source: string
      currency: string
      rate_type: string
      buy_rate: number | null
      sell_rate: number | null
      avg_rate: number
      fetched_at: string
    }>()

    const combinedRates: ExchangeRate[] = []

    for (const row of results.results || []) {
      let rate: ExchangeRate

      if (row.currency === 'USD') {
        rate = {
          fuente: 'oficial',
          nombre: 'Oficial',
          compra: row.buy_rate,
          venta: row.sell_rate,
          promedio: row.avg_rate,
          fechaActualizacion: row.fetched_at,
        }
      } else if (row.currency === 'EUR') {
        rate = {
          fuente: 'euro',
          nombre: 'Euro BCV',
          compra: row.buy_rate,
          venta: row.sell_rate,
          promedio: row.avg_rate,
          fechaActualizacion: row.fetched_at,
        }
      } else if (row.currency === 'USDT') {
        rate = {
          fuente: 'usdt',
          nombre: 'USDT (P2P)',
          compra: row.buy_rate,
          venta: row.sell_rate,
          promedio: row.avg_rate,
          fechaActualizacion: row.fetched_at,
        }
      } else {
        continue
      }

      combinedRates.push(rate)
    }

    if (combinedRates.length === 0) {
      return c.json(
        {
          error: 'No exchange rate data available',
          data: [],
          source: 'error',
          cachedAt: now.toISOString(),
        },
        503
      )
    }

    return c.json({
      data: combinedRates,
      source: 'api',
      cachedAt: now.toISOString(),
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('Error fetching consolidated rates:', errorMessage)
    return c.json(
      {
        error: 'Failed to fetch exchange rates',
        message: errorMessage,
        data: [],
        source: 'error',
        cachedAt: now.toISOString(),
      },
      500
    )
  }
})
