import { Hono } from 'hono'
import { Env } from '../index'
import { WidgetCacheService } from '../services/widgetCache'
import { RateStorageService } from '../services/rateStorage'

export const widgetRouter = new Hono<Env>()

// GET /widget/rates - Public endpoint for widget
// Tries KV first, falls back to D1 database if KV is empty
widgetRouter.get('/rates', async (c) => {
  const widgetCache = new WidgetCacheService(c.env)
  
  try {
    // Try KV cache first
    const cachedRates = await widgetCache.getCachedRates()
    
    if (cachedRates && !widgetCache.isCacheStale(cachedRates.cachedAt)) {
      return c.json(cachedRates)
    }
    
    // Fallback: Fetch from D1 database directly
    console.log('KV cache empty or stale, fetching from D1...')
    const storage = new RateStorageService(c.env)
    const rates = await storage.getCurrentRates()
    
    const widgetData = {
      usd: {
        currency: 'USD',
        value: rates['USD'] || 0,
        updatedAt: new Date().toISOString()
      },
      eur: {
        currency: 'EUR',
        value: rates['EUR'] || 0,
        updatedAt: new Date().toISOString()
      },
      usdt: {
        currency: 'USDT',
        value: rates['USDT'] || 0,
        updatedAt: new Date().toISOString()
      },
      cachedAt: new Date().toISOString(),
      source: 'database' // Indicate this came from D1, not KV
    }
    
    // If we got data from D1, also update KV for next time
    if (rates['USD'] || rates['EUR'] || rates['USDT']) {
      try {
        await widgetCache.updateCachedRates(widgetData)
      } catch (kvError) {
        console.error('Failed to update KV cache:', kvError)
        // Continue anyway - we have the data from D1
      }
      
      return c.json(widgetData)
    }
    
    // No data available anywhere
    return c.json({
      error: 'Rates not available',
      message: 'No exchange rate data found. Please try again later.'
    }, 503)
    
  } catch (error) {
    console.error('Widget error:', error)
    return c.json({
      error: 'Failed to fetch rates',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// GET /widget/health - Health check for widget service
widgetRouter.get('/health', async (c) => {
  const widgetCache = new WidgetCacheService(c.env)
  const rates = await widgetCache.getCachedRates()
  
  return c.json({
    status: rates ? 'ok' : 'error',
    hasData: !!rates,
    cachedAt: rates?.cachedAt || null,
    isStale: rates ? widgetCache.isCacheStale(rates.cachedAt) : null
  })
})
