import type pg from 'pg';
type Bar={start_at:string;open:string;high:string;low:string;close:string};
type Position={symbol:string;side:'LONG'|'SHORT';entry:number;qty:number;entryAt:string;stop:number;take:number;entryFee:number};
type State={id:string;symbol:string;side:'LONG'|'SHORT';dip:number;stop:number;take:number;hold:number;balance:number;lastAt:string|null;position:Position|null};
const FEE=.0006,SLIP=.0002;
export const V3_CONFIGS:(Pick<State,'id'|'symbol'|'side'|'dip'|'stop'|'take'|'hold'>)[]=[];
for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT'])
 for(const dip of [.002,.004])
  for(const stop of [.002,.004])
   for(const take of [.003,.006])
    for(const hold of [5,15,30])
     for(const side of ['LONG','SHORT'] as const)
      V3_CONFIGS.push({id:[symbol,side,'d'+dip,'s'+stop,'t'+take,'h'+hold].join('_'),symbol,side,dip,stop,take,hold});
export function v3Advance(state:State,history:Bar[]):{state:State;trade:Record<string,unknown>|null;event:string}{
 const s:{[key:string]:any}={...state},bars=history.map(x=>({...x,ms:Date.parse(x.start_at),o:Number(x.open),h:Number(x.high),l:Number(x.low),c:Number(x.close)}));
 const now=bars.at(-1);if(!now||!Number.isFinite(now.ms)||!Number.isFinite(now.o))return {state,event:'INVALID',trade:null};
 if(s.lastAt&&Date.parse(s.lastAt)>=now.ms)return {state,event:'SEEN',trade:null};
 if(s.lastAt&&now.ms-Date.parse(s.lastAt)>60000){s.lastAt=now.start_at;return {state:s as State,event:'GAP',trade:null}}
 if(bars.length<31||bars.slice(-31).some((x,i,a)=>i&&x.ms-a[i-1].ms!==60000)){s.lastAt=now.start_at;return {state:s as State,event:'INSUFFICIENT',trade:null}}
 const direction=state.side==='LONG'?1:-1;
 let trade:Record<string,unknown>|null=null,event='WAIT';
 if(s.position){
  const p=s.position as Position,elapsed=(now.ms-Date.parse(p.entryAt))/60000;
  const stop=direction===1?now.l<=p.stop:now.h>=p.stop;
  const take=direction===1?now.h>=p.take:now.l<=p.take;
  let raw:number|null=null,reason='';
  if(elapsed>=state.hold){raw=now.o;reason='TIME'}
  else if(stop){raw=direction===1?Math.min(p.stop,now.o):Math.max(p.stop,now.o);reason='STOP'}
  else if(take){raw=direction===1?Math.max(p.take,now.o):Math.min(p.take,now.o);reason='TAKE'}
  if(raw!==null){
   const exit=raw*(1-direction*SLIP),exitFee=exit*p.qty;
   const pnl=(exit-p.entry)*p.qty*direction-p.entryFee-exitFee*FEE;
   s.balance+=(exit-p.entry)*p.qty*direction-exitFee*FEE;
   trade={configId:state.id,symbol:state.symbol,side:state.side,entryAt:p.entryAt,exitAt:now.start_at,entry:p.entry,exit,qty:p.qty,pnl,feeEntry:p.entryFee,feeExit:exitFee*FEE,reason};
   s.position=null;event='EXIT_'+reason;
  }
 }else{
  const prior=bars.slice(-31,-1),peak=Math.max(...prior.map(x=>x.h)),trigger=peak*(1-state.dip);
  if(now.o>=trigger&&now.l<=trigger&&prior.at(-1)!.c>trigger){
   const entry=trigger*(1+direction*SLIP),qty=25/entry;
   const p:Position={symbol:state.symbol,side:state.side,entry,qty,entryAt:now.start_at,stop:entry*(1-direction*state.stop),take:entry*(1+direction*state.take),entryFee:entry*qty*FEE};
   s.balance-=p.entryFee;
   // Intrabar order unknown: always assess stop in the trigger bar; never credit a same-bar take.
   const hit=direction===1?now.l<=p.stop:now.h>=p.stop;
   if(hit){
    const exit=p.stop*(1-direction*SLIP),exitFee=exit*qty*FEE;
    const pnl=(exit-entry)*qty*direction-p.entryFee-exitFee;
    s.balance+=(exit-entry)*qty*direction-exitFee;
    trade={configId:state.id,symbol:state.symbol,side:state.side,entryAt:now.start_at,exitAt:now.start_at,entry,exit,qty,pnl,feeEntry:p.entryFee,feeExit:exitFee,reason:'ENTRY_STOP_BOUND'};
    event='ENTRY_STOP_BOUND';
   }else{s.position=p;event='ENTRY'}
  }
 }
 s.lastAt=now.start_at;
 return {state:s as State,trade,event};
}
export async function initV3(pool:pg.Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS v3_accounts(id TEXT PRIMARY KEY,symbol TEXT NOT NULL,side TEXT NOT NULL,dip NUMERIC NOT NULL,stop NUMERIC NOT NULL,take NUMERIC NOT NULL,hold INTEGER NOT NULL,balance NUMERIC NOT NULL DEFAULT 100,last_at TIMESTAMPTZ,position JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS v3_trades(id BIGSERIAL PRIMARY KEY,config_id TEXT NOT NULL REFERENCES v3_accounts(id),symbol TEXT NOT NULL,side TEXT NOT NULL,entry_at TIMESTAMPTZ NOT NULL,exit_at TIMESTAMPTZ NOT NULL,entry_price NUMERIC NOT NULL,exit_price NUMERIC NOT NULL,quantity NUMERIC NOT NULL,pnl NUMERIC NOT NULL,fee_entry NUMERIC NOT NULL,fee_exit NUMERIC NOT NULL,reason TEXT NOT NULL)`);
 await pool.query('CREATE INDEX IF NOT EXISTS v3_trades_config_time ON v3_trades(config_id,exit_at DESC)');
 for(const c of V3_CONFIGS)await pool.query('INSERT INTO v3_accounts(id,symbol,side,dip,stop,take,hold,balance) VALUES($1,$2,$3,$4,$5,$6,$7,100) ON CONFLICT(id) DO NOTHING',[c.id,c.symbol,c.side,c.dip,c.stop,c.take,c.hold]);
}
export async function tickV3(pool:pg.Pool){
 const client=await pool.connect();try{
  await client.query('BEGIN');
  const accounts=await client.query('SELECT * FROM v3_accounts ORDER BY id FOR UPDATE');
  let changed=0,opened=0,closed=0,gaps=0;
  for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT']){
   const barsResult=await client.query(`SELECT start_at::text,open::text,high::text,low::text,close::text FROM market_candles WHERE symbol=$1 AND confirmed=true ORDER BY start_at DESC LIMIT 34`,[symbol]);
   const bars=barsResult.rows.reverse() as Bar[];
   const latest=bars.at(-1);if(!latest)continue;
   for(const a of accounts.rows.filter(x=>x.symbol===symbol)){
    if(a.last_at&&Date.parse(a.last_at)>=Date.parse(latest.start_at))continue;
    const state:State={id:a.id,symbol:a.symbol,side:a.side,dip:Number(a.dip),stop:Number(a.stop),take:Number(a.take),hold:a.hold,balance:Number(a.balance),lastAt:a.last_at,position:a.position};
    const r=v3Advance(state,bars);
    if(r.event==='GAP')gaps++;
    if(r.event==='ENTRY')opened++;
    if(r.trade){
     closed++;
     const t=r.trade;
     await client.query(`INSERT INTO v3_trades(config_id,symbol,side,entry_at,exit_at,entry_price,exit_price,quantity,pnl,fee_entry,fee_exit,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[t.configId,t.symbol,t.side,t.entryAt,t.exitAt,t.entry,t.exit,t.qty,t.pnl,t.feeEntry,t.feeExit,t.reason]);
    }
    await client.query('UPDATE v3_accounts SET balance=$2,last_at=$3,position=$4 WHERE id=$1',[a.id,r.state.balance,r.state.lastAt,JSON.stringify(r.state.position)]);
    changed++;
   }
  }
  await client.query('COMMIT');return {changed,opened,closed,gaps};
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function v3Report(pool:pg.Pool){
 const q=await pool.query(`WITH steps AS (
 SELECT config_id,id,100+SUM(pnl) OVER (PARTITION BY config_id ORDER BY id) AS equity
 FROM v3_trades
 ), peaks AS (
 SELECT config_id,equity,GREATEST(100,MAX(equity) OVER (PARTITION BY config_id ORDER BY id)) AS peak FROM steps
 ), drawdowns AS (
 SELECT config_id,COALESCE(MAX((peak-equity)/NULLIF(peak,0)),0)::float8 AS max_drawdown_closed FROM peaks GROUP BY config_id
 )
 SELECT a.id,a.symbol,a.side,a.dip::float8,a.stop::float8,a.take::float8,a.hold,a.balance::float8,a.last_at::text,a.position,
 COALESCE(d.max_drawdown_closed,0) AS max_drawdown_closed,
 COUNT(t.id)::int AS trades,COUNT(t.id) FILTER(WHERE t.pnl>0)::int AS wins,
 COALESCE(SUM(t.pnl),0)::float8 AS realized_pnl,
 COALESCE(SUM(t.fee_entry+t.fee_exit),0)::float8 AS fees,
 COALESCE(SUM(t.pnl+t.fee_entry+t.fee_exit),0)::float8 AS gross_after_slippage,
 COALESCE(SUM(t.pnl) FILTER(WHERE t.pnl>0),0)::float8 AS gross_wins,
 COALESCE(SUM(t.pnl) FILTER(WHERE t.pnl<0),0)::float8 AS gross_losses
 FROM v3_accounts a LEFT JOIN v3_trades t ON t.config_id=a.id LEFT JOIN drawdowns d ON d.config_id=a.id
 GROUP BY a.id,d.max_drawdown_closed ORDER BY a.symbol,a.dip,a.stop,a.take,a.hold,a.side`);
 return {version:'v3-forward-only',at:new Date().toISOString(),initialBalance:100,configs:q.rows.length,accounts:q.rows};
}
