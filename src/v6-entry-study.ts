import type pg from 'pg';
export function classifyV6Entry(side:unknown,entryClose:unknown,priorClose:unknown):'dip'|'momentum'|'flat'|'unknown'{
 const direction=/^(LONG|BUY)$/i.test(String(side))?1:/^(SHORT|SELL)$/i.test(String(side))?-1:0;
 const entry=Number(entryClose),prior=Number(priorClose);
 if(!direction||entryClose===null||priorClose===null||!Number.isFinite(entry)||!Number.isFinite(prior)||entry<=0||prior<=0)return 'unknown';
 const move=Math.sign(entry-prior);
 return move===0?'flat':direction*move<0?'dip':'momentum';
}
export function deduplicateV6EntryRows<T extends {trader_id:string;symbol:string;side:string;opened_time:string;closed_time:string;update_time?:string}>(rows:T[]):T[]{
 const byKey=new Map<string,T>();
 for(const row of rows){const key=[row.trader_id,row.symbol,row.side,row.opened_time,row.closed_time].join('|');const previous=byKey.get(key);if(!previous||Number(row.update_time??0)>=Number(previous.update_time??0))byKey.set(key,row)}
 return [...byKey.values()];
}
export async function studyV6Entries(pool:pg.Pool){
 // Only use candles that had FINISHED before the observed trade entry.
 // Do not read the close of the minute containing the entry (look-ahead).
 const q=await pool.query(`SELECT o.trader_id,o.raw->>'symbol' symbol,o.raw->>'side' side,
 o.raw->>'opened_time' opened_time,o.raw->>'closed_time' closed_time,o.raw->>'update_time' update_time,
 e.close::float8 AS entry,p.close::float8 AS prev,
 EXTRACT(EPOCH FROM (t.opened_at-(e.start_at+interval '1 minute'))) AS entry_lag_seconds,
 EXTRACT(EPOCH FROM (t.opened_at-interval '15 minutes'-(p.start_at+interval '1 minute'))) AS prior_lag_seconds
 FROM v6_position_observations o
 CROSS JOIN LATERAL (SELECT to_timestamp((o.raw->>'opened_time')::float8/1000) AS opened_at) t
 LEFT JOIN LATERAL (SELECT close,start_at FROM market_candles WHERE symbol=o.raw->>'symbol' AND confirmed=true AND start_at+interval '1 minute'<=t.opened_at ORDER BY start_at DESC LIMIT 1) e ON true
 LEFT JOIN LATERAL (SELECT close,start_at FROM market_candles WHERE symbol=o.raw->>'symbol' AND confirmed=true AND start_at+interval '1 minute'<=t.opened_at-interval '15 minutes' ORDER BY start_at DESC LIMIT 1) p ON true
 WHERE o.kind='history' AND o.raw->>'opened_time' ~ '^[0-9]{13}$'
 AND o.raw->>'closed_time' ~ '^[0-9]{13}$'
 AND UPPER(COALESCE(o.raw->>'status','')) !~ 'PARTIAL|OPEN|ACTIVE|PENDING'
 ORDER BY o.id DESC LIMIT 300`);
 const by=new Map<string,{count:number;covered:number;against:number;withTrend:number;flat:number;uncovered:number}>();
 for(const r of deduplicateV6EntryRows(q.rows)){
 const a=by.get(r.trader_id)??{count:0,covered:0,against:0,withTrend:0,flat:0,uncovered:0};a.count++;
 const fresh=r.entry_lag_seconds!==null&&r.prior_lag_seconds!==null&&Number(r.entry_lag_seconds)>=0&&Number(r.prior_lag_seconds)>=0&&Number(r.entry_lag_seconds)<=180&&Number(r.prior_lag_seconds)<=180;
 const category=fresh?classifyV6Entry(r.side,r.entry,r.prev):'unknown';
 if(category==='unknown')a.uncovered++;else{a.covered++;if(category==='dip')a.against++;if(category==='momentum')a.withTrend++;if(category==='flat')a.flat++}
 by.set(r.trader_id,a);
 }
 return {traders:[...by].map(([id,stats])=>({id,...stats})),caveat:'Completed 1-minute candles only, with <=3m lag at both timestamps; 15m direction is descriptive, not an entry trigger or out-of-sample proof.'};
}
