import 'dotenv/config';
import http from 'node:http';import {analyze} from './indicators.js';import {dashboardHtml} from './dashboard.js';import {MINUTE,missingRanges,fetchHistory} from './backfill.js';import {Database} from './database.js';import {MarketStream} from './market.js';
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
let repairing=false;
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
const statsTimer=setInterval(()=>{void reportStats()},60000);
void reportStats();
let closing=false;async function stop(){if(closing)return;closing=true;clearInterval(statsTimer);clearInterval(storageTimer);clearInterval(repairTimer);server.close();await stream.stop();await db.close();}
for(const sig of ['SIGINT','SIGTERM'] as const)process.on(sig,()=>{void stop().then(()=>process.exit(0))});
