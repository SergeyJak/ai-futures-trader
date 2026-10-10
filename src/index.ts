import 'dotenv/config';
import http from 'node:http';import {backtest} from './backtest.js';
import {walkForward} from './walkforward.js';import {analyze} from './indicators.js';import {dashboardHtml} from './dashboard.js';import {MINUTE,missingRanges,fetchHistory} from './backfill.js';import {Database} from './database.js';import {MarketStream} from './market.js';
const port=Number(process.env.PORT??3000);const url=process.env.DATABASE_URL;
const endpoint=process.env.BYBIT_PUBLIC_WS??'wss://stream.bybit.com/v5/public/linear';
const symbols=(process.env.MARKET_SYMBOLS??'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map(s=>s.trim().toUpperCase());
if(!url)throw new Error('DATABASE_URL required');
if(!endpoint.startsWith('wss://'))throw new Error('Secure WebSocket required');
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
const db=new Database(url);await db.init();const stream=new MarketStream(endpoint,symbols,db);stream.start();
const server=http.createServer(async(req,res)=>{
 res.setHeader('cache-control','no-store');
 res.setHeader('x-content-type-options','nosniff');
 res.setHeader('referrer-policy','no-referrer');
 if(req.url==='/'||req.url==='/dashboard'){res.setHeader('content-type','text/html; charset=utf-8');res.setHeader('content-security-policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'");res.writeHead(200).end(dashboardHtml);return}
 res.setHeader('content-type','application/json');
 if(req.url==='/api/overview'){
  try{const [stats,storage]=await Promise.all([db.candleStats(),db.storageStats()]);res.writeHead(200).end(JSON.stringify({symbols:stats,storage,stream:stream.status,updatedAt:new Date().toISOString()}))}
  catch(e){console.error('Dashboard overview error',e);res.writeHead(503).end(JSON.stringify({error:'Data unavailable'}))}
  return;
 }
 if(req.url==='/api/paper'){try{const status=await db.paperStatus();res.writeHead(200).end(JSON.stringify(status))}catch(e){console.error('Paper status error',e);res.writeHead(503).end(JSON.stringify({error:'Unavailable'}))}return}
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
async function runPaper(){if(paperRunning||closing)return;paperRunning=true;try{await db.paperTick(symbols)}catch(e){console.error('PAPER_ERROR',e)}finally{paperRunning=false}}
const paperTimer=setInterval(()=>{void runPaper()},15000);setTimeout(()=>{void runPaper()},20000);
const statsTimer=setInterval(()=>{void reportStats()},60000);
void reportStats();
let closing=false;async function stop(){if(closing)return;closing=true;clearInterval(statsTimer);clearInterval(storageTimer);clearInterval(repairTimer);clearInterval(historyTimer);clearInterval(paperTimer);server.close();await stream.stop();await db.close();}
for(const sig of ['SIGINT','SIGTERM'] as const)process.on(sig,()=>{void stop().then(()=>process.exit(0))});
