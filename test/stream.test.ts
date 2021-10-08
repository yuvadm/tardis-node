import {
  compute,
  computeBookSnapshots,
  computeTradeBars,
  Exchange,
  EXCHANGES,
  getExchangeDetails,
  normalizeBookChanges,
  normalizeDerivativeTickers,
  normalizeLiquidations,
  normalizeTrades,
  streamNormalized
} from '../dist'

const exchangesWithDerivativeInfo: Exchange[] = [
  'bitmex',
  'binance-futures',
  'bitfinex-derivatives',
  'cryptofacilities',
  'deribit',
  'okex-futures',
  'okex-swap',
  'bybit',
  'phemex',
  'ftx',
  'delta',
  'binance-delivery',
  'huobi-dm',
  'huobi-dm-swap',
  'gate-io-futures',
  'coinflex',
  'huobi-dm-linear-swap'
]

const exchangesWithLiquidationsSupport: Exchange[] = [
  'ftx',
  'bitmex',
  'deribit',
  'binance-futures',
  'binance-delivery',
  'bitfinex-derivatives',
  'cryptofacilities',
  'huobi-dm',
  'huobi-dm-swap'
]

describe('exchange-details', () => {
  test('provides exchange info', async () => {
    const exchange = 'binance'
    const exchangeDetails = await getExchangeDetails(exchange)

    expect(exchangeDetails.availableChannels).toEqual([
      'trade',
      'aggTrade',
      'ticker',
      'depth',
      'depthSnapshot',
      'bookTicker',
      'recentTrades',
      'borrowInterest'
    ])
  })
})

describe('stream', () => {
  test(
    'streams normalized real-time messages for each supported exchange',
    async () => {
      await Promise.all(
        EXCHANGES.map(async (exchange) => {
          if (
            exchange === 'binance-dex' ||
            exchange === 'binance-jersey' ||
            exchange === 'huobi-dm-linear-swap' ||
            exchange === 'okex-futures' ||
            exchange === 'okex-options' ||
            exchange === 'huobi-dm-options' ||
            exchange === 'star-atlas'
          ) {
            return
          }

          const exchangeDetails = await getExchangeDetails(exchange)
          const normalizers: any[] = [normalizeTrades, normalizeBookChanges]

          if (exchangesWithDerivativeInfo.includes(exchange)) {
            normalizers.push(normalizeDerivativeTickers)
          }

          if (exchangesWithLiquidationsSupport.includes(exchange)) {
            normalizers.push(normalizeLiquidations)
          }

          var symbols = exchangeDetails.availableSymbols
            .filter((s) => s.availableTo === undefined || new Date(s.availableTo).valueOf() > new Date().valueOf())
            .slice(0, 10)
            .map((s) => s.id)

          const messages = streamNormalized(
            {
              exchange,
              symbols,
              withDisconnectMessages: true,
              timeoutIntervalMS: 30 * 1000,
              onError: (err) => {
                console.log('Error', err, exchange)
              }
            },
            ...normalizers
          )

          const messagesWithComputables = compute(
            messages,
            computeTradeBars({ interval: 10, kind: 'time' }),
            computeBookSnapshots({ interval: 0, depth: 3 })
          )

          let count = 0
          let snapshots = 0

          for await (const msg of messagesWithComputables) {
            // reset counters if we've received disconnect
            if (msg.type === 'disconnect') {
              count = 0
              snapshots = 0
            }

            if (msg.type === 'book_change' && (msg as any).isSnapshot) {
              snapshots++
            }

            if (snapshots >= symbols.length - 1) {
              count++
              if (count >= 100) {
                break
              }
            }
          }
        })
      )
    },
    1000 * 60 * 2
  )
})
