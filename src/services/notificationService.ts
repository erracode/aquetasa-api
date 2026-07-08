export interface CurrentRates {
  USD: number
  EUR: number
  USDT: number
}

interface RateChange {
  currency: string
  oldRate: number
  newRate: number
  change: number
  direction: 'up' | 'down' | 'same'
}

export interface EnvBindings {
  DB: D1Database
}

export class NotificationService {
  private expoPushUrl = 'https://exp.host/--/api/v2/push/send'
  private minChangeThreshold = 0.01 // Minimum change in Bs to trigger notification (TEMP: lowered for testing)
  private minHoursBetweenNotifications = 0 // TEMP: disabled throttle for testing

  constructor(private env: EnvBindings) {}

  /**
   * Check if we should send a notification based on rate changes
   */
  async shouldNotify(newRates: CurrentRates): Promise<{ shouldSend: boolean; changes: RateChange[] }> {
    const lastRates = await this.getLastRates()
    
    if (!lastRates) {
      return { shouldSend: false, changes: [] }
    }

    const changes: RateChange[] = []
    
    for (const [currency, newRate] of Object.entries(newRates)) {
      const oldRate = lastRates[currency as keyof CurrentRates]
      const change = Math.abs(newRate - oldRate)
      
      if (change >= this.minChangeThreshold) {
        changes.push({
          currency,
          oldRate,
          newRate,
          change,
          direction: newRate > oldRate ? 'up' : 'down'
        })
      }
    }

    if (changes.length === 0) {
      return { shouldSend: false, changes: [] }
    }

    const lastNotification = await this.getLastNotificationTime()
    if (lastNotification) {
      const hoursSinceLastNotification = 
        (Date.now() - lastNotification.getTime()) / (1000 * 60 * 60)
      
      if (hoursSinceLastNotification < this.minHoursBetweenNotifications) {
        console.log(`Only ${hoursSinceLastNotification.toFixed(1)} hours since last notification, skipping`)
        return { shouldSend: false, changes }
      }
    }

    const notificationsToday = await this.getNotificationCountToday()
    if (notificationsToday >= 2) {
      console.log(`Already sent ${notificationsToday} notifications today, skipping`)
      return { shouldSend: false, changes }
    }

    return { shouldSend: true, changes }
  }

  /**
   * Send push notification to all registered Expo Push Tokens
   */
  async sendNotification(rates: CurrentRates, changes: RateChange[]): Promise<void> {
    try {
      // Get all registered push tokens
      const tokens = await this.getAllPushTokens()
      
      if (tokens.length === 0) {
        console.log('No push tokens registered, skipping notification')
        return
      }

      const message = this.formatNotificationMessage(rates, changes)
      const title = '📈 AQUÉ TA$A - Cambio en tasas'

      // Send to all tokens (Expo allows up to 100 messages per request)
      const chunks = this.chunkArray(tokens, 100)
      
      for (const chunk of chunks) {
        const messages = chunk.map(token => ({
          to: token,
          title: title,
          body: message,
          priority: 'high',
          sound: 'default',
          badge: 1,
          data: {
            type: 'rate_change',
            rates: rates,
            changes: changes,
          },
        }))

        const response = await fetch(this.expoPushUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify(messages),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`Expo Push API error: ${response.status} - ${errorText}`)
        }

        const result = await response.json() as { data?: Array<{ status: string; details?: { error?: string } }> }
        
        // Handle invalid tokens
        if (result.data && Array.isArray(result.data)) {
          for (let i = 0; i < result.data.length; i++) {
            const receipt = result.data[i]
            if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
              // Remove invalid token
              await this.removePushToken(chunk[i])
            }
          }
        }
      }

      // Log notification
      await this.logNotification(rates, changes, tokens.length)
      
