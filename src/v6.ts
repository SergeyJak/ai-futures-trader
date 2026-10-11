import {pauseForRetryAfter,rotateResearchSample} from './v6-request-policy.js';
import {studyV6Entries} from './v6-entry-study.js';
import {v6Insights} from './v6-insights.js';
import type pg from 'pg';

const BASE='https://api.kopyon.com/v4';
let providerCooldownUntil=0;
class ProviderRateLimit extends Error {constructor(){super('Provider HTTP 429 rate limited')}}
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
 if(Date.now()<providerCooldownUntil)throw new ProviderRateLimit();
 const url=new URL(BASE+path);for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
 const headers:Record<string,string>={'accept':'application/json'};
 if(process.env.KOPYON_API_KEY)headers['X-API-KEY']=process.env.KOPYON_API_KEY;
 const res=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});
 if(res.status===429){providerCooldownUntil=Date.now()+pauseForRetryAfter(res.headers.get('retry-after'));console.warn('V6_RATE_LIMIT',JSON.stringify({until:new Date(providerCooldownUntil).toISOString()}));throw new ProviderRateLimit()}
 if(!res.ok)throw Error('Provider HTTP '+res.status);
 const json:unknown=await res.json();return json;
}

import {createHash} from 'node:crypto';
async function collectActivity(pool:pg.Pool,ids:string[]){
 let records=0,failures=0;
 for(const id of ids){
  for(const [kind,path,params] of [
    ['history','/traderPositionHistory',{topTraderId:id,marketType:'UM',page:'1',rows:'20'}],
    ['open','/traderOpenPositions',{topTraderId:id,marketType:'UM',page:'1',rows:'20'}]
  ] as const){
   try{
    const payload=await request(path,params);
    if(object(payload).success===false)throw Error(String(object(payload).message??'Provider returned failure'));
    const rows=extractList(payload);
    // Fetch a bounded number of history pages. Stop if the provider ignores
    // page or repeats the same records, avoiding endless duplicate requests.
    if(kind==='history'&&rows.length===20){
     const seen=new Set(rows.map(row=>createHash('sha256').update(JSON.stringify(row)).digest('hex')));
     for(let page=2;page<=5;page++){
      let next:unknown;
      try{next=await request(path,{...params,page:String(page)})}catch(e){if(e instanceof ProviderRateLimit){console.warn('V6_HISTORY_PARTIAL_PAGE',JSON.stringify({trader:id,page,retained:rows.length}));break}throw e}
      if(object(next).success===false)throw Error(String(object(next).message??'Provider returned failure'));
      const batch=extractList(next);
      if(!batch.length)break;
      let added=0;
      for(const row of batch){
       const hash=createHash('sha256').update(JSON.stringify(row)).digest('hex');
       if(!seen.has(hash)){seen.add(hash);rows.push(row);added++}
      }
      if(added===0||batch.length<20)break;
     }
    }
    const client=await pool.connect();
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
    if(e instanceof ProviderRateLimit){console.warn('V6_ACTIVITY_PAUSED',JSON.stringify({trader:id,kind}));return {newActivity:records,failedRequests:failures,rateLimited:true}}
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
  const observed=await collectActivity(pool,rotateResearchSample(list.map(t=>t.id)));
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
 const samples=await pool.query<{trader_id:string;kind:string;raw:Record<string,unknown>}>(`SELECT trader_id,kind,raw FROM v6_position_observations ORDER BY id DESC LIMIT 2000`);
 const entryStudy=await studyV6Entries(pool).catch(e=>({error:String(e)}));
 return {counts:counts.rows,fields:fields.rows,insights:v6Insights(samples.rows),entryStudy};
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
export const v6Html="<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>AI Futures · V6</title><style>\n*{box-sizing:border-box}body{margin:0;background:#f6f8fc;color:#172338;font:15px system-ui}main{max-width:960px;margin:20px auto;padding:16px}h1{font-size:25px;margin:0 0 5px}h2{font-size:17px;margin:0 0 12px}.muted{color:#687991;font-size:13px}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.card{background:white;border:1px solid #e4eaf5;border-radius:16px;padding:17px;min-width:0}.number{font-size:27px;font-weight:750;margin:8px 0 2px}.label{font-size:12px;color:#63758d}.status{font-size:13px;font-weight:650}.good{color:#16724b}.warn{color:#966314}.bad{color:#b83f3f}.section{margin-top:18px}.hint{line-height:1.5}.item{border-top:1px solid #edf1f7;padding:13px 0;display:flex;justify-content:space-between;gap:12px;align-items:start}.item:first-child{border-top:0}.item strong{display:block;font-size:14px}.pill{padding:5px 9px;background:#eff3fa;border-radius:10px;font-size:12px;white-space:nowrap}.foot{margin-top:16px}details{margin-top:14px;font-size:13px;color:#687991}summary{cursor:pointer}table{width:100%;border-collapse:collapse}td,th{padding:9px;text-align:left;border-bottom:1px solid #edf1f7;font-size:12px}th{color:#66758e}@media(max-width:620px){.grid{gap:8px}.card{padding:12px}.number{font-size:21px}main{margin:10px auto;padding:12px}.item{flex-wrap:wrap}}\n</style></head><body><main><h1>V6 · Поиск стратегии</h1><div class=\"muted\">Изучаем реальные сделки, проверяем торговые идеи. Без реальных ордеров.</div>\n<div class=\"grid\"><div class=\"card\"><div class=\"label\">Источник данных</div><div class=\"number status\" id=\"source\">Проверка…</div><div class=\"muted\" id=\"updated\"></div></div><div class=\"card\"><div class=\"label\">Трейдеров</div><div class=\"number\" id=\"traders\">—</div><div class=\"muted\">в наблюдении</div></div><div class=\"card\"><div class=\"label\">Закрытых позиций</div><div class=\"number\" id=\"closed\">—</div><div class=\"muted\">исторических записей</div></div></div>\n<section class=\"card section\"><h2>Что удалось выяснить</h2><div id=\"insight\" class=\"hint muted\">Считаем статистику…</div></section>\n<section class=\"card section\"><h2>Кандидаты для изучения</h2><div id=\"candidates\" class=\"muted\">Загрузка…</div></section>\n<section class=\"card section\"><h2>Готовность к виртуальной торговле</h2><strong id=\"decision\">Проверка…</strong><p class=\"muted hint\" id=\"reason\">Нужна независимая проверка доходности после комиссий.</p></section>\n<details><summary>Техническая информация</summary><p id=\"tech\">Загрузка…</p></details>\n</main><script>\nconst el=id=>document.getElementById(id);const fmt=(v,n=1)=>v==null?'—':Number(v).toLocaleString('ru-RU',{maximumFractionDigits:n});const safeDate=v=>v?new Date(v).toLocaleString('ru-RU'):'—';\nasync function refresh(){try{const r=await fetch('/api/v6',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();const a=d.analysis||{},i=a.insights||{},s=d.source||{};\nel('source').textContent=s.status==='connected'?'Работает':s.status==='unavailable'?'Ошибка':'Ожидание';el('source').className='number status '+(s.status==='connected'?'good':'bad');el('updated').textContent=safeDate(s.last_success);el('traders').textContent=d.traders?.length??0;el('closed').textContent=i.historyRecords??0;\nconst candidates=[...(i.traders||[])].filter(x=>x.records>=5).sort((a,b)=>((b.profitFactor??0)-(a.profitFactor??0))||(b.records-a.records)).slice(0,3);const container=el('candidates');container.replaceChildren();if(!candidates.length)container.textContent='Недостаточно закрытых позиций для сравнения';\nfor(const t of candidates){const row=document.createElement('div');row.className='item';const info=document.createElement('div');const name=document.createElement('strong');name.textContent='Трейдер ···'+String(t.trader).slice(-5);const stats=document.createElement('div');stats.className='muted';stats.textContent=t.records+' позиций · успешных '+fmt((t.winRate??0)*100,0)+'% · медиана '+(t.medianHoldMinutes==null?'неизвестна':fmt(t.medianHoldMinutes/60,1)+' ч');info.append(name,stats);const pill=document.createElement('span');pill.className='pill';pill.textContent='PF '+fmt(t.profitFactor,2);row.append(info,pill);container.append(row)}\nconst holds=(i.traders||[]).filter(t=>t.medianHoldMinutes!=null).map(t=>t.medianHoldMinutes);const med=holds.length?[...holds].sort((a,b)=>a-b)[Math.floor(holds.length/2)]:null;\nel('insight').textContent=(i.historyRecords||0)+' исторических позиций. '+(med==null?'Время удержания пока не определено.':'Медианное время удержания среди трейдеров с историей: около '+fmt(med/60,1)+' ч.')+' Это наблюдение, а не доказательство прибыльности. История частичная.';\nel('decision').textContent='Ещё не готова';el('decision').className='warn';el('reason').textContent='Сначала проверим правила входа и выхода на новых исторических данных с комиссиями, проскальзыванием и контролем просадки.';\nel('tech').textContent='Позиции открытые: '+(i.openSnapshots??0)+' · Проверено источников: '+(d.activityStatus?.length??0)+(s.error?' · Ошибка: '+s.error:'');\n}catch(e){el('source').textContent='Ошибка загрузки';el('source').className='number status bad';el('tech').textContent=String(e)}}\nrefresh();setInterval(refresh,30000);\n</script></body></html>";
