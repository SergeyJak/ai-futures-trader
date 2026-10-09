import 'dotenv/config';
import http from 'node:http';import {Database} from './database.js';import {MarketStream} from './market.js';
const port=Number(process.env.PORT??3000);const url=process.env.DATABASE_URL;
const endpoint=process.env.BYBIT_PUBLIC_WS??'wss://stream.bybit.com/v5/public/linear';
const symbols=(process.env.MARKET_SYMBOLS??'BTCUSDT,ETHUSDT,SOLUSDT').split(',').map(s=>s.trim().toUpperCase());
if(!url)throw new Error('DATABASE_URL required');
if(!endpoint.startsWith('wss://'))throw new Error('Secure WebSocket required');
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port');
const db=new Database(url);await db.init();const stream=new MarketStream(endpoint,symbols,db);stream.start();
const server=http.createServer(async(req,res)=>{
 res.setHeader('content-type','application/json');
 if(req.url==='/health'){res.writeHead(200).end(JSON.stringify({status:'alive'}));return}
 if(req.url==='/ready'){
  try{await db.ping();const status=stream.status;const ready=status.connected&&status.lastDataAt>0&&Date.now()-status.lastDataAt<90000;
  res.writeHead(ready?200:503).end(JSON.stringify({ready,stream:status,symbols}));}
  catch{res.writeHead(503).end(JSON.stringify({ready:false,database:false}))}return}
 res.writeHead(404).end(JSON.stringify({error:'Not found'}));
});
server.listen(port,'0.0.0.0',()=>console.log('Listening on',port));
let closing=false;async function stop(){if(closing)return;closing=true;server.close();await stream.stop();await db.close();}
for(const sig of ['SIGINT','SIGTERM'] as const)process.on(sig,()=>{void stop().then(()=>process.exit(0))});
