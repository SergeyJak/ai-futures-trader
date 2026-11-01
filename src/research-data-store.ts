export type ResearchPool={query(text:string,values?:unknown[]):Promise<{rows:Record<string,unknown>[];rowCount?:number|null}>};
export type MarketSample={symbol:string;bucketAt:number;observedAt:number;exchangeAt:number;updateId:number;sequence:number;bid:number;ask:number;bidQuantity:number;askQuantity:number;bidDepthNotional:number;askDepthNotional:number;bidLevels:number;askLevels:number;markPrice:number|null;indexPrice:number|null;openInterest:number|null;indicativeFundingRate:number|null;nextFundingAt:number|null;tickerObservedAt:number|null;connectionId:string};
export type TradeBucket={symbol:string;bucketAt:number;buys:number;sells:number;buyQuantity:number;sellQuantity:number;buyNotional:number;sellNotional:number;firstTradeAt:number;lastTradeAt:number;streamContinuous:boolean};
export type FundingSettlement={symbol:string;fundingAt:number;rate:string;fetchedAt:number};
const iso=(time:number|null)=>time===null?null:new Date(time).toISOString();
const DAY=86400000;
function range(symbol:string,from:number,to:number,maximum:number){
 if(!/^[A-Z0-9]{2,30}$/.test(symbol)||![from,to].every(Number.isFinite)||to<from||to-from>maximum)throw new Error('Invalid symbol or history range');
}
async function chunks<T>(rows:T[],write:(rows:T[])=>Promise<unknown>){
 if(rows.length>5000)throw new Error('Research persistence batch exceeds 5000 rows');
 for(let i=0;i<rows.length;i+=250)await write(rows.slice(i,i+250));
}

