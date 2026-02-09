import { Hono } from 'hono'
import { Env } from '../index'

// Scheduled task handler - runs every 15 minutes via cron trigger
export async function scheduled(
  event: ScheduledEvent,
  env: Env['Bindings'],
  ctx: ExecutionContext
): Promise<void> {
  ctx.waitUntil(updateRatesCache(env))
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

// Manual trigger endpoint (for testing)
export const cronRouter = new Hono<Env>()

cronRouter.post('/trigger', async (c) => {
  // This would be protected by API key in production
  await updateRatesCache(c.env)
  return c.json({ message: 'Cache update triggered' })
})
