import type pg from 'pg';
export async function studyV6Entries(pool:pg.Pool){
 const q=await pool.query(`SELECT o.trader_id,o.raw->>'symbol' symbol,o.raw->>'side' side,
 e.close::float8 AS entry,p.close::float8 AS prev
 FROM v6_position_observations o
 LEFT JOIN LATERAL (SELECT close FROM market_candles WHERE symbol=o.raw->>'symbol' AND confirmed=true AND start_at<=to_timestamp((o.raw->>'opened_time')::float8/1000) ORDER BY start_at DESC LIMIT 1) e ON true
 LEFT JOIN LATERAL (SELECT close FROM market_candles WHERE symbol=o.raw->>'symbol' AND confirmed=true AND start_at<=to_timestamp((o.raw->>'opened_time')::float8/1000)-interval '15 minutes' ORDER BY start_at DESC LIMIT 1) p ON true
 WHERE o.kind='history' AND o.raw->>'opened_time' ~ '^[0-9]{13}$' LIMIT 300`);
 const by=new Map<string,{count:number;covered:number;against:number;withTrend:number}>();
 for(const r of q.rows){const a=by.get(r.trader_id)??{count:0,covered:0,against:0,withTrend:0};a.count++;if(r.entry&&r.prev){a.covered++;const direction=/long|buy/i.test(r.side)?1:/short|sell/i.test(r.side)?-1:0;const move=Math.sign(r.entry-r.prev);if(direction*move<0)a.against++;if(direction*move>0)a.withTrend++}by.set(r.trader_id,a)}
 return {traders:[...by].map(([id,stats])=>({id,...stats})),caveat:'Prior 15-minute price changes are descriptive, and not validated for profitability'};
}
