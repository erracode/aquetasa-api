interface EnvWithKV {
  RATES_KV: KVNamespace
}

export interface WidgetRate {
  currency: string
  value: number
  updatedAt: string
}

export interface WidgetData {
  usd: WidgetRate
  eur: WidgetRate
  usdt: WidgetRate
  cachedAt: string
}

/**
 * Service to cache rates in KV for widget consumption
 * This avoids exposing the main API and provides fast edge caching
 */
export class WidgetCacheService {
  private kvKey = 'widget-rates-v1'

  constructor(private env: EnvWithKV) {}

  /**
   * Get cached rates for widget (ultra-fast, reads from KV)
   */
  async getCachedRates(): Promise<WidgetData | null> {
    try {
      const cached = await this.env.RATES_KV?.get(this.kvKey, 'json')
      return cached as WidgetData | null
    } catch (error) {
      console.error('Error reading from KV:', error)
      return null
    }
  }

  /**
   * Update cached rates (called by cron job every 5 minutes)
   */
  async updateCachedRates(rates: WidgetData): Promise<void> {
    try {
      // Store with 1 hour expiration (in case cron fails)
      await this.env.RATES_KV?.put(this.kvKey, JSON.stringify(rates), {
        expirationTtl: 3600 // 1 hour
      })
      console.log('Widget rates cached successfully')
    } catch (error) {
      console.error('Error writing to KV:', error)
      throw error
    }
  }

  /**
   * Check if cache is stale (older than 10 minutes)
   */
  isCacheStale(cachedAt: string): boolean {
    const cacheTime = new Date(cachedAt).getTime()
    const now = Date.now()
    const tenMinutes = 10 * 60 * 1000
    return (now - cacheTime) > tenMinutes
  }
}
