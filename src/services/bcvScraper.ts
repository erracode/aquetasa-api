import { Env } from '../index'

export interface BCVRates {
  USD: number
  EUR: number
}

interface CachedRates {
  rates: BCVRates
  updatedAt: number
}

let memoryCache: CachedRates | null = null
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export class BCVScraper {
  private baseUrl = 'https://www.bcv.org.ve/'

  async scrape(forceRefresh: boolean = false): Promise<BCVRates> {
    // Check cache first
    if (!forceRefresh && memoryCache && Date.now() - memoryCache.updatedAt < CACHE_TTL_MS) {
      console.log('Returning cached BCV rates')
      return memoryCache.rates
    }

    try {
      // Try BCV website first
      const rates = await this.scrapeBCV()
      
      // Update cache
      memoryCache = {
        rates,
        updatedAt: Date.now()
      }
      
      return rates
    } catch (error) {
      console.error('BCV scraping error:', error)
      
      // Try fallback if available
      try {
        const fallbackRates = await fetchBCVFromDolarAPI()
        console.log('Using dolarapi fallback')
        return fallbackRates
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError)
        throw error
      }
    }
  }

  private async scrapeBCV(): Promise<BCVRates> {
    const response = await fetch(this.baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
      }
    })

    if (!response.ok) {
      throw new Error(`BCV request failed: ${response.status}`)
    }

    const html = await response.text()
    const rates = this.parseRates(html)
    
    if (!rates.USD || !rates.EUR) {
      throw new Error(`Failed to parse rates - USD: ${rates.USD}, EUR: ${rates.EUR}`)
    }

    return rates
  }

  private parseRates(html: string): BCVRates {
    const rates: Partial<BCVRates> = {}

    // Pattern: <div id="euro">...<span> EUR </span>...<strong> VALUE </strong>
    //         <div id="dolar">...<span> USD </span>...<strong> VALUE </strong>
    const euroMatch = html.match(/<div[^>]*id="euro"[^>]*>[\s\S]*?<span>\s*EUR\s*<\/span>[\s\S]*?<strong>\s*([\d.,]+)/i)
    const dolarMatch = html.match(/<div[^>]*id="dolar"[^>]*>[\s\S]*?<span>\s*USD\s*<\/span>[\s\S]*?<strong>\s*([\d.,]+)/i)

    if (euroMatch) {
      rates.EUR = this.parseValue(euroMatch[1])
    }
    if (dolarMatch) {
      rates.USD = this.parseValue(dolarMatch[1])
    }

    return rates as BCVRates
  }

  private cleanText(html: string): string {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&gt;/g, '>')
      .replace(/&lt;/g, '<')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  }

  private parseValue(value: string): number {
    if (!value) return 0
    
    // BCV format: "393,22160000" or "467,33207495" - comma as decimal separator
    const cleaned = value
      .replace(/\./g, '') // Remove thousand separators
      .replace(/,/g, '.') // Convert comma to decimal point
      .replace(/\s/g, '')
    
    const parsed = parseFloat(cleaned)
    
    if (isNaN(parsed) || parsed <= 0) {
      return 0
    }
    
    return parsed
  }

  getCachedRates(): BCVRates | null {
    return memoryCache?.rates || null
  }

  getCacheTimestamp(): number | null {
    return memoryCache?.updatedAt || null
  }

  clearCache(): void {
    memoryCache = null
  }
}

export async function fetchBCVFromDolarAPI(): Promise<BCVRates> {
  try {
    const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial')
    
    if (!response.ok) {
      throw new Error(`DolarAPI request failed: ${response.status}`)
    }

    const data = await response.json() as { promedio?: number; venta?: number; compra?: number }
    
    return {
      USD: data.promedio || data.venta || data.compra || 0,
      EUR: 0
    }
  } catch (error) {
    console.error('DolarAPI fallback error:', error)
    throw error
  }
}
