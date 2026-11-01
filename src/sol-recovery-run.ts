import 'dotenv/config';
import pg from 'pg';
import {recoveryBacktest,type Bar,type Trade} from './sol-recovery-breakout.js';
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,statement_timeout:120000});
function report(trades:Trade[]){
 let equity=100,peak=100,dd=0;
 for(const t of trades){equity+=t.netPct;peak=Math.max(peak,equity);dd=Math.max(dd,100*(peak-equity)/peak)}
 return {trades:trades.length,netPctOn100:equity-100,maxDrawdownPct:dd,winRate:trades.length?trades.filter(t=>t.netPct>0).length/trades.length:null};
}
try{
 const client=await pool.connect();
 try{
  await client.query('BEGIN READ ONLY');
  const r=await client.query('SELECT (EXTRACT(EPOCH FROM start_at)*1000)::bigint::text AS time,open::text,high::text,low::text,close::text,volume::text FROM market_candles WHERE symbol=$1 AND confirmed=true ORDER BY start_at',['SOLUSDT']);
  const bars:Bar[]=r.rows.map(x=>({time:Number(x.time),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),volume:Number(x.volume)}));
  const a=Math.floor(bars.length*.6),b=Math.floor(bars.length*.8);
  const groups=[bars.slice(0,a),bars.slice(a,b),bars.slice(b)];
  const results=groups.map((group,i)=>{const trades=recoveryBacktest(group);return {split:['discovery','validation','holdout'][i],...report(trades),top20: i===0?[...trades].sort((x,y)=>y.netPct-x.netPct).slice(0,20):undefined,bottom20:i===0?[...trades].sort((x,y)=>x.netPct-y.netPct).slice(0,20):undefined}});
  console.log(JSON.stringify({mode:'read-only-historical-research',fundingIncluded:false,feesIncluded:true,slippageIncluded:true,results,holdoutDecision:results[2].trades<30?'INSUFFICIENT_DATA':results[2].netPctOn100>0?'FURTHER_REVIEW':'REJECT'},null,2));
 }finally{await client.query('ROLLBACK');client.release()}
}finally{await pool.end()}
