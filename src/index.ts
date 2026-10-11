import {withUnifiedHeader} from './unified-header.js';
import {v4Html} from './v4-page.js';
import {researchExitV4} from './v4-exits.js';
import 'dotenv/config';
import http from 'node:http';import {backtest} from './backtest.js';
import {evaluateCandidate} from './research.js';
import {auditTrade,auditSummary} from './audit.js';import {researchThirtyMinuteRange} from './range30.js';import {researchThirtyMinuteBounce} from './bounce30.js';
import {walkForward} from './walkforward.js';import {analyze} from './indicators.js';import {dashboardHtml} from './dashboard.js';import {v3Html} from './v3-page.js';import {analyticsHtml,researchHtml,marketHtml} from './extra-pages.js';import {MINUTE,missingRanges,fetchHistory} from './backfill.js';import {Database} from './database.js';import {MarketStream} from './market.js';
const port=Number(process.env.PORT??3000);const url=process.env.DATABASE_URL;
const endpoint=process.env.BYBIT_PUBLIC_WS??'wss://stream.bybit.com/v5/public/linear';
const symbols=(process.env.MARKET_SYMBOLS??'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map(s=>s.trim().toUpperCase());
if(!url)throw new Error('DATABASE_URL required');
if(!endpoint.startsWith('wss://'))throw new Error('Secure WebSocket required');
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
const db=new Database(url);await db.init();await db.initExperiments();await db.initShadow();await db.initV3();await db.initV4();await db.initV5();const stream=new MarketStream(endpoint,symbols,db);stream.start();
const server=http.createServer(async(req,res)=>{
 res.setHeader('cache-control','no-store');
 res.setHeader('x-content-type-options','nosniff');
 res.setHeader('referrer-policy','no-referrer');
 if(req.url==='/'||req.url==='/dashboard'){res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('content-security-policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'");res.writeHead(200).end(withUnifiedHeader(dashboardHtml));return}
 if(req.url==='/exit-research'){res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('content-security-policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'");res.writeHead(200).end(withUnifiedHeader(v4Html));return}
 if(req.url==='/experiments'){res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('content-security-policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'");res.writeHead(200).end(withUnifiedHeader(v3Html));return}
 if(req.url==='/analytics'||req.url==='/research'||req.url==='/market'){res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('content-security-policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'");res.writeHead(200).end(withUnifiedHeader(req.url==='/analytics'?analyticsHtml:req.url==='/research'?researchHtml:marketHtml));return}
 res.setHeader('content-type','application/json');
 if(req.url==='/api/overview'){
  try{const [stats,storage]=await Promise.all([db.candleStats(),db.storageStats()]);res.writeHead(200).end(JSON.stringify({symbols:stats,storage,stream:stream.status,updatedAt:new Date().toISOString()}))}
  catch(e){console.error('Dashboard overview error',e);res.writeHead(503).end(JSON.stringify({error:'Data unavailable'}))}
  return;
 }
 if(req.url?.startsWith('/api/shadow-account?')){
  const id=Number(new URL(req.url,'http://localhost').searchParams.get('account'));
  if(!Number.isInteger(id)||id<1||id>11){res.writeHead(400).end(JSON.stringify({error:'Invalid account'}));return}
  try{res.writeHead(200).end(JSON.stringify(await db.shadowAccountDetails(id)))}
  catch(e){console.error('Shadow account error',e);res.writeHead(503).end(JSON.stringify({error:'Shadow account unavailable'}))}
  return;
 }
 if(req.url==='/api/v4-exits'){
  try{
   const results=[];
   for(const symbol of ['BTCUSDT','ETHUSDT','SOLUSDT']){
    const bars=await db.recentCandles(symbol,12000);
    const split=Math.floor(bars.length*.7);
    results.push({symbol,bars:bars.length,training:researchExitV4(bars.slice(0,split)),validation:researchExitV4(bars.slice(split))});
   }
   res.writeHead(200).end(JSON.stringify({type:'research-only',version:'v4-exit-study',selection:'fixed entry stream, compare exit methods without changing existing accounts',chronologicalSplit:'70/30',results}));
  }catch(e){console.error('V4 exit research error',e);res.writeHead(503).end(JSON.stringify({error:'v4 exit study unavailable'}))}
  return;
 }
 if(req.url==='/v5'){res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('content-security-policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'");res.writeHead(200).end(withUnifiedHeader(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Futures v5</title><style>body{margin:0;background:#f6f8fc;color:#172338;font:15px system-ui}main{max-width:1100px;margin:25px auto;padding:16px}.card{background:white;padding:20px;border-radius:16px;border:1px solid #e4eaf5}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;white-space:nowrap}td,th{padding:10px;text-align:left;border-bottom:1px solid #e4eaf5}th{color:#687992}</style></head><body><main><h1>v5 · Независимые сигналы</h1><p>LONG: откат от максимума. SHORT: отскок от минимума. Выход по стопу/тейку до тайм-аута. 15, 30 и 60 минут. Только виртуальные счета.</p><section class="card"><p id="status">Загрузка…</p><div class="scroll"><table><thead><tr><th>Инструмент</th><th>Сторона</th><th>Мин</th><th>Просадка</th><th>Сделки</th><th>Победы</th><th>Чистый P&L</th><th>Комиссии</th><th>Баланс</th></tr></thead><tbody id="rows"></tbody></table></div></section></main><script>async function load(){try{const r=await fetch('/api/v5',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json(),root=document.getElementById('rows');root.replaceChildren();for(const a of d.accounts){const tr=document.createElement('tr');for(const x of [a.symbol,a.side,a.hold,(100*a.dip).toFixed(1)+'%',a.trades,a.wins,Number(a.realized_pnl).toFixed(3),Number(a.fees).toFixed(3),Number(a.balance).toFixed(3)]){const td=document.createElement('td');td.textContent=String(x);tr.append(td)}root.append(tr)}document.getElementById('status').textContent=d.configs+' конфигураций · '+d.accounts.reduce((n,a)=>n+a.trades,0)+' сделок · '+new Date(d.at).toLocaleString('ru-RU')}catch(e){document.getElementById('status').textContent=String(e)}}load();setInterval(load,20000)</script></body></html>`));return}
 if(req.url==='/api/v5'){try{res.writeHead(200).end(JSON.stringify(await db.v5Report()))}catch(e){console.error('V5 report error',e);res.writeHead(503).end(JSON.stringify({error:'v5 unavailable'}))}return}
 if(req.url==='/api/v4'){
  try{res.writeHead(200).end(JSON.stringify(await db.v4Report()))}
  catch(e){console.error('V4 report error',e);res.writeHead(503).end(JSON.stringify({error:'v4 unavailable'}))}
  return;
 }
 if(req.url==='/api/v3'){
  try{res.writeHead(200).end(JSON.stringify(await db.v3Report()))}
  catch(e){console.error('V3 report error',e);res.writeHead(503).end(JSON.stringify({error:'v3 unavailable'}))}
  return;
 }
 if(req.url==='/api/pairs'){
  try{res.writeHead(200).end(JSON.stringify(await db.pairedDiagnostics()))}
  catch(e){console.error('Pair diagnostics error',e);res.writeHead(503).end(JSON.stringify({error:'Pair diagnostics unavailable'}))}
  return;
 }
 if(req.url==='/api/bounce30'){
  try{
   const results=[];
   for(const symbol of ['SOLUSDT','ETHUSDT','BTCUSDT']){
    const rows=await db.recentCandles(symbol,10000);
    const split=Math.floor(rows.length*.7);
    results.push({symbol,training:researchThirtyMinuteBounce(rows.slice(0,split)),validation:researchThirtyMinuteBounce(rows.slice(split))});
   }
   res.writeHead(200).end(JSON.stringify({type:'research-only',strategy:'30-minute dip bounce versus short continuation',chronologicalSplit:'70/30',noOrders:true,results}));
  }catch(e){console.error('Bounce 30 research error',e);res.writeHead(503).end(JSON.stringify({error:'Bounce research unavailable'}))}
  return;
 }
 if(req.url==='/api/range30'){
  try{
   const results=[];
   for(const symbol of ['SOLUSDT','ETHUSDT','BTCUSDT']){
    const rows=await db.recentCandles(symbol,5000);
    const split=Math.floor(rows.length*.7);
    results.push({symbol,train:researchThirtyMinuteRange(rows.slice(0,split)),validation:researchThirtyMinuteRange(rows.slice(split))});
   }
   res.writeHead(200).end(JSON.stringify({type:'research-only',chronologicalSplit:'70/30',noOrders:true,results}));
  }catch(e){console.error('Range 30 research error',e);res.writeHead(503).end(JSON.stringify({error:'Range research unavailable'}))}
  return;
 }
 if(req.url==='/api/shadow-compare'){
  try{
   const [shadow,original]=await Promise.all([db.shadowReport(),db.paperAccounts()]);
   const originals=new Map(original.map(a=>[a.id,a]));
   const accounts=shadow.accounts.map(a=>{const live=originals.get(a.account_id);return {...a,originalBalance:live?.balance??null,originalPosition:live?.position??null,originalLastAt:live?.last_at??null}});
   res.writeHead(200).end(JSON.stringify({mode:'separate-forward-only-no-real-orders',version:shadow.version,comparisonNote:'v2 begins with fresh $100 at its start; v1 already has historical P&L. Compare changes from the same start time, not absolute balances.',accounts}));
  }catch(e){console.error('Shadow comparison error',e);res.writeHead(503).end(JSON.stringify({error:'Shadow comparison unavailable'}))}
  return;
 }
 if(req.url==='/api/audit'){
  try{
   const history=await db.auditHistory();
   const bySymbol=history.candles as Record<string,Array<{start_at:string;open:string;high:string;low:string;close:string}>>;
   const items=history.trades.map(t=>auditTrade(t,bySymbol[t.symbol]??[]));
   const accounts=Array.from({length:11},(_,i)=>({account:i+1,...auditSummary(items.filter(x=>x.account===i+1))}));
   res.writeHead(200).end(JSON.stringify({mode:'read-only',sampleLimit:history.sampleLimit,tradesAudited:items.length,summary:auditSummary(items),accounts,flags:items.filter(x=>Math.abs(x.delta)>0.000001||!x.entryBarFound||!x.exitBarFound||!x.entryReferenceInRange||(x.reason==='TIME'&&!x.timeoutExitAtOpen)).slice(0,100),disclaimer:'Historical stored trades unchanged. Slippage estimated from execution price. Candle-range checks do not prove original order execution.'}));
  }catch(e){console.error('Trade audit error',e);res.writeHead(503).end(JSON.stringify({error:'Audit unavailable'}))}
  return;
 }
 if(req.url?.startsWith('/api/paper-diagnostics?')){
  const id=Number(new URL(req.url,'http://localhost').searchParams.get('account'));
  if(!Number.isInteger(id)||id<1||id>11){res.writeHead(400).end(JSON.stringify({error:'Invalid account'}));return}
  try{res.writeHead(200).end(JSON.stringify(await db.paperDiagnostics(id)))}catch(e){console.error('Diagnostics error',e);res.writeHead(503).end(JSON.stringify({error:'Unavailable'}))}
  return;
 }
 if(req.url==='/api/paper-accounts'){try{res.writeHead(200).end(JSON.stringify({accounts:await db.paperAccounts()}))}catch(e){console.error('Paper accounts error',e);res.writeHead(503).end(JSON.stringify({error:'Unavailable'}))}return}
 if(req.url?.startsWith('/api/paper?')||req.url==='/api/paper'){
  const id=Number(new URL(req.url,'http://localhost').searchParams.get('account')??'1');
  if(!Number.isInteger(id)||id<1||id>11){res.writeHead(400).end(JSON.stringify({error:'Invalid account'}));return}
  try{const status=await db.paperStatus(id);res.writeHead(200).end(JSON.stringify(status))}catch(e){console.error('Paper status error',e);res.writeHead(503).end(JSON.stringify({error:'Unavailable'}))}return
 }
 if(req.url==='/api/research'){
  try{
   const results=[];
   for(const symbol of symbols){
    const rows=await db.recentCandles(symbol,12000);
    for(const candidate of ['squeeze','regime','sweep','quarter'] as const){
     const split=Math.floor(rows.length*.7);
     results.push({symbol,candidate,training:evaluateCandidate(rows.slice(0,split),candidate,symbol),validation:evaluateCandidate(rows.slice(split),candidate,symbol)});
    }
   }
   res.writeHead(200).end(JSON.stringify({type:'research-only',independentPaperAccounts:false,split:'chronological 70/30',results}));
  }catch(e){console.error('Research error',e);res.writeHead(503).end(JSON.stringify({error:'Research unavailable'}))}
  return;
 }
 if(req.url==='/api/backtest-compare'){
  try{
   const results=[];
   for(const symbol of symbols){const rows=await db.recentCandles(symbol,12000);for(const strategy of ['momentum','trend','reversal'] as const){const result=backtest(rows,100,strategy,symbol);results.push({symbol,bars:rows.length,from:rows[0]?.start_at??null,to:rows.at(-1)?.start_at??null,...result,holdout:walkForward(rows,strategy,symbol),tradeHistory:undefined})}}
   res.writeHead(200).end(JSON.stringify({results,method:'Momentum versus EMA trend versus RSI reversal; same fee, slippage, stop, take and sizing; 1 position per strategy'}));
  }catch(e){console.error('Backtest comparison error',e);res.writeHead(503).end(JSON.stringify({error:'Comparison unavailable'}))}
  return;
 }
 if(req.url?.startsWith('/api/backtest?')){
  const u=new URL(req.url,'http://localhost');const symbol=u.searchParams.get('symbol')??'';
  if(!symbols.includes(symbol)){res.writeHead(400).end(JSON.stringify({error:'Invalid symbol'}));return}
  try{const rows=await db.recentCandles(symbol,12000);res.writeHead(200).end(JSON.stringify({symbol,from:rows[0]?.start_at??null,to:rows.at(-1)?.start_at??null,bars:rows.length,...backtest(rows,100,'momentum',symbol)}))}
  catch(e){console.error('Backtest error',e);res.writeHead(503).end(JSON.stringify({error:'Backtest unavailable'}))}
  return;
 }
 if(req.url?.startsWith('/api/signals?')){
  const u=new URL(req.url,'http://localhost');const symbol=u.searchParams.get('symbol')??'';
  if(!symbols.includes(symbol)){res.writeHead(400).end(JSON.stringify({error:'Invalid symbol'}));return}
  try{const candles=await db.recentCandles(symbol,240);res.writeHead(200).end(JSON.stringify({symbol,at:candles.at(-1)?.start_at??null,count:candles.length,...analyze(candles)}))}
  catch(e){console.error('Signal calculation error',e);res.writeHead(503).end(JSON.stringify({error:'Signals unavailable'}))}
  return;
 }
 if(req.url?.startsWith('/api/trade-candles?')){
  const u=new URL(req.url,'http://localhost'),symbol=u.searchParams.get('symbol')??'';
  const from=Date.parse(u.searchParams.get('from')??''),to=Date.parse(u.searchParams.get('to')??'');
  if(!symbols.includes(symbol)||!Number.isFinite(from)||!Number.isFinite(to)||to<from||to-from>1440*60000||from>Date.now()+60000){
   res.writeHead(400).end(JSON.stringify({error:'Invalid symbol or time range'}));return
  }
  try{res.writeHead(200).end(JSON.stringify({symbol,candles:await db.candlesBetween(symbol,from,to)}))}
  catch(e){console.error('Trade candle error',e);res.writeHead(503).end(JSON.stringify({error:'Candles unavailable'}))}
  return;
 }
 if(req.url?.startsWith('/api/candles?')){
  const u=new URL(req.url,'http://localhost');
  const symbol=u.searchParams.get('symbol')??'';
  const rawLimit=u.searchParams.get('limit')??'180';
  const limit=Number(rawLimit);
  if(!symbols.includes(symbol)||!Number.isInteger(limit)||limit<1||limit>1500){res.writeHead(400).end(JSON.stringify({error:'Invalid symbol or limit'}));return}
  try{const candles=await db.recentCandles(symbol,limit);res.writeHead(200).end(JSON.stringify({symbol,candles}))}
  catch(e){console.error('Dashboard candle error',e);res.writeHead(503).end(JSON.stringify({error:'Data unavailable'}))}
  return;
 }
 if(req.url==='/health'){res.writeHead(200).end(JSON.stringify({status:'alive'}));return}
 if(req.url==='/ready'){
  try{await db.ping();const status=stream.status;const ready=status.connected&&status.lastDataAt>0&&Date.now()-status.lastDataAt<90000;
  res.writeHead(ready?200:503).end(JSON.stringify({ready,stream:status,symbols}));}
  catch{res.writeHead(503).end(JSON.stringify({ready:false,database:false}))}return}
 res.writeHead(404).end(JSON.stringify({error:'Not found'}));
});
server.listen(port,'0.0.0.0',()=>console.log('Listening on',port));
async function reportStats(){
 try { const stats=await db.candleStats(); console.info('CANDLE_STATS',JSON.stringify({at:new Date().toISOString(),symbols:stats})); }
 catch(e){console.error('CANDLE_STATS_ERROR',e);}
}
async function reportStorage(){
 try { console.info('STORAGE_STATS',JSON.stringify({at:new Date().toISOString(),...await db.storageStats()})); }
 catch(e){console.error('STORAGE_STATS_ERROR',e);}
}
const storageTimer=setInterval(()=>{void reportStorage()},3600000);
void reportStorage();
let repairing=false;let historyBusy=false;const historyDays=90;
async function extendHistory(){
 if(historyBusy||closing)return;historyBusy=true;
 try{
  const end=Math.floor(Date.now()/MINUTE)*MINUTE-MINUTE;
  const oldest=end-historyDays*1440*MINUTE;
  for(const symbol of symbols){
   const stats=await db.candleStats();const row=stats.find(x=>x.symbol===symbol);
   let cursor=row?.first_at?Date.parse(row.first_at):end;
   if(!Number.isFinite(cursor))continue;
   // Backfill at most 4h per symbol per 5m cycle to limit API and database load.
   const lower=Math.max(oldest,cursor-240*MINUTE);
   let added=0;
   for(let start=lower;start<cursor;start+=200*MINUTE){
    const last=Math.min(cursor-MINUTE,start+199*MINUTE);
    const bars=await fetchHistory(symbol,start,last);
    for(const bar of bars){await db.upsert(bar);added++}
   }
   // Repair holes within the already collected history without pulling all seven days at once.
   const current=await db.candleStats();
   const earliest=current.find(x=>x.symbol===symbol)?.first_at;
   let fixed=0;
   if(earliest){
    const begin=Date.parse(earliest);
    const existing=await db.existingMinutes(symbol,begin,end);
    const gaps=missingRanges(existing,begin,end).slice(0,2);
    for(const gap of gaps){
     const bars=await fetchHistory(symbol,gap.start,gap.end);
     for(const bar of bars){await db.upsert(bar);fixed++}
    }
   }
   console.info('HISTORY_STATS',JSON.stringify({symbol,added,fixed,daysTarget:historyDays}));
  }
 }catch(e){console.error('HISTORY_ERROR',e)}finally{historyBusy=false}
}
const historyTimer=setInterval(()=>{void extendHistory()},300000);
setTimeout(()=>{void extendHistory()},30000);

async function repair(){
 if(repairing||closing)return;
 repairing=true;
 try{
  const end=Math.floor(Date.now()/MINUTE)*MINUTE-MINUTE;
  const from=end-239*MINUTE;
  for(const symbol of symbols){
   const existing=await db.existingMinutes(symbol,from,end);
   const gaps=missingRanges(existing,from,end);
   let written=0;
   for(const gap of gaps){
    const candles=await fetchHistory(symbol,gap.start,gap.end);
    for(const candle of candles){await db.upsert(candle);written++;}
   }
   console.info('BACKFILL_STATS',JSON.stringify({symbol,checkedMinutes:240,gaps:gaps.length,written}));
  }
 }catch(e){console.error('BACKFILL_ERROR',e)}
 finally{repairing=false}
}
const repairTimer=setInterval(()=>{void repair()},300000);
setTimeout(()=>{void repair()},10000);
let paperRunning=false;
async function runPaper(){if(paperRunning||closing)return;paperRunning=true;try{await db.paperTick(symbols);await db.recordOriginalSnapshot();await db.runExperiments();await db.runShadow()}catch(e){console.error('PAPER_ERROR',e)}finally{paperRunning=false}}
const paperTimer=setInterval(()=>{void runPaper()},15000);setTimeout(()=>{void runPaper()},20000);
let v3Running=false;
async function runIndependentV3(){
 if(v3Running||closing)return;
 v3Running=true;
 try{
  const result=await db.runV3();
  if(result.changed||result.opened||result.closed||result.gaps)console.info('V3_TICK',JSON.stringify({at:new Date().toISOString(),...result}));
 }catch(e){console.error('V3_TICK_ERROR',e)}
 finally{v3Running=false}
}
let v5Running=false;
async function runIndependentV5(){if(v5Running||closing)return;v5Running=true;try{const result=await db.runV5();if(result.changed||result.opened||result.closed||result.gaps)console.info('V5_TICK',JSON.stringify({at:new Date().toISOString(),...result}))}catch(e){console.error('V5_TICK_ERROR',e)}finally{v5Running=false}}
const v5Timer=setInterval(()=>{void runIndependentV5()},15000);setTimeout(()=>{void runIndependentV5()},16000);
let v4Running=false;
async function runIndependentV4(){
 if(v4Running||closing)return;
 v4Running=true;
 try{const result=await db.runV4();if(result.changed||result.opened||result.closed||result.gaps)console.info('V4_TICK',JSON.stringify({at:new Date().toISOString(),...result}))}
 catch(e){console.error('V4_TICK_ERROR',e)}
 finally{v4Running=false}
}
const v4Timer=setInterval(()=>{void runIndependentV4()},15000);
setTimeout(()=>{void runIndependentV4()},14000);
const v3Timer=setInterval(()=>{void runIndependentV3()},15000);
setTimeout(()=>{void runIndependentV3()},12000);

async function reportTelemetry(){
 try{console.info('AI_FUTURES_ACCOUNTS',JSON.stringify(await db.telemetrySnapshot()));console.info('AI_FUTURES_PAIRS',JSON.stringify(await db.pairedDiagnostics()));const summarize=(report:any)=>{const accounts=report.accounts??[];return {at:report.at,configs:report.configs,active:accounts.filter((a:any)=>a.position).length,closed:accounts.reduce((n:number,a:any)=>n+Number(a.trades??0),0),wins:accounts.reduce((n:number,a:any)=>n+Number(a.wins??0),0),processed:accounts.filter((a:any)=>a.last_at).length,lastAt:accounts.reduce((max:string,a:any)=>a.last_at&&a.last_at>max?a.last_at:max,''),netRealizedPnl:accounts.reduce((n:number,a:any)=>n+Number(a.realized_pnl??0),0),fees:accounts.reduce((n:number,a:any)=>n+Number(a.fees??0),0),accounts};};const [v3,v4]=await Promise.all([db.v3Report(),db.v4Report()]);console.info('AI_FUTURES_V3',JSON.stringify(summarize(v3)));console.info('AI_FUTURES_V4',JSON.stringify(summarize(v4)))}
 catch(e){console.error('AI_FUTURES_ACCOUNTS_ERROR',e)}
}
const telemetryTimer=setInterval(()=>{void reportTelemetry()},300000);
setTimeout(()=>{void reportTelemetry()},25000);
async function reportBounceResearch(){
 try{
  const results=[];
  for(const symbol of ['SOLUSDT','ETHUSDT','BTCUSDT']){
   const rows=await db.recentCandles(symbol,4000);
   const split=Math.floor(rows.length*.7);
   const train=researchThirtyMinuteBounce(rows.slice(0,split)).results;
   const validation=researchThirtyMinuteBounce(rows.slice(split)).results;
   const ranked=validation.flatMap((cfg,i)=>[
    {direction:'LONG',...cfg,long:undefined,short:undefined,validation:cfg.long,training:train[i].long},
    {direction:'SHORT',...cfg,long:undefined,short:undefined,validation:cfg.short,training:train[i].short}
   ]).filter(x=>x.validation.trades>=3).sort((a,b)=>(b.validation.avgNetPct??-Infinity)-(a.validation.avgNetPct??-Infinity));
   results.push({symbol,candles:rows.length,trainingBars:split,validationBars:rows.length-split,bestValidation:ranked.slice(0,5).map(x=>({side:x.direction,dipPct:x.dipPct,stopPct:x.stopPct,takePct:x.takePct,training:x.training,validation:x.validation})),tested:54});
  }
  console.info('AI_FUTURES_BOUNCE30',JSON.stringify({at:new Date().toISOString(),method:'read-only 30m threshold-touch stop-first OHLC backtest; validation ranking is exploratory and subject to selection bias',results}));
 }catch(e){console.error('AI_FUTURES_BOUNCE30_ERROR',e)}
}
const bounceResearchTimer=setInterval(()=>{void reportBounceResearch()},3600000);
setTimeout(()=>{void reportBounceResearch()},45000);
const statsTimer=setInterval(()=>{void reportStats()},60000);
void reportStats();
let closing=false;async function stop(){if(closing)return;closing=true;clearInterval(statsTimer);clearInterval(storageTimer);clearInterval(repairTimer);clearInterval(historyTimer);clearInterval(paperTimer);clearInterval(telemetryTimer);clearInterval(bounceResearchTimer);clearInterval(v3Timer);clearInterval(v4Timer);clearInterval(v5Timer);server.close();await stream.stop();await db.close();}
for(const sig of ['SIGINT','SIGTERM'] as const)process.on(sig,()=>{void stop().then(()=>process.exit(0))});
