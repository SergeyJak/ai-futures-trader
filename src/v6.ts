import type pg from 'pg';

const BASE='https://api.kopyon.com/v4';
type Json=Record<string,unknown>;
const object=(x:unknown):Json=>x!==null&&typeof x==='object'&&!Array.isArray(x)?x as Json:{};
const first=(o:Json,...keys:string[])=>{for(const k of keys){if(o[k]!==undefined&&o[k]!==null)return o[k]}return null};
export function extractList(payload:unknown):unknown[]{
 if(Array.isArray(payload))return payload;
 const root=object(payload);
 for(const key of ['data','result','traders','list','rows','items']){
  const v=root[key];if(Array.isArray(v))return v;
  const nested=object(v);
  for(const sub of ['data','accounts','positions','orders','list','rows','items','traders','leaderboard','records','rankings'])if(Array.isArray(nested[sub]))return nested[sub] as unknown[];
  for(const sub of ['data','result','list','rows','items','traders','leaderboard','records','rankings']){const deep=object(nested[sub]);for(const key of ['accounts','positions','orders','list','rows','items','traders','records','data'])if(Array.isArray(deep[key]))return deep[key] as unknown[];}
 }
 return [];
}
export function normalizeTrader(value:unknown){
 const v=object(value);
 const id=first(v,'topTraderId','topTraderID','traderId','futureUid','encryptedUid','uid','id');
 if(id===null||String(id).trim()==='')return null;
 const num=(...names:string[])=>{const val=first(v,...names);return val===null?null:Number.isFinite(Number(val))?Number(val):null};
 return {id:String(id),name:String(first(v,'nickName','nickname','name','userName','traderName')??'Анонимный трейдер'),roi:num('roi','ROI','roiValue'),pnl:num('pnl','PNL','pnlValue'),raw:v};
}
async function request(path:string,params:Record<string,string>){
 const url=new URL(BASE+path);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
 const headers:Record<string,string>={'accept':'application/json'};
 if(process.env.KOPYON_API_KEY)headers['X-API-KEY']=process.env.KOPYON_API_KEY;
 const res=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});
 if(!res.ok)throw Error('Provider HTTP '+res.status);
 const json:unknown=await res.json();return json;
}

