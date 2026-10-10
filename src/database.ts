import pg from 'pg';import {paperTick} from './paper.js';import type {Candle} from './candles.js';
export class Database{
 private pool:pg.Pool;
 constructor(url:string){this.pool=new pg.Pool({connectionString:url,max:5});}
 async init(){await this.pool.query(`CREATE TABLE IF NOT EXISTS market_candles(
 symbol TEXT NOT NULL,start_at TIMESTAMPTZ NOT NULL,open NUMERIC NOT NULL,high NUMERIC NOT NULL,
 low NUMERIC NOT NULL,close NUMERIC NOT NULL,volume NUMERIC NOT NULL,turnover NUMERIC NOT NULL,
 confirmed BOOLEAN NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(symbol,start_at))`);
 await this.pool.query(`CREATE TABLE IF NOT EXISTS paper_account(id INTEGER PRIMARY KEY CHECK(id=1),balance NUMERIC NOT NULL,last_at TIMESTAMPTZ,position JSONB,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await this.pool.query(`INSERT INTO paper_account(id,balance) VALUES(1,100) ON CONFLICT(id) DO NOTHING`);
 await this.pool.query(`CREATE TABLE IF NOT EXISTS paper_trades(id BIGSERIAL PRIMARY KEY,symbol TEXT NOT NULL,side TEXT NOT NULL,quantity NUMERIC NOT NULL,entry_price NUMERIC NOT NULL,exit_price NUMERIC NOT NULL,entry_at TIMESTAMPTZ NOT NULL,exit_at TIMESTAMPTZ NOT NULL,pnl NUMERIC NOT NULL,reason TEXT NOT NULL)`)}
 async upsert(c:Candle){await this.pool.query(`INSERT INTO market_candles(symbol,start_at,open,high,low,close,volume,turnover,confirmed)
 VALUES($1,to_timestamp($2::double precision/1000),$3,$4,$5,$6,$7,$8,$9)
 ON CONFLICT(symbol,start_at) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,
 volume=EXCLUDED.volume,turnover=EXCLUDED.turnover,confirmed=EXCLUDED.confirmed,updated_at=NOW()
 WHERE market_candles.confirmed=false OR EXCLUDED.confirmed=true`,
 [c.symbol,c.startMs,c.open,c.high,c.low,c.close,c.volume,c.turnover,c.confirmed])}
 async existingMinutes(symbol:string,fromMs:number,toMs:number):Promise<number[]>{
  const rows=await this.pool.query<{ms:string}>(`SELECT (EXTRACT(EPOCH FROM start_at)*1000)::bigint::text AS ms FROM market_candles WHERE symbol=$1 AND start_at>=to_timestamp($2::double precision/1000) AND start_at<=to_timestamp($3::double precision/1000) AND confirmed=true ORDER BY start_at`,[symbol,fromMs,toMs]);
  return rows.rows.map(r=>Number(r.ms));
 }
 async recentCandles(symbol:string,limit:number){
  const result=await this.pool.query<{start_at:string;open:string;high:string;low:string;close:string;volume:string}>(`SELECT start_at::text,open::text,high::text,low::text,close::text,volume::text FROM market_candles WHERE symbol=$1 AND confirmed=true ORDER BY start_at DESC LIMIT $2`,[symbol,limit]);
  return result.rows.reverse();
 }
 async paperTick(symbols:string[]){return paperTick(this.pool,symbols)}
 async paperStatus(){const [account,trades]=await Promise.all([this.pool.query('SELECT balance::text,last_at::text,position,updated_at::text FROM paper_account WHERE id=1'),this.pool.query('SELECT symbol,side,quantity::text,entry_price::text,exit_price::text,entry_at::text,exit_at::text,pnl::text,reason FROM paper_trades ORDER BY id DESC LIMIT 50')]);return {initial:100,...account.rows[0],trades:trades.rows}}
 async ping(){await this.pool.query('SELECT 1')}

 async candleStats(){
  const result=await this.pool.query<{
   symbol:string; rows:string; confirmed:string; first_at:string|null; last_at:string|null; missing_minutes:string;
  }>(`WITH ordered AS (
    SELECT symbol, start_at, confirmed,
      LAG(start_at) OVER (PARTITION BY symbol ORDER BY start_at) AS previous_at
    FROM market_candles
  ) SELECT symbol, COUNT(*)::text AS rows,
    COUNT(*) FILTER (WHERE confirmed)::text AS confirmed,
    MIN(start_at)::text AS first_at, MAX(start_at)::text AS last_at,
    COALESCE(SUM(GREATEST(0, (EXTRACT(EPOCH FROM (start_at-previous_at))/60)::bigint-1)),0)::text AS missing_minutes
    FROM ordered GROUP BY symbol ORDER BY symbol`);
  return result.rows;
 }
 async storageStats(){
  const result=await this.pool.query<{database_bytes:string;candles_total_bytes:string;candles_heap_bytes:string;candles_indexes_bytes:string}>(`SELECT
    pg_database_size(current_database())::text AS database_bytes,
    pg_total_relation_size('market_candles')::text AS candles_total_bytes,
    pg_relation_size('market_candles')::text AS candles_heap_bytes,
    pg_indexes_size('market_candles')::text AS candles_indexes_bytes`);
  return result.rows[0];
 }
 async close(){await this.pool.end()}
}