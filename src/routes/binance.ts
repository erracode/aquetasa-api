import { Hono } from 'hono'
import { Env } from '../index'

export const binanceRouter = new Hono<Env>()

// GET /binance/usdt-ves - Get latest USDT/VES rate from Binance P2P
binanceRouter.get('/usdt-ves', async (c) => {
  try {
    const db = c.env.DB
    
    // Get the latest rate from database
    const latest = await db
      .prepare(`
        SELECT fiat, asset, trade_type, average_price, median_price, prices, timestamp
        FROM binance_p2p_rates
        WHERE fiat = 'VES' AND asset = 'USDT'
        ORDER BY timestamp DESC
        LIMIT 1
      `)
      .first<{
        fiat: string
        asset: string
        trade_type: string
        average_price: number
        median_price: number
        prices: string
        timestamp: string
      }>()
    
    if (!latest) {
      return c.json({ error: 'No Binance P2P data available' }, 404)
    }
    
    return c.json({
      data: {
        fiat: latest.fiat,
        asset: latest.asset,
        tradeType: latest.trade_type,
        averagePrice: latest.average_price,
        medianPrice: latest.median_price,
        prices: JSON.parse(latest.prices),
        timestamp: latest.timestamp,
      },
      source: 'binance-p2p',
    })
    
  } catch (error) {
    console.error('Error fetching Binance P2P rate:', error)
    return c.json({ error: 'Failed to fetch Binance P2P rate' }, 500)
  }
})

// GET /binance/history - Get historical rates (optional)
binanceRouter.get('/history', async (c) => {
  try {
    const db = c.env.DB
    const limit = parseInt(c.req.query('limit') || '24') // Default last 24 records
    
    const history = await db
      .prepare(`
        SELECT fiat, asset, trade_type, average_price, median_price, prices, timestamp
        FROM binance_p2p_rates
        WHERE fiat = 'VES' AND asset = 'USDT'
        ORDER BY timestamp DESC
        LIMIT ?
      `)
      .bind(limit)
      .all<{
        fiat: string
        asset: string
        trade_type: string
        average_price: number
        median_price: number
        prices: string
        timestamp: string
      }>()
    
    return c.json({
      data: history.results.map((row) => ({
        fiat: row.fiat,
        asset: row.asset,
        tradeType: row.trade_type,
        averagePrice: row.average_price,
        medianPrice: row.median_price,
        prices: JSON.parse(row.prices),
        timestamp: row.timestamp,
      })),
      source: 'binance-p2p',
      count: history.results.length,
    })
    
  } catch (error) {
    console.error('Error fetching Binance P2P history:', error)
    return c.json({ error: 'Failed to fetch Binance P2P history' }, 500)
  }
})