import {createHash} from 'node:crypto';
async function collectActivity(pool:pg.Pool,ids:string[]){
 let records=0,failures=0;
 for(const id of ids){
  for(const [kind,path,params] of [
    ['history','/traderPositionHistory',{topTraderId:id,marketType:'UM',rows:'20'}],
    ['open','/traderOpenPositions',{topTraderId:id,marketType:'UM',page:'1',rows:'20'}]
  ] as const){
   try{
    const payload=await request(path,params);
    if(object(payload).success===false)throw Error(String(object(payload).message??'Provider returned failure'));
    const rows=extractList(payload);const client=await pool.connect();
    try{
     await client.query('BEGIN');
     for(const row of rows){
      const raw=JSON.stringify(row);
      const hash=createHash('sha256').update(raw).digest('hex');
      const result=await client.query('INSERT INTO v6_position_observations(trader_id,kind,raw,hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,kind,raw,hash]);
      records+=result.rowCount??0;
     }
     await client.query(`INSERT INTO v6_activity_status(trader_id,checked_at,status,error) VALUES($1,NOW(),'connected',NULL) ON CONFLICT(trader_id) DO UPDATE SET checked_at=NOW(),status='connected',error=NULL`,[id]);
     await client.query('COMMIT');
    }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
   }catch(e){
    failures++;
    const msg=e instanceof Error?e.message:String(e);
    console.warn('V6_ACTIVITY_ERROR',JSON.stringify({trader:id,kind,error:msg.slice(0,160)}));
    await pool.query(`INSERT INTO v6_activity_status(trader_id,checked_at,status,error) VALUES($1,NOW(),'unavailable',$2) ON CONFLICT(trader_id) DO UPDATE SET checked_at=NOW(),status='unavailable',error=$2`,[id,msg.slice(0,200)]);
   }
  }
 }
 return {newActivity:records,failedRequests:failures};
}

export async function initV6(pool:pg.Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS v6_source_state(id TEXT PRIMARY KEY,status TEXT NOT NULL,last_attempt TIMESTAMPTZ,last_success TIMESTAMPTZ,error TEXT,observed_count INTEGER NOT NULL DEFAULT 0)`);
 await pool.query(`CREATE TABLE IF NOT EXISTS v6_trader_snapshots(id BIGSERIAL PRIMARY KEY,trader_id TEXT NOT NULL,observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),name TEXT,roi DOUBLE PRECISION,pnl DOUBLE PRECISION,raw JSONB NOT NULL)`);
 await pool.query('CREATE INDEX IF NOT EXISTS v6_snapshots_recent ON v6_trader_snapshots(observed_at DESC)');
 await pool.query(`CREATE TABLE IF NOT EXISTS v6_position_observations(id BIGSERIAL PRIMARY KEY,trader_id TEXT NOT NULL,kind TEXT NOT NULL,observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),raw JSONB NOT NULL,hash TEXT NOT NULL,UNIQUE(trader_id,kind,hash))`);
 await pool.query('INSERT INTO v6_source_state(id,status) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',['kopyon','pending']);
 await pool.query(`CREATE TABLE IF NOT EXISTS v6_activity_status(trader_id TEXT PRIMARY KEY,checked_at TIMESTAMPTZ,status TEXT NOT NULL,error TEXT)`);
}
let busy=false;
export async function runV6(pool:pg.Pool){
 if(busy)return {status:'busy'};
 busy=true;
 try{
  const payload=await request('/tradersList',{timeRange:'90D',rankingType:'PNL',order:'DESC',onlyShowSharingPosition:'true',page:'1',rows:'20'});
  const list=extractList(payload).map(normalizeTrader).filter((v):v is NonNullable<typeof v>=>v!==null);
  if(!list.length){const data=object(object(payload).data);const rows=extractList(payload);const sample=object(rows[0]);const diagnostic={success:object(payload).success,message:String(object(payload).message??'').slice(0,120),rootKeys:Object.keys(object(payload)).slice(0,15),dataKeys:Object.keys(data).slice(0,20),rows:rows.length,rowKeys:Object.keys(sample).slice(0,25)};console.warn('V6_PROVIDER_SHAPE',JSON.stringify(diagnostic));throw Error('No trader IDs; response shape: '+JSON.stringify(diagnostic).slice(0,240))}
  const client=await pool.connect();
  try{
   await client.query('BEGIN');
   for(const t of list)await client.query('INSERT INTO v6_trader_snapshots(trader_id,name,roi,pnl,raw) VALUES($1,$2,$3,$4,$5)',[t.id,t.name,t.roi,t.pnl,JSON.stringify(t.raw)]);
   await client.query(`INSERT INTO v6_source_state(id,status,last_attempt,last_success,error,observed_count) VALUES('kopyon','connected',NOW(),NOW(),NULL,$1) ON CONFLICT(id) DO UPDATE SET status='connected',last_attempt=NOW(),last_success=NOW(),error=NULL,observed_count=EXCLUDED.observed_count`,[list.length]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  const observed=await collectActivity(pool,list.slice(0,5).map(t=>t.id));
  const summary=await analyzeV6(pool); console.info('V6_ANALYSIS',JSON.stringify(summary));
  return {status:'connected',traders:list.length,...observed};
 }catch(e){
  const error=e instanceof Error?e.message:String(e);
  await pool.query(`INSERT INTO v6_source_state(id,status,last_attempt,error) VALUES('kopyon','unavailable',NOW(),$1) ON CONFLICT(id) DO UPDATE SET status='unavailable',last_attempt=NOW(),error=EXCLUDED.error`,[error.slice(0,300)]);
  return {status:'unavailable',error};
 }finally{busy=false}
}
export async function analyzeV6(pool:pg.Pool){
 const [counts,fields]=await Promise.all([
 pool.query(`SELECT kind,COUNT(*)::int AS count,COUNT(DISTINCT trader_id)::int AS traders FROM v6_position_observations GROUP BY kind`),
 pool.query(`SELECT o.kind,k.field,COUNT(*)::int AS count FROM v6_position_observations o CROSS JOIN LATERAL jsonb_object_keys(o.raw) AS k(field) GROUP BY o.kind,k.field ORDER BY o.kind,count DESC LIMIT 60`)]);
 return {counts:counts.rows,fields:fields.rows};
}
export async function v6Report(pool:pg.Pool){
 const [state,snapshots,activity,status]=await Promise.all([
  pool.query('SELECT id,status,last_attempt::text,last_success::text,error,observed_count FROM v6_source_state'),
  pool.query(`SELECT DISTINCT ON (trader_id) trader_id,name,roi,pnl,observed_at::text FROM v6_trader_snapshots ORDER BY trader_id,observed_at DESC LIMIT 50`),
 pool.query(`SELECT trader_id,kind,raw,observed_at::text FROM v6_position_observations ORDER BY observed_at DESC,id DESC LIMIT 100`),
 pool.query('SELECT trader_id,status,error,checked_at::text FROM v6_activity_status ORDER BY checked_at DESC LIMIT 20')
 ]);
 const activityAnalysis=await analyzeV6(pool);
 return {version:6,mode:'research-only',realOrders:false,source:state.rows[0]??{status:'pending'},traders:snapshots.rows,activity:activity.rows,activityStatus:status.rows,analysis:activityAnalysis,strategies:[],paperTrades:[],note:'Публичные позиции и история собираются. Вывод стратегий и торговые сигналы ещё не реализованы.'};
}
export const v6Html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Futures V6</title><style>body{margin:0;background:#f6f8fc;color:#172338;font:15px system-ui}main{max-width:1050px;margin:24px auto;padding:16px}.card{background:white;border:1px solid #e4eaf5;border-radius:16px;padding:18px}.muted{color:#66758e}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #e4eaf5}section{overflow-x:auto}</style></head><body><main><h1>V6 · Strategy Discovery</h1><p>Исследование публичных трейдеров. Только наблюдение, без реальных ордеров.</p><section class="card"><p id="state">Загрузка…</p><p class="muted" id="info"></p><table><thead><tr><th>Трейдер</th><th>ROI</th><th>PNL</th><th>Обновлено</th></tr></thead><tbody id="rows"></tbody></table><h2>Наблюдаемые позиции и история</h2><p id="activityState" class="muted">Загрузка…</p><table><thead><tr><th>Трейдер</th><th>Тип</th><th>Пара</th><th>Направление</th><th>Вход</th><th>PnL</th></tr></thead><tbody id="activityRows"></tbody></table><p class="muted">История публичных позиций и ордеров обновляется при доступности данных. Автоматический вывод стратегий ещё не включён.</p></section></main><script>async function refresh(){try{const r=await fetch('/api/v6',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();document.getElementById('state').textContent='Источник: '+d.source.status+(d.source.error?' · '+d.source.error:'');document.getElementById('info').textContent='Последняя успешная загрузка: '+(d.source.last_success??'ещё не было')+' · трейдеров: '+d.traders.length;const body=document.getElementById('rows');body.replaceChildren();for(const t of d.traders){const tr=document.createElement('tr');for(const v of [t.name,t.roi??'н/д',t.pnl??'н/д',t.observed_at]){const td=document.createElement('td');td.textContent=String(v);tr.append(td)}body.append(tr)}const activity=document.getElementById('activityRows');activity.replaceChildren();for(const a of d.activity??[]){const tr=document.createElement('tr');for(const v of [a.trader_id,a.kind,a.raw.symbol??'н/д',a.raw.side??'н/д',a.raw.avg_entry_price??a.raw.entryPrice??'н/д',a.raw.closing_pnl??a.raw.pnl??'н/д']){const td=document.createElement('td');td.textContent=String(v);tr.append(td)}activity.append(tr)}document.getElementById('activityState').textContent='Записей: '+(d.activity??[]).length+' · проверено трейдеров: '+(d.activityStatus??[]).length}catch(e){document.getElementById('state').textContent='Ошибка: '+String(e)}}refresh();setInterval(refresh,30000)</script></body></html>`;