export class ResearchDataStore{
 constructor(private pool:ResearchPool){}
 async init(){
  await this.pool.query(`CREATE TABLE IF NOT EXISTS research_market_samples(
   symbol TEXT NOT NULL,bucket_at TIMESTAMPTZ NOT NULL,observed_at TIMESTAMPTZ NOT NULL,exchange_at TIMESTAMPTZ NOT NULL,
   update_id BIGINT NOT NULL,sequence BIGINT NOT NULL,bid DOUBLE PRECISION NOT NULL,ask DOUBLE PRECISION NOT NULL,
   bid_quantity DOUBLE PRECISION NOT NULL,ask_quantity DOUBLE PRECISION NOT NULL,bid_depth_notional DOUBLE PRECISION NOT NULL,ask_depth_notional DOUBLE PRECISION NOT NULL,
   bid_levels INTEGER NOT NULL,ask_levels INTEGER NOT NULL,mark_price DOUBLE PRECISION,index_price DOUBLE PRECISION,open_interest DOUBLE PRECISION,
   indicative_funding_rate DOUBLE PRECISION,next_funding_at TIMESTAMPTZ,ticker_observed_at TIMESTAMPTZ,connection_id TEXT NOT NULL,
   PRIMARY KEY(symbol,bucket_at),CHECK(bid>0 AND ask>bid),CHECK(bid_quantity>0 AND ask_quantity>0))`);
  await this.pool.query(`CREATE TABLE IF NOT EXISTS research_trade_buckets(
   symbol TEXT NOT NULL,bucket_at TIMESTAMPTZ NOT NULL,buys INTEGER NOT NULL,sells INTEGER NOT NULL,
   buy_quantity DOUBLE PRECISION NOT NULL,sell_quantity DOUBLE PRECISION NOT NULL,buy_notional DOUBLE PRECISION NOT NULL,sell_notional DOUBLE PRECISION NOT NULL,
   first_trade_at TIMESTAMPTZ NOT NULL,last_trade_at TIMESTAMPTZ NOT NULL,stream_continuous BOOLEAN NOT NULL,
   PRIMARY KEY(symbol,bucket_at),CHECK(buys>=0 AND sells>=0),CHECK(buy_quantity>=0 AND sell_quantity>=0))`);
  await this.pool.query(`CREATE TABLE IF NOT EXISTS research_funding_rates(
   symbol TEXT NOT NULL,funding_at TIMESTAMPTZ NOT NULL,rate NUMERIC NOT NULL,fetched_at TIMESTAMPTZ NOT NULL,
   source TEXT NOT NULL DEFAULT 'bybit-v5-funding-history',PRIMARY KEY(symbol,funding_at))`);
  await this.pool.query(`CREATE TABLE IF NOT EXISTS research_collector_status(name TEXT PRIMARY KEY,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),details JSONB NOT NULL)`);
  for(const [table,column] of [['research_market_samples','bucket_at'],['research_trade_buckets','bucket_at'],['research_funding_rates','funding_at']])await this.pool.query(`CREATE INDEX IF NOT EXISTS ${table}_by_time ON ${table}(${column})`);
 }
 async writeSamples(rows:MarketSample[]){
  await chunks(rows,async part=>{
   const records=part.map(r=>({symbol:r.symbol,bucket_at:iso(r.bucketAt),observed_at:iso(r.observedAt),exchange_at:iso(r.exchangeAt),update_id:r.updateId,sequence:r.sequence,bid:r.bid,ask:r.ask,bid_quantity:r.bidQuantity,ask_quantity:r.askQuantity,bid_depth_notional:r.bidDepthNotional,ask_depth_notional:r.askDepthNotional,bid_levels:r.bidLevels,ask_levels:r.askLevels,mark_price:r.markPrice,index_price:r.indexPrice,open_interest:r.openInterest,indicative_funding_rate:r.indicativeFundingRate,next_funding_at:iso(r.nextFundingAt),ticker_observed_at:iso(r.tickerObservedAt),connection_id:r.connectionId}));
   await this.pool.query(`INSERT INTO research_market_samples
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(symbol TEXT,bucket_at TIMESTAMPTZ,observed_at TIMESTAMPTZ,exchange_at TIMESTAMPTZ,update_id BIGINT,sequence BIGINT,
    bid DOUBLE PRECISION,ask DOUBLE PRECISION,bid_quantity DOUBLE PRECISION,ask_quantity DOUBLE PRECISION,bid_depth_notional DOUBLE PRECISION,ask_depth_notional DOUBLE PRECISION,
    bid_levels INTEGER,ask_levels INTEGER,mark_price DOUBLE PRECISION,index_price DOUBLE PRECISION,open_interest DOUBLE PRECISION,indicative_funding_rate DOUBLE PRECISION,
    next_funding_at TIMESTAMPTZ,ticker_observed_at TIMESTAMPTZ,connection_id TEXT) ON CONFLICT(symbol,bucket_at) DO NOTHING`,[JSON.stringify(records)]);
  });
 }
 async writeTradeBuckets(rows:TradeBucket[]){
  await chunks(rows,async part=>{
   const records=part.map(r=>({symbol:r.symbol,bucket_at:iso(r.bucketAt),buys:r.buys,sells:r.sells,buy_quantity:r.buyQuantity,sell_quantity:r.sellQuantity,buy_notional:r.buyNotional,sell_notional:r.sellNotional,first_trade_at:iso(r.firstTradeAt),last_trade_at:iso(r.lastTradeAt),stream_continuous:r.streamContinuous}));
   await this.pool.query(`INSERT INTO research_trade_buckets SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(
    symbol TEXT,bucket_at TIMESTAMPTZ,buys INTEGER,sells INTEGER,buy_quantity DOUBLE PRECISION,sell_quantity DOUBLE PRECISION,
    buy_notional DOUBLE PRECISION,sell_notional DOUBLE PRECISION,first_trade_at TIMESTAMPTZ,last_trade_at TIMESTAMPTZ,stream_continuous BOOLEAN)
    ON CONFLICT(symbol,bucket_at) DO NOTHING`,[JSON.stringify(records)]);
  });
 }
 async writeFunding(rows:FundingSettlement[]){
  await chunks(rows,async part=>{
   const records=part.map(r=>({symbol:r.symbol,funding_at:iso(r.fundingAt),rate:r.rate,fetched_at:iso(r.fetchedAt)}));
   await this.pool.query(`INSERT INTO research_funding_rates(symbol,funding_at,rate,fetched_at)
    SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(symbol TEXT,funding_at TIMESTAMPTZ,rate NUMERIC,fetched_at TIMESTAMPTZ)
    ON CONFLICT(symbol,funding_at) DO UPDATE SET rate=EXCLUDED.rate,fetched_at=EXCLUDED.fetched_at
    WHERE research_funding_rates.rate IS DISTINCT FROM EXCLUDED.rate`,[JSON.stringify(records)]);
  });
 }
 async saveStatus(name:string,status:unknown){await this.pool.query(`INSERT INTO research_collector_status(name,details) VALUES($1,$2::jsonb)
  ON CONFLICT(name) DO UPDATE SET details=EXCLUDED.details,updated_at=NOW()`,[name,JSON.stringify(status)]);}
 async prune(now:number,retentionDays:number){
  if(!Number.isFinite(now)||!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>30)throw new Error('Invalid retention period');
  for(const [table,column,days] of [['research_market_samples','bucket_at',retentionDays],['research_trade_buckets','bucket_at',retentionDays],['research_funding_rates','funding_at',730]] as const){
   await this.pool.query(`DELETE FROM ${table} WHERE (symbol,${column}) IN (
    SELECT symbol,${column} FROM ${table} WHERE ${column}<to_timestamp($1/1000.0) ORDER BY ${column} LIMIT 5000)`,[now-days*DAY]);
  }
 }
 async report(symbols:string[]){
  const [samples,trades,funding,status]=await Promise.all([
   this.pool.query(`SELECT symbol,COUNT(*) AS rows,MIN(bucket_at) AS first_at,MAX(bucket_at) AS last_at,MAX(observed_at) AS last_observed_at,
    COUNT(mark_price) AS mark_price_rows,AVG((ask-bid)/((ask+bid)/2)*10000) AS mean_sampled_spread_bps
    FROM research_market_samples WHERE symbol=ANY($1::text[]) GROUP BY symbol ORDER BY symbol`,[symbols]),
   this.pool.query(`SELECT symbol,COUNT(*) AS rows,MIN(bucket_at) AS first_at,MAX(bucket_at) AS last_at,
    COUNT(*) FILTER(WHERE stream_continuous) AS continuous_stream_buckets FROM research_trade_buckets WHERE symbol=ANY($1::text[]) GROUP BY symbol ORDER BY symbol`,[symbols]),
   this.pool.query(`SELECT symbol,COUNT(*) AS rows,MIN(funding_at) AS first_at,MAX(funding_at) AS last_at FROM research_funding_rates WHERE symbol=ANY($1::text[]) GROUP BY symbol ORDER BY symbol`,[symbols]),
   this.pool.query('SELECT name,updated_at,details FROM research_collector_status ORDER BY name')
  ]);
  return {samples:samples.rows,trades:trades.rows,funding:funding.rows,status:status.rows,fundingCashFlowVerified:false,feeRatesVerified:false,
   limitations:['Missing rows or stale fields are missing evidence, never zero cost.','Quotes are 10-second samples of up to 50 book levels, not tick-perfect fills or queue position.','Continuous connection does not prove complete exchange trade delivery.','Settlement rates do not independently verify funding cash flows or account fee/VIP rates.']};
 }
 async samples(symbol:string,from:number,to:number){range(symbol,from,to,DAY);return (await this.pool.query(`SELECT *,((ask-bid)/((ask+bid)/2)*10000) AS spread_bps FROM research_market_samples
  WHERE symbol=$1 AND bucket_at>=to_timestamp($2/1000.0) AND bucket_at<=to_timestamp($3/1000.0) ORDER BY bucket_at DESC LIMIT 1500`,[symbol,from,to])).rows;}
 async funding(symbol:string,from:number,to:number){range(symbol,from,to,31*DAY);return (await this.pool.query(`SELECT symbol,funding_at,rate,fetched_at,source FROM research_funding_rates
  WHERE symbol=$1 AND funding_at>=to_timestamp($2/1000.0) AND funding_at<=to_timestamp($3/1000.0) ORDER BY funding_at DESC LIMIT 1500`,[symbol,from,to])).rows;}
 async tradeHistory(symbol:string,from:number,to:number){range(symbol,from,to,DAY);return (await this.pool.query(`SELECT * FROM research_trade_buckets
  WHERE symbol=$1 AND bucket_at>=to_timestamp($2/1000.0) AND bucket_at<=to_timestamp($3/1000.0) ORDER BY bucket_at DESC LIMIT 1500`,[symbol,from,to])).rows;}
}
