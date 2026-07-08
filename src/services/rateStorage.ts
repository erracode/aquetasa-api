import { EnvBindings } from './notificationService'

export interface RateData {
  source: 'bcv' | 'binance'
  currency: 'USD' | 'EUR' | 'USDT'
  rateType: 'official' | 'p2p'
  avgRate: number
  buyRate?: number
  sellRate?: number
  rawData?: Record<string, unknown>
}

export class RateStorageService {
  constructor(private env: EnvBindings) {}

  /**
   * Store a rate in the database
   */
  async storeRate(rate: RateData): Promise<void> {
    const db = this.env.DB
    
    await db.prepare(`
      INSERT INTO exchange_rates 
      (source, currency, rate_type, buy_rate, sell_rate, avg_rate, raw_data, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      rate.source,
      rate.currency,
      rate.rateType,
      rate.buyRate || null,
      rate.sellRate || null,
      rate.avgRate,
      rate.rawData ? JSON.stringify(rate.rawData) : null,
      new Date().toISOString()
    ).run()
  }

  /**
   * Store multiple rates
   */
  async storeRates(rates: RateData[]): Promise<void> {
    for (const rate of rates) {
      await this.storeRate(rate)
    }
  }

  /**
   * Get latest rate for a specific currency
   */
  async getLatestRate(currency: string): Promise<RateData | null> {
    const db = this.env.DB
    
    const result = await db.prepare(`
      SELECT source, currency, rate_type, buy_rate, sell_rate, avg_rate, raw_data, fetched_at
      FROM exchange_rates
      WHERE currency = ?
      ORDER BY fetched_at DESC
      LIMIT 1
    `).bind(currency).first<{
      source: string
      currency: string
      rate_type: string
      buy_rate: number | null
      sell_rate: number | null
      avg_rate: number
      raw_data: string
      fetched_at: string
    }>()

    if (!result) return null

    return {
      source: result.source as 'bcv' | 'binance',
      currency: result.currency as 'USD' | 'EUR' | 'USDT',
      rateType: result.rate_type as 'official' | 'p2p',
      avgRate: result.avg_rate,
      buyRate: result.buy_rate || undefined,
      sellRate: result.sell_rate || undefined,
      rawData: result.raw_data ? JSON.parse(result.raw_data) : undefined
    }
  }

  /**
   * Get all current rates
   */
  async getCurrentRates(): Promise<Record<string, number>> {
    const db = this.env.DB
    
    // Fixed query - avoid ambiguous column by using explicit table aliases
    const results = await db.prepare(`
      SELECT er.currency, er.avg_rate
      FROM exchange_rates er
      INNER JOIN (
        SELECT currency as curr, MAX(fetched_at) as max_fetched
        FROM exchange_rates
        WHERE currency IN ('USD', 'EUR', 'USDT')
        GROUP BY currency
      ) latest ON er.currency = latest.curr AND er.fetched_at = latest.max_fetched
    `).all<{ currency: string; avg_rate: number }>()

    const rates: Record<string, number> = {}
    for (const row of results.results || []) {
      rates[row.currency] = row.avg_rate
    }

    return rates
  }

  /**
   * Check if rate has changed significantly
   */
  async hasRateChanged(currency: string, newRate: number, threshold: number = 0.50): Promise<boolean> {
    const lastRate = await this.getLatestRate(currency)
    
    if (!lastRate) {
      return true // First rate, consider it changed
    }

    return Math.abs(newRate - lastRate.avgRate) >= threshold
  }
}
