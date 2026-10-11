import type pg from 'pg';
type Bar={start_at:string;open:string;high:string;low:string;close:string};
type Side='LONG'|'SHORT';type Mode='SL_TP'|'TIME_15'|'TIME_30'|'TIME_60'|'TIME_120'|'TRAILING';
type Position={entry:number;entryAt:string;qty:number;stop:number;take:number;entryFee:number;mfe:number;mae:number};
type State={id:string;symbol:string;side:Side;dip:number;mode:Mode;balance:number;lastAt:string|null;position:Position|null};
const FEE=.0006,SLIP=.0002;
const modes:Mode[]=['SL_TP','TIME_15','TIME_30','TIME_60','TIME_120','TRAILING'];
export const V4_CONFIGS=[] as Pick<State,'id'|'symbol'|'side'|'dip'|'mode'>[];
for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT'])for(const dip of [.002,.004])for(const side of ['LONG','SHORT'] as const)for(const mode of modes)V4_CONFIGS.push({id:[symbol,side,'d'+dip,mode].join('_'),symbol,side,dip,mode});
export function v4Advance(state:State,history:Bar[]){
 const bars=history.map(x=>({at:x.start_at,ms:Date.parse(x.start_at),o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close)}));
 const now=bars.at(-1);if(!now||!Number.isFinite(now.ms))return {state,trade:null,event:'INVALID'};
 if(state.lastAt&&Date.parse(state.lastAt)>=now.ms)return {state,trade:null,event:'SEEN'};
 const s={...state,position:state.position?{...state.position}:null};
 if(state.lastAt&&now.ms-Date.parse(state.lastAt)>60000){s.lastAt=now.at;return {state:s,trade:null,event:'GAP'}}
 if(bars.length<31||bars.slice(-31).some((b,i,a)=>i>0&&b.ms-a[i-1].ms!==60000)){s.lastAt=now.at;return {state:s,trade:null,event:'INSUFFICIENT'}}
 const direction=s.side==='LONG'?1:-1;let event='WAIT';let trade:null|Record<string,unknown>=null;
 if(s.position){
  const p=s.position,elapsed=(now.ms-Date.parse(p.entryAt))/60000;
  const limit=s.mode==='TIME_15'?15:s.mode==='TIME_30'?30:s.mode==='TIME_60'?60:s.mode==='TIME_120'?120:240;
  const stop=direction===1?now.l<=p.stop:now.h>=p.stop;
  const take=direction===1?now.h>=p.take:now.l<=p.take;
  let raw:number|null=null;let reason='';
  if(stop){raw=direction===1?Math.min(now.o,p.stop):Math.max(now.o,p.stop);reason='STOP'}
  else if(elapsed>=limit){raw=now.o;reason=limit===240?'HARD_CAP':'TIME'}
  else if(s.mode!=='TRAILING'&&take){raw=direction===1?Math.max(now.o,p.take):Math.min(now.o,p.take);reason='TAKE'}
  // Mark intrabar extremes, conservatively bounded by bar OHLC.
  p.mfe=Math.max(p.mfe,(direction===1?now.h/p.entry-1:1-now.l/p.entry)*100);
  p.mae=Math.max(p.mae,(direction===1?1-now.l/p.entry:now.h/p.entry-1)*100);
  if(raw!==null){
   const exit=raw*(1-direction*SLIP),feeExit=exit*p.qty*FEE;
   const pnl=(exit-p.entry)*p.qty*direction-p.entryFee-feeExit;
   s.balance+=(exit-p.entry)*p.qty*direction-feeExit;
   trade={configId:s.id,symbol:s.symbol,side:s.side,mode:s.mode,entryAt:p.entryAt,exitAt:now.at,entry:p.entry,exit,qty:p.qty,pnl,feeEntry:p.entryFee,feeExit,mfe:p.mfe,mae:p.mae,reason};
   s.position=null;event='EXIT';
  }else if(s.mode==='TRAILING'){
   // Update trailing stop only after evaluating current bar, never same-bar lookahead.
   const candidate=direction===1?now.h*(1-.003):now.l*(1+.003);
   p.stop=direction===1?Math.max(p.stop,candidate):Math.min(p.stop,candidate);
  }
 }else{
  const prev=bars.slice(-31,-1),peak=Math.max(...prev.map(b=>b.h)),trigger=peak*(1-s.dip);
  if(prev.at(-1)!.c>trigger&&now.o>=trigger&&now.l<=trigger){
   const entry=trigger*(1+direction*SLIP),qty=25/entry,entryFee=entry*qty*FEE;
   const p:Position={entry,entryAt:now.at,qty,stop:entry*(1-direction*.004),take:entry*(1+direction*.008),entryFee,mfe:0,mae:0};
   s.balance-=entryFee;
   const instantStop=direction===1?now.l<=p.stop:now.h>=p.stop;
   if(instantStop){
    const exit=p.stop*(1-direction*SLIP),feeExit=exit*qty*FEE;
    const pnl=(exit-entry)*qty*direction-entryFee-feeExit;
    s.balance+=(exit-entry)*qty*direction-feeExit;
    trade={configId:s.id,symbol:s.symbol,side:s.side,mode:s.mode,entryAt:now.at,exitAt:now.at,entry,exit,qty,pnl,feeEntry:entryFee,feeExit,mfe:0,mae:0,reason:'ENTRY_STOP_BOUND'};
    event='EXIT';
   }else{s.position=p;event='ENTRY'}
  }
 }
 s.lastAt=now.at;return {state:s,trade,event};
}
export async function initV4(pool:pg.Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS v4_accounts(id TEXT PRIMARY KEY,symbol TEXT NOT NULL,side TEXT NOT NULL,dip NUMERIC NOT NULL,mode TEXT NOT NULL,balance NUMERIC NOT NULL DEFAULT 100,last_at TIMESTAMPTZ,position JSONB)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS v4_trades(id BIGSERIAL PRIMARY KEY,config_id TEXT NOT NULL REFERENCES v4_accounts(id),symbol TEXT NOT NULL,side TEXT NOT NULL,mode TEXT NOT NULL,entry_at TIMESTAMPTZ NOT NULL,exit_at TIMESTAMPTZ NOT NULL,entry_price NUMERIC NOT NULL,exit_price NUMERIC NOT NULL,quantity NUMERIC NOT NULL,pnl NUMERIC NOT NULL,fee_entry NUMERIC NOT NULL,fee_exit NUMERIC NOT NULL,mfe NUMERIC NOT NULL,mae NUMERIC NOT NULL,reason TEXT NOT NULL)`);
 await pool.query('CREATE INDEX IF NOT EXISTS v4_trades_account_time ON v4_trades(config_id,exit_at DESC)');
 for(const c of V4_CONFIGS)await pool.query('INSERT INTO v4_accounts(id,symbol,side,dip,mode,balance) VALUES($1,$2,$3,$4,$5,100) ON CONFLICT(id) DO NOTHING',[c.id,c.symbol,c.side,c.dip,c.mode]);
}
export async function tickV4(pool:pg.Pool){
 const client=await pool.connect();try{
  await client.query('BEGIN');const accounts=(await client.query('SELECT * FROM v4_accounts ORDER BY id FOR UPDATE')).rows;
  let changed=0,opened=0,closed=0,gaps=0;
  for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT']){
   const bars=(await client.query('SELECT start_at::text,open::text,high::text,low::text,close::text FROM market_candles WHERE symbol=$1 AND confirmed=true ORDER BY start_at DESC LIMIT 34',[symbol])).rows.reverse() as Bar[];
   for(const a of accounts.filter(a=>a.symbol===symbol)){
    const state:State={id:a.id,symbol:a.symbol,side:a.side,dip:Number(a.dip),mode:a.mode,balance:Number(a.balance),lastAt:a.last_at,position:a.position};
    const r=v4Advance(state,bars);
    if(r.event==='SEEN'||r.event==='INVALID')continue;
    if(r.event==='ENTRY')opened++;if(r.event==='GAP')gaps++;
    if(r.trade){closed++;const t=r.trade;await client.query('INSERT INTO v4_trades(config_id,symbol,side,mode,entry_at,exit_at,entry_price,exit_price,quantity,pnl,fee_entry,fee_exit,mfe,mae,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)',[t.configId,t.symbol,t.side,t.mode,t.entryAt,t.exitAt,t.entry,t.exit,t.qty,t.pnl,t.feeEntry,t.feeExit,t.mfe,t.mae,t.reason]);}
    await client.query('UPDATE v4_accounts SET balance=$2,last_at=$3,position=$4 WHERE id=$1',[a.id,r.state.balance,r.state.lastAt,JSON.stringify(r.state.position)]);changed++;
   }
  }
  await client.query('COMMIT');return {changed,opened,closed,gaps};
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function v4Report(pool:pg.Pool){
 const q=await pool.query(`WITH steps AS (
 SELECT config_id,id,100+SUM(pnl) OVER (PARTITION BY config_id ORDER BY id) AS equity FROM v4_trades
 ), peaks AS (
 SELECT config_id,equity,GREATEST(100,MAX(equity) OVER (PARTITION BY config_id ORDER BY id)) AS peak FROM steps
 ), drawdowns AS (
 SELECT config_id,COALESCE(MAX((peak-equity)/NULLIF(peak,0)),0)::float8 AS max_drawdown_closed FROM peaks GROUP BY config_id
 )
 SELECT a.id,a.symbol,a.side,a.dip::float8,a.mode,COALESCE(d.max_drawdown_closed,0) AS max_drawdown_closed,a.balance::float8,a.last_at::text,a.position,COUNT(t.id)::int AS trades,COUNT(t.id) FILTER(WHERE t.pnl>0)::int AS wins,COALESCE(SUM(t.pnl),0)::float8 AS net,COALESCE(SUM(t.fee_entry+t.fee_exit),0)::float8 AS fees,COALESCE(AVG(t.mfe),0)::float8 AS avg_mfe,COALESCE(AVG(t.mae),0)::float8 AS avg_mae,COALESCE(SUM(t.pnl) FILTER(WHERE t.pnl>0),0)::float8 AS profit,COALESCE(SUM(t.pnl) FILTER(WHERE t.pnl<0),0)::float8 AS loss FROM v4_accounts a LEFT JOIN v4_trades t ON t.config_id=a.id LEFT JOIN drawdowns d ON d.config_id=a.id GROUP BY a.id,d.max_drawdown_closed ORDER BY a.symbol,a.dip,a.side,a.mode`);
 return {version:'v4-forward-only',at:new Date().toISOString(),configs:q.rows.length,accounts:q.rows};
}
