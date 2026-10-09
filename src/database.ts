import pg from 'pg';import type {Candle} from './candles.js';
export class Database{
 private pool:pg.Pool;
 constructor(url:string){this.pool=new pg.Pool({connectionString:url,max:5});}
 async init(){await this.pool.query(`CREATE TABLE IF NOT EXISTS market_candles(
 symbol TEXT NOT NULL,start_at TIMESTAMPTZ NOT NULL,open NUMERIC NOT NULL,high NUMERIC NOT NULL,
 low NUMERIC NOT NULL,close NUMERIC NOT NULL,volume NUMERIC NOT NULL,turnover NUMERIC NOT NULL,
 confirmed BOOLEAN NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(symbol,start_at))`)}
 async upsert(c:Candle){await this.pool.query(`INSERT INTO market_candles(symbol,start_at,open,high,low,close,volume,turnover,confirmed)
 VALUES($1,to_timestamp($2::double precision/1000),$3,$4,$5,$6,$7,$8,$9)
 ON CONFLICT(symbol,start_at) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,
 volume=EXCLUDED.volume,turnover=EXCLUDED.turnover,confirmed=EXCLUDED.confirmed,updated_at=NOW()
 WHERE market_candles.confirmed=false OR EXCLUDED.confirmed=true`,
 [c.symbol,c.startMs,c.open,c.high,c.low,c.close,c.volume,c.turnover,c.confirmed])}
 async ping(){await this.pool.query('SELECT 1')}
 async close(){await this.pool.end()}
}