      console.log(`Notification sent successfully to ${tokens.length} devices`)
    } catch (error) {
      console.error('Failed to send notification:', error)
      throw error
    }
  }

  /**
   * Register a new push token
   */
  async registerPushToken(token: string, platform: 'ios' | 'android'): Promise<void> {
    try {
      const db = this.env.DB
      
      await db.prepare(`
        INSERT INTO push_tokens (token, platform, registered_at, last_used)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(token) DO UPDATE SET
          last_used = excluded.last_used,
          platform = excluded.platform
      `).bind(
        token,
        platform,
        new Date().toISOString(),
        new Date().toISOString()
      ).run()
      
      console.log(`Push token registered: ${token.substring(0, 20)}...`)
    } catch (error) {
      console.error('Error registering push token:', error)
      throw error
    }
  }

  /**
   * Get all registered push tokens
   */
  private async getAllPushTokens(): Promise<string[]> {
    try {
      const db = this.env.DB
      
      const results = await db.prepare(`
        SELECT token FROM push_tokens
        WHERE registered_at > datetime('now', '-30 days')
      `).all<{ token: string }>()

      return results.results?.map(r => r.token) || []
    } catch (error) {
      console.error('Error getting push tokens:', error)
      return []
    }
  }

  /**
   * Remove invalid push token
   */
  async removePushToken(token: string): Promise<void> {
    try {
      const db = this.env.DB
      
      await db.prepare(`
        DELETE FROM push_tokens WHERE token = ?
      `).bind(token).run()
      
      console.log(`Removed invalid push token: ${token.substring(0, 20)}...`)
    } catch (error) {
      console.error('Error removing push token:', error)
    }
  }

  /**
   * Format notification message
   */
  private formatNotificationMessage(rates: CurrentRates, changes: RateChange[]): string {
    const lines: string[] = []
    
    const usdChange = changes.find(c => c.currency === 'USD')
    const usdIcon = usdChange ? (usdChange.direction === 'up' ? '↑' : '↓') : '→'
    lines.push(`USD BCV: Bs. ${rates.USD.toFixed(2)} ${usdIcon}`)
    
    const eurChange = changes.find(c => c.currency === 'EUR')
    const eurIcon = eurChange ? (eurChange.direction === 'up' ? '↑' : '↓') : '→'
    lines.push(`EUR BCV: Bs. ${rates.EUR.toFixed(2)} ${eurIcon}`)
    
    const usdtChange = changes.find(c => c.currency === 'USDT')
    const usdtIcon = usdtChange ? (usdtChange.direction === 'up' ? '↑' : '↓') : '→'
    lines.push(`USDT: Bs. ${rates.USDT.toFixed(2)} ${usdtIcon}`)

    return lines.join('\n')
  }

  /**
   * Get last recorded rates from database
   */
  private async getLastRates(): Promise<CurrentRates | null> {
    try {
      const db = this.env.DB
      
      const results = await db.prepare(`
        SELECT currency, avg_rate
        FROM exchange_rates
        WHERE currency IN ('USD', 'EUR', 'USDT')
        GROUP BY currency, source
        HAVING fetched_at = MAX(fetched_at)
      `).all<{ currency: string; avg_rate: number }>()

      if (!results.results || results.results.length === 0) {
        return null
      }

      const rates: Partial<CurrentRates> = {}
      for (const row of results.results) {
        rates[row.currency as keyof CurrentRates] = row.avg_rate
      }

      if (rates.USD && rates.EUR && rates.USDT) {
        return rates as CurrentRates
      }

      return null
    } catch (error) {
      console.error('Error getting last rates:', error)
      return null
    }
  }

  /**
   * Get time of last notification
   */
  private async getLastNotificationTime(): Promise<Date | null> {
    try {
      const db = this.env.DB
      
      const result = await db.prepare(`
        SELECT sent_at 
        FROM notification_log 
        ORDER BY sent_at DESC 
        LIMIT 1
      `).first<{ sent_at: string }>()

      return result ? new Date(result.sent_at) : null
    } catch (error) {
      console.error('Error getting last notification time:', error)
      return null
    }
  }

  /**
   * Count notifications sent today
   */
  private async getNotificationCountToday(): Promise<number> {
    try {
      const db = this.env.DB
      
      const result = await db.prepare(`
        SELECT COUNT(*) as count
        FROM notification_log
        WHERE date(sent_at) = date('now')
      `).first<{ count: number }>()

      return result?.count || 0
    } catch (error) {
      console.error('Error counting notifications:', error)
      return 0
    }
  }

  /**
   * Log notification to database
   */
  private async logNotification(rates: CurrentRates, changes: RateChange[], recipientCount: number): Promise<void> {
    try {
      const db = this.env.DB
      
      await db.prepare(`
        INSERT INTO notification_log (notification_type, rates_data, changes_summary, recipient_count, sent_at)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        'rate_change',
        JSON.stringify(rates),
        changes.map(c => `${c.currency}: ${c.oldRate.toFixed(2)} → ${c.newRate.toFixed(2)}`).join(', '),
        recipientCount,
        new Date().toISOString()
      ).run()
    } catch (error) {
      console.error('Error logging notification:', error)
    }
  }

  /**
   * Chunk array into smaller arrays
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
