import { Hono } from 'hono'
import { Env } from '../index'
import { binanceP2PService } from '../services/binanceP2P'

// Scheduled task handler - runs every 15 minutes via cron trigger
export async function scheduled(
  event: ScheduledEvent,
  env: Env['Bindings'],
  ctx: ExecutionContext
): Promise<void> {
  ctx.waitUntil(Promise.all([
    updateRatesCache(env),
    updateBinanceP2PRates(env)
  ]))
}

async function updateRatesCache(env: Env['Bindings']): Promise<void> {
  try {
    console.log('Running scheduled rate update...')
    
    // Fetch fresh rates from external API
    const response = await fetch(env.DOLAR_API_URL)
    
    if (!response.ok) {
      throw new Error(`External API error: ${response.status}`)
    }
    
    const data = await response.json()
    const cachedAt = new Date().toISOString()
    
    // Update D1 cache
    await env.DB
      .prepare(`
        INSERT INTO rates_cache (id, data, cached_at) 
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET 
          data = excluded.data,
          cached_at = excluded.cached_at
      `)
      .bind(JSON.stringify(data), cachedAt)
      .run()
    
    console.log(`Rates updated successfully at ${cachedAt}`)
    
    // Optional: Log rate changes for analytics
    // You could compare with previous values here and store changes
    
  } catch (error) {
    console.error('Failed to update rates cache:', error)
    // Don't throw - we don't want to fail the cron job permanently
  }
}

async function updateBinanceP2PRates(env: Env['Bindings']): Promise<void> {
  try {
    console.log('Running scheduled Binance P2P update...')
    
    // Fetch USDT/VES from Binance P2P
    const rate = await binanceP2PService.getUSDTVES()
    
    if (!rate) {
      console.error('Failed to fetch Binance P2P rate')
      return
    }
    
    // Store in D1
    await env.DB
      .prepare(`
        INSERT INTO binance_p2p_rates (fiat, asset, trade_type, average_price, median_price, prices, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        rate.fiat,
        rate.asset,
        rate.tradeType,
        rate.averagePrice,
        rate.medianPrice,
        JSON.stringify(rate.prices),
        rate.timestamp
      )
      .run()
    
    console.log(`Binance P2P rate updated: ${rate.medianPrice} VES/USDT`)
    
  } catch (error) {
    console.error('Failed to update Binance P2P rates:', error)
    // Don't throw - we don't want to fail the cron job permanently
  }
}

// Manual trigger endpoint (for testing)
export const cronRouter = new Hono<Env>()

cronRouter.post('/trigger', async (c) => {
  // This would be protected by API key in production
  await updateRatesCache(c.env)
  return c.json({ message: 'Cache update triggered' })
})
