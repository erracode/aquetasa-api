export interface BinanceP2PRequest {
  fiat: string;
  page: number;
  rows: number;
  tradeType: 'BUY' | 'SELL';
  asset: string;
}

export interface BinanceP2PResponse {
  code: string;
  message: string | null;
  data: Array<{
    adv: {
      advNo: string;
      price: string;
      surplusAmount: string;
      maxSingleTransAmount: string;
      minSingleTransAmount: string;
      asset: string;
      fiatUnit: string;
      tradeType: string;
    };
    advertiser: {
      nickName: string;
    };
  }>;
  total: number;
  success: boolean;
}

export interface BinanceP2PRate {
  fiat: string;
  asset: string;
  tradeType: string;
  prices: number[];
  averagePrice: number | null;
  medianPrice: number | null;
  timestamp: string;
}
