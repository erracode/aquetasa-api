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

// GET /rates - Get current exchange rates
ratesRouter.get('/', async (c) => {
  const db = c.env.DB
  const cacheTTL = parseInt(c.env.CACHE_TTL_SECONDS || '300') * 1000 // Convert to ms
  const now = new Date()
  
  // Check memory cache first (fastest)
  if (memoryCache) {
    const expiresAt = new Date(memoryCache.expiresAt)
    if (expiresAt > now) {
      return c.json({
        data: memoryCache.data,
        source: 'memory-cache',
        cachedAt: memoryCache.cachedAt
      })
    }
  }
  
  // Check D1 cache
  try {
    const dbCache = await db
      .prepare('SELECT data, cached_at FROM rates_cache WHERE id = 1')
      .first<{ data: string; cached_at: string }>()
    
    if (dbCache) {
      const cachedAt = new Date(dbCache.cached_at)
      const age = now.getTime() - cachedAt.getTime()
      
      if (age < cacheTTL) {
        const data = JSON.parse(dbCache.data) as ExchangeRate[]
        
        // Update memory cache
        memoryCache = {
          data,
          cachedAt: dbCache.cached_at,
          expiresAt: new Date(cachedAt.getTime() + cacheTTL).toISOString()
        }
        
        return c.json({
          data,
          source: 'db-cache',
          cachedAt: dbCache.cached_at
        })
      }
    }
  } catch (error) {
    console.error('Database cache error:', error)
  }
  
  // Fetch from external API
  try {
    const response = await fetch(c.env.DOLAR_API_URL)
    
    if (!response.ok) {
      throw new Error(`External API error: ${response.status}`)
    }
    
    const data: ExchangeRate[] = await response.json()
    const cachedAt = now.toISOString()
    
    // Store in D1 cache
    try {
      await db
        .prepare(`
          INSERT INTO rates_cache (id, data, cached_at) 
          VALUES (1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET 
            data = excluded.data,
            cached_at = excluded.cached_at
        `)
        .bind(JSON.stringify(data), cachedAt)
        .run()
    } catch (error) {
      console.error('Failed to update DB cache:', error)
    }
    
    // Update memory cache
    memoryCache = {
      data,
      cachedAt,
      expiresAt: new Date(now.getTime() + cacheTTL).toISOString()
    }
    
    return c.json({
      data,
      source: 'api',
      cachedAt
    })
  } catch (error) {
    // Return stale cache if available
    if (memoryCache) {
      return c.json({
        data: memoryCache.data,
        source: 'memory-cache-stale',
        cachedAt: memoryCache.cachedAt,
        warning: 'Using stale data - API unavailable'
      })
    }
    
    try {
      const staleCache = await db
        .prepare('SELECT data, cached_at FROM rates_cache WHERE id = 1')
        .first<{ data: string; cached_at: string }>()
      
      if (staleCache) {
        return c.json({
          data: JSON.parse(staleCache.data) as ExchangeRate[],
          source: 'db-cache-stale',
          cachedAt: staleCache.cached_at,
          warning: 'Using stale data - API unavailable'
        })
      }
    } catch (dbError) {
      console.error('Database error:', dbError)
    }
    
    throw new Error('Failed to fetch rates and no cache available')
  }
})
