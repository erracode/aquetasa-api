import { BinanceP2PRequest, BinanceP2PResponse, BinanceP2PRate } from '../types/binanceP2P';

export class BinanceP2PService {
  private readonly baseUrl = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';

  async getPair(
    fiat: string = 'VES',
    asset: string = 'USDT',
    tradeType: 'BUY' | 'SELL' = 'BUY',
    rows: number = 20
  ): Promise<BinanceP2PRate | null> {
    try {
      if (rows > 20) {
        throw new Error('Rows must be less than or equal to 20');
      }

      const body: BinanceP2PRequest = {
        fiat,
        page: 1,
        rows,
        tradeType,
        asset,
      };

      console.log(`[BinanceP2P] Fetching ${asset}/${fiat}...`);
      
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: BinanceP2PResponse = await response.json();

      if (data.code !== '000000' || !data.data || data.data.length === 0) {
        console.error('[BinanceP2P] Invalid response:', data);
        return null;
      }

      const prices = this.collectPrices(data);
      const stats = this.calculateStats(prices);

      const result: BinanceP2PRate = {
        fiat,
        asset,
        tradeType,
        prices,
        averagePrice: stats.average,
        medianPrice: stats.median,
        timestamp: new Date().toISOString(),
      };

      console.log(`[BinanceP2P] Got ${prices.length} prices. Avg: ${stats.average}, Median: ${stats.median}`);
      
      return result;
    } catch (error) {
      console.error('[BinanceP2P] Error fetching pair:', error);
      return null;
    }
  }

  async getUSDTVES(): Promise<BinanceP2PRate | null> {
    return this.getPair('VES', 'USDT', 'BUY', 20);
  }

  private collectPrices(data: BinanceP2PResponse): number[] {
    return data.data.map((item) => parseFloat(item.adv.price));
  }

  private calculateStats(prices: number[]): { average: number | null; median: number | null } {
    if (prices.length === 0) {
      return { average: null, median: null };
    }

    // Calculate average
    const sum = prices.reduce((acc, price) => acc + price, 0);
    const average = sum / prices.length;

    // Calculate median
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

    return { average, median };
  }
}

export const binanceP2PService = new BinanceP2PService();
