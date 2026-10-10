import pg from 'pg';import {paperTick} from './paper.js';import {EXPERIMENTS,runExperiments} from './experiments.js';import type {Candle} from './candles.js';
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
 async initExperiments(){
  await this.pool.query('CREATE TABLE IF NOT EXISTS paper_variants(id INTEGER PRIMARY KEY,balance NUMERIC NOT NULL,last_at TIMESTAMPTZ,position JSONB,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  await this.pool.query('ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS account_id INTEGER NOT NULL DEFAULT 1');
  await this.pool.query('CREATE INDEX IF NOT EXISTS paper_trades_by_account ON paper_trades(account_id,id DESC)');
  await this.pool.query(`CREATE TABLE IF NOT EXISTS paper_decisions(
   id BIGSERIAL PRIMARY KEY, account_id INTEGER NOT NULL, at TIMESTAMPTZ NOT NULL,
   symbol TEXT, event TEXT NOT NULL, reason TEXT NOT NULL, details JSONB,
   recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await this.pool.query('CREATE INDEX IF NOT EXISTS paper_decisions_account_at ON paper_decisions(account_id,at DESC)');
  await this.pool.query(`CREATE TABLE IF NOT EXISTS paper_equity_snapshots(
   account_id INTEGER NOT NULL, at TIMESTAMPTZ NOT NULL,
   balance NUMERIC NOT NULL, equity NUMERIC NOT NULL,
   unrealized_pnl NUMERIC NOT NULL, position JSONB,
   PRIMARY KEY(account_id,at))`);
  await this.pool.query('CREATE INDEX IF NOT EXISTS paper_equity_by_time ON paper_equity_snapshots(at DESC)');
  for(const cfg of EXPERIMENTS)await this.pool.query('INSERT INTO paper_variants(id,balance) VALUES($1,100) ON CONFLICT(id) DO NOTHING',[cfg.id]);
 }
 async runExperiments(){return runExperiments(this.pool)}
 async paperAccounts(){
  const a=await this.pool.query<{balance:string;position:unknown;last_at:string|null}>('SELECT balance::text,position,last_at::text FROM paper_account WHERE id=1');
  const b=await this.pool.query<{id:number;balance:string;position:unknown;last_at:string|null}>('SELECT id,balance::text,position,last_at::text FROM paper_variants ORDER BY id');
  return [{id:1,name:'Оригинальная',strategy:'momentum',maxUsd:100,maxMinutes:null,stop:.006,take:.012,initial:100,...a.rows[0]},...b.rows.map(x=>({initial:100,...EXPERIMENTS.find(z=>z.id===x.id),...x}))];
 }
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
 async candlesBetween(symbol:string,fromMs:number,toMs:number){
  const result=await this.pool.query('SELECT start_at::text,open::text,high::text,low::text,close::text,volume::text FROM market_candles WHERE symbol=$1 AND confirmed=true AND start_at>=to_timestamp($2::double precision/1000) AND start_at<=to_timestamp($3::double precision/1000) ORDER BY start_at LIMIT 1500',[symbol,fromMs,toMs]);
  return result.rows;
 }
 async paperTick(symbols:string[]){return paperTick(this.pool,symbols)}
 async paperStatus(id=1){
  const account=id===1?await this.pool.query('SELECT balance::text,last_at::text,position,updated_at::text FROM paper_account WHERE id=1'):await this.pool.query('SELECT balance::text,last_at::text,position,updated_at::text FROM paper_variants WHERE id=$1',[id]);
  const trades=await this.pool.query('SELECT symbol,side,quantity::text,entry_price::text,exit_price::text,entry_at::text,exit_at::text,pnl::text,reason FROM paper_trades WHERE account_id=$1 ORDER BY id DESC LIMIT 50',[id]);
  return {id,initial:100,...account.rows[0],trades:trades.rows};
 }
 async paperDiagnostics(id:number){
  if(!Number.isInteger(id)||id<1||id>11)throw Error('Invalid account');
  const [events,counts,equity,stats]=await Promise.all([
   this.pool.query('SELECT at::text,symbol,event,reason,details FROM paper_decisions WHERE account_id=$1 ORDER BY at DESC,id DESC LIMIT 150',[id]),
   this.pool.query('SELECT event,reason,COUNT(*)::int AS count FROM paper_decisions WHERE account_id=$1 GROUP BY event,reason ORDER BY count DESC',[id]),
   this.pool.query('SELECT at::text,balance::text,equity::text,unrealized_pnl::text FROM paper_equity_snapshots WHERE account_id=$1 ORDER BY at DESC LIMIT 1440',[id]),
   this.pool.query('SELECT COUNT(*)::int AS closed,COALESCE(SUM(pnl),0)::text AS realized_pnl,COUNT(*) FILTER(WHERE pnl>0)::int AS wins FROM paper_trades WHERE account_id=$1',[id])
  ]);
  return {account:id,stats:stats.rows[0],reasons:counts.rows,events:events.rows,equity:equity.rows.reverse()};
 }
 async recordOriginalSnapshot(){
  const q=await this.pool.query<{last_at:string|null;balance:string;position:{symbol:string;side:string;qty:number;entry:number}|null}>('SELECT last_at::text,balance::text,position FROM paper_account WHERE id=1');
  const a=q.rows[0];if(!a?.last_at)return;
  const position=a.position;
  const price=position?await this.pool.query<{close:string}>('SELECT close::text FROM market_candles WHERE symbol=$1 AND start_at <= $2 AND confirmed=true ORDER BY start_at DESC LIMIT 1',[position.symbol,a.last_at]):null;
  const unrealized=position&&price?.rows[0]?((Number(price.rows[0].close)-position.entry)*position.qty*(position.side==='LONG'?1:-1)-Number(price.rows[0].close)*position.qty*.0006):0;
  await this.pool.query('INSERT INTO paper_equity_snapshots(account_id,at,balance,equity,unrealized_pnl,position) VALUES(1,$1,$2,$3,$4,$5) ON CONFLICT(account_id,at) DO NOTHING',[a.last_at,a.balance,Number(a.balance)+unrealized,unrealized,JSON.stringify(position)]);
 }
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