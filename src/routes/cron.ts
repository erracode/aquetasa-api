import { Hono, MiddlewareHandler } from 'hono'
import { Env } from '../index'
import { BCVScraper } from '../services/bcvScraper'
import { binanceP2PService } from '../services/binanceP2P'
import { NotificationService, CurrentRates } from '../services/notificationService'
import { RateStorageService } from '../services/rateStorage'
import { WidgetCacheService } from '../services/widgetCache'

// Skip auth for testing
const requireApiKey: MiddlewareHandler = async (c, next) => {
  await next()
}

// Scheduled task handler
export async function scheduled(
  event: ScheduledEvent,
  env: Env['Bindings'],
  ctx: ExecutionContext
): Promise<void> {
  const hour = new Date().getUTCHours()
  const minute = new Date().getUTCMinutes()
  const vetHour = (hour - 4 + 24) % 24
  
  const isBCVCron = [9, 11, 13, 17, 19].includes(vetHour)
  const isUSDTCron = vetHour % 4 === 0
  const isWidgetCacheCron = minute === 0 || minute === 30
  
  const tasks: Promise<void>[] = []
  
  if (isWidgetCacheCron) tasks.push(updateWidgetCache(env))
  if (isBCVCron) tasks.push(updateBCVRates(env))
  if (isUSDTCron) tasks.push(updateBinanceRates(env))
  
  if (tasks.length > 0) {
    ctx.waitUntil(Promise.all(tasks))
  }
}

async function updateBCVRates(env: Env['Bindings']): Promise<void> {
  try {
    console.log('Updating BCV rates...')
    
    const scraper = new BCVScraper()
    const storage = new RateStorageService(env)
    const notifier = new NotificationService(env)
    
    const rates = await scraper.scrape(true) // force refresh
    console.log(`BCV scraped - USD: ${rates.USD}, EUR: ${rates.EUR}`)
    
    if (!rates.USD || rates.USD === 0) {
      console.error('Invalid USD rate, skipping storage')
      return
    }
    
    const usdChanged = await storage.hasRateChanged('USD', rates.USD)
    const eurChanged = await storage.hasRateChanged('EUR', rates.EUR)
    
    if (usdChanged) {
      await storage.storeRate({
        source: 'bcv',
        currency: 'USD',
        rateType: 'official',
        avgRate: rates.USD,
        rawData: { scraped_at: new Date().toISOString() }
      })
      console.log(`USD rate stored: ${rates.USD}`)
    }
    
    if (eurChanged) {
      await storage.storeRate({
        source: 'bcv',
        currency: 'EUR',
        rateType: 'official',
        avgRate: rates.EUR,
        rawData: { scraped_at: new Date().toISOString() }
      })
      console.log(`EUR rate stored: ${rates.EUR}`)
    }
    
    if (usdChanged || eurChanged) {
      const rates = await storage.getCurrentRates()
      const currentRates: CurrentRates = {
        USD: rates['USD'] || 0,
        EUR: rates['EUR'] || 0,
        USDT: rates['USDT'] || 0
      }
      const { shouldSend, changes } = await notifier.shouldNotify(currentRates)
      
      if (shouldSend) {
        await notifier.sendNotification(currentRates, changes)
        console.log('Notification sent for BCV rate changes')
      }
    }
    
  } catch (error) {
    console.error('Failed to update BCV rates:', error)
  }
}

async function updateBinanceRates(env: Env['Bindings']): Promise<void> {
  try {
    console.log('Updating Binance P2P rates...')
    
    const storage = new RateStorageService(env)
    const notifier = new NotificationService(env)
    
    const rate = await binanceP2PService.getUSDTVES()
    
    if (!rate || !rate.medianPrice) {
      console.error('Failed to fetch Binance P2P rate')
      return
    }
    
    const changed = await storage.hasRateChanged('USDT', rate.medianPrice)
    
    if (changed) {
      await storage.storeRate({
        source: 'binance',
        currency: 'USDT',
        rateType: 'p2p',
        avgRate: rate.medianPrice,
        buyRate: rate.averagePrice || undefined,
        rawData: { prices: rate.prices, trade_type: rate.tradeType }
      })
      console.log(`USDT rate stored: ${rate.medianPrice}`)
      
      const rates = await storage.getCurrentRates()
      const currentRates: CurrentRates = {
        USD: rates['USD'] || 0,
        EUR: rates['EUR'] || 0,
        USDT: rates['USDT'] || 0
      }
      const { shouldSend, changes } = await notifier.shouldNotify(currentRates)
      
      if (shouldSend) {
        await notifier.sendNotification(currentRates, changes)
      }
    }
    
  } catch (error) {
    console.error('Failed to update Binance rates:', error)
  }
}

async function updateWidgetCache(env: Env['Bindings']): Promise<void> {
  try {
    console.log('Updating widget cache...')
    
    const storage = new RateStorageService(env)
    const widgetCache = new WidgetCacheService(env)
    
    const rates = await storage.getCurrentRates()
    
    const widgetData = {
      usd: { currency: 'USD', value: rates['USD'] || 0, updatedAt: new Date().toISOString() },
      eur: { currency: 'EUR', value: rates['EUR'] || 0, updatedAt: new Date().toISOString() },
      usdt: { currency: 'USDT', value: rates['USDT'] || 0, updatedAt: new Date().toISOString() },
      cachedAt: new Date().toISOString()
    }
    
    await widgetCache.updateCachedRates(widgetData)
    console.log('Widget cache updated')
    
  } catch (error) {
    console.error('Failed to update widget cache:', error)
  }
}

// Manual trigger endpoints
export const cronRouter = new Hono<Env>()
cronRouter.use('/trigger/*', requireApiKey)

cronRouter.post('/trigger/bcv', async (c) => {
  await updateBCVRates(c.env)
  return c.json({ message: 'BCV update triggered', timestamp: new Date().toISOString() })
})

cronRouter.post('/trigger/binance', async (c) => {
  await updateBinanceRates(c.env)
  return c.json({ message: 'Binance update triggered', timestamp: new Date().toISOString() })
})

cronRouter.post('/trigger/all', async (c) => {
  await Promise.all([updateBCVRates(c.env), updateBinanceRates(c.env)])
  return c.json({ message: 'All updates triggered', timestamp: new Date().toISOString() })
})

cronRouter.post('/trigger/widget-cache', async (c) => {
  await updateWidgetCache(c.env)
  return c.json({ message: 'Widget cache update triggered', timestamp: new Date().toISOString() })
})
