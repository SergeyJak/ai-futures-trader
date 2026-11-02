import type {MarketSample,TradeBucket} from './research-data-store.js';
const BUCKET=10000,FRESH=30000,LATENESS=30000;
type Book={bids:Map<number,number>;asks:Map<number,number>;updateId:number;sequence:number;receivedAt:number;exchangeAt:number};
type Field={value:number;at:number;exchangeAt:number};
type Ticker=Map<string,Field>;
type Result={accepted:boolean;resync:boolean};
const none=():Result=>({accepted:false,resync:false});
function number(value:unknown){if((typeof value!=='string'&&typeof value!=='number')||(typeof value==='string'&&!value.trim()))return NaN;return Number(value)}
function levels(value:unknown):[number,number][]|null{
 if(!Array.isArray(value)||value.length>1000)return null;const out:[number,number][]=[];
 for(const item of value){if(!Array.isArray(item)||item.length<2)return null;const p=number(item[0]),q=number(item[1]);if(!Number.isFinite(p)||p<=0||!Number.isFinite(q)||q<0||!Number.isFinite(p*q))return null;out.push([p,q])}
 return out;
}
function trimmed(source:Map<number,number>,descending:boolean){return new Map([...source].sort((a,b)=>descending?b[0]-a[0]:a[0]-b[0]).slice(0,50))}
function validBook(b:Book){
 const bids=[...b.bids],asks=[...b.asks];if(!bids.length||!asks.length||bids[0][0]>=asks[0][0])return false;
 return [bids,asks].every(side=>Number.isFinite(side.reduce((n,[p,q])=>n+p*q,0)));
}

export class MicrostructureState{
 private symbols:Set<string>;private books=new Map<string,Book>();private tickers=new Map<string,Ticker>();
 private buckets=new Map<string,Map<number,TradeBucket>>();private ids=new Map<string,number>();
 private idsByExpiry=new Map<number,Set<string>>();
 // One bounded watermark per configured symbol preserves known loss before a bucket exists.
 private incompleteBefore=new Map<string,number>();
 private connected=false;private connectionId='';private connectedAt=0;
 private dedupLimit:number;private bucketLimit:number;
 private counters={invalidMessages:0,rejectedBooks:0,duplicateTrades:0,lateTrades:0,droppedTrades:0};
 constructor(symbols:string[],options:{dedupLimit?:number;maxBucketsPerSymbol?:number}={}){
  this.symbols=new Set(symbols);this.dedupLimit=options.dedupLimit??50000;this.bucketLimit=options.maxBucketsPerSymbol??12;
  if(!symbols.length||symbols.length>10||symbols.some(s=>!/^[A-Z0-9]{2,30}$/.test(s)))throw new Error('Invalid research symbols');
  if(!Number.isInteger(this.dedupLimit)||this.dedupLimit<1||this.dedupLimit>1000000||!Number.isInteger(this.bucketLimit)||this.bucketLimit<1||this.bucketLimit>60)throw new Error('Invalid research buffer bound');
 }
 connect(id:string,at:number){this.disconnect(at);this.connected=true;this.connectionId=id;this.connectedAt=at;}
 disconnect(_at:number){this.connected=false;this.books.clear();this.tickers.clear();for(const map of this.buckets.values())for(const bucket of map.values())bucket.streamContinuous=false;}
 private badBook(symbol:string):Result{this.books.delete(symbol);this.counters.invalidMessages++;this.counters.rejectedBooks++;return {accepted:false,resync:true};}
 ingest(payload:unknown,receivedAt:number):Result{
  if(!this.connected||!Number.isFinite(receivedAt))return none();
  if(payload===null||typeof payload!=='object'){this.counters.invalidMessages++;return none()}
  const msg=payload as Record<string,unknown>;const topic=typeof msg.topic==='string'?msg.topic:'';
  if(topic.startsWith('orderbook.50.'))return this.book(topic.slice('orderbook.50.'.length),msg,receivedAt);
  if(topic.startsWith('publicTrade.'))return this.trades(topic.slice('publicTrade.'.length),msg.data,receivedAt);
  if(topic.startsWith('tickers.'))return this.ticker(topic.slice('tickers.'.length),msg.data,receivedAt,number(msg.ts));
  return none();
 }
 private book(symbol:string,msg:Record<string,unknown>,at:number):Result{
  if(!this.symbols.has(symbol))return none();
  const d=msg.data as Record<string,unknown>|null;
  if(!d||typeof d!=='object'||d.s!==symbol||(msg.type!=='snapshot'&&msg.type!=='delta'))return this.badBook(symbol);
  const bids=levels(d.b??(msg.type==='delta'?[]:null)),asks=levels(d.a??(msg.type==='delta'?[]:null)),u=number(d.u),seq=number(d.seq),ts=number(msg.ts);
  if(!bids||!asks||!Number.isSafeInteger(u)||u<1||!Number.isSafeInteger(seq)||seq<0||!Number.isSafeInteger(ts)||ts<at-FRESH||ts>at+60000)return this.badBook(symbol);
  const previous=this.books.get(symbol);
  if(msg.type==='delta'){
   if(!previous||u===1||u<previous.updateId||seq<previous.sequence)return this.badBook(symbol);
   if(u===previous.updateId&&seq===previous.sequence)return none();
  }
  const b=msg.type==='snapshot'?new Map<number,number>():new Map(previous!.bids);
  const a=msg.type==='snapshot'?new Map<number,number>():new Map(previous!.asks);
  for(const [p,q] of bids){if(q===0)b.delete(p);else b.set(p,q)}
  for(const [p,q] of asks){if(q===0)a.delete(p);else a.set(p,q)}
  const current:Book={bids:trimmed(b,true),asks:trimmed(a,false),updateId:u,sequence:seq,receivedAt:at,exchangeAt:ts};
  if(!validBook(current))return this.badBook(symbol);
  this.books.set(symbol,current);return {accepted:true,resync:false};
 }
 private ticker(symbol:string,data:unknown,at:number,exchangeAt:number):Result{
  if(!this.symbols.has(symbol)||data===null||typeof data!=='object')return none();
  if(!Number.isSafeInteger(exchangeAt)||exchangeAt<at-FRESH||exchangeAt>at+60000){this.counters.invalidMessages++;return none()}
  const d=data as Record<string,unknown>;if(d.symbol!==symbol){this.counters.invalidMessages++;return none()}
  const ticker=this.tickers.get(symbol)??new Map<string,Field>();
  for(const key of ['markPrice','indexPrice','openInterest','fundingRate','nextFundingTime']){
   if(!(key in d))continue;const value=number(d[key]);
   const valid=Number.isFinite(value)&&(key==='fundingRate'?Math.abs(value)<=1:key==='openInterest'?value>=0:key==='nextFundingTime'?Number.isSafeInteger(value)&&value>=at&&value<=at+7*86400000:value>0);
   if(valid){if((ticker.get(key)?.exchangeAt??0)>exchangeAt){this.counters.invalidMessages++;continue}ticker.set(key,{value,at,exchangeAt})}else{ticker.delete(key);this.counters.invalidMessages++}
  }
  this.tickers.set(symbol,ticker);return {accepted:true,resync:false};
 }
 private trades(symbol:string,data:unknown,at:number):Result{
  if(!this.symbols.has(symbol))return none();
  if(!Array.isArray(data)||data.length>2000){this.counters.invalidMessages++;return none()}
  this.expireTradeIds(at);
  let accepted=false;
  for(const item of data){
   if(item===null||typeof item!=='object'){this.counters.invalidMessages++;continue}
   const d=item as Record<string,unknown>;const time=number(d.T),price=number(d.p),qty=number(d.v),notional=price*qty;
   if(d.s!==symbol||(d.S!=='Buy'&&d.S!=='Sell')||typeof d.i!=='string'||!d.i.length||d.i.length>128||!Number.isSafeInteger(time)||time>at+60000||!Number.isFinite(price)||price<=0||!Number.isFinite(qty)||qty<=0||!Number.isFinite(notional)){this.counters.invalidMessages++;continue}
   const bucketAt=Math.floor(time/BUCKET)*BUCKET;
   if(bucketAt+BUCKET+LATENESS<=at){this.counters.lateTrades++;continue}
   const id=symbol+':'+d.i;if(this.ids.has(id)){this.counters.duplicateTrades++;continue}
   const buckets=this.buckets.get(symbol)??new Map<number,TradeBucket>();
   let bucket=buckets.get(bucketAt);
   if(this.ids.size>=this.dedupLimit||(!bucket&&buckets.size>=this.bucketLimit)){
    this.counters.droppedTrades++;this.incompleteBefore.set(symbol,Math.max(this.incompleteBefore.get(symbol)??0,bucketAt+BUCKET));if(bucket)bucket.streamContinuous=false;continue;
   }
   if(!bucket){bucket={symbol,bucketAt,buys:0,sells:0,buyQuantity:0,sellQuantity:0,buyNotional:0,sellNotional:0,firstTradeAt:time,lastTradeAt:time,streamContinuous:this.connectedAt<=bucketAt&&bucketAt>=(this.incompleteBefore.get(symbol)??0)};buckets.set(bucketAt,bucket);this.buckets.set(symbol,buckets)}
   const buy=d.S==='Buy',quantity=buy?bucket.buyQuantity:bucket.sellQuantity,total=buy?bucket.buyNotional:bucket.sellNotional;
   if(!Number.isFinite(quantity+qty)||!Number.isFinite(total+notional)){bucket.streamContinuous=false;this.counters.droppedTrades++;this.incompleteBefore.set(symbol,Math.max(this.incompleteBefore.get(symbol)??0,bucketAt+BUCKET));continue}
   const expiry=bucketAt+BUCKET+LATENESS;
   this.ids.set(id,expiry);
   const expiryIds=this.idsByExpiry.get(expiry)??new Set<string>();expiryIds.add(id);this.idsByExpiry.set(expiry,expiryIds);
   bucket.firstTradeAt=Math.min(bucket.firstTradeAt,time);bucket.lastTradeAt=Math.max(bucket.lastTradeAt,time);
   if(buy){bucket.buys++;bucket.buyQuantity+=qty;bucket.buyNotional+=notional}else{bucket.sells++;bucket.sellQuantity+=qty;bucket.sellNotional+=notional}
   accepted=true;
  }
  return {accepted,resync:false};
 }
 private expireTradeIds(now:number){
  // Replays for these buckets are already rejected as late. Retaining their IDs
  // would consume the bounded cache and discard unrelated live trades.
  // Exchange event times may arrive out of order, so inspect every expiry group.
  for(const [expiry,ids] of this.idsByExpiry)if(expiry<=now){
   for(const id of ids)this.ids.delete(id);
   this.idsByExpiry.delete(expiry);
  }
 }
 sample(now:number):MarketSample[]{
  if(!this.connected)return [];const rows:MarketSample[]=[];
  for(const symbol of this.symbols){
   const b=this.books.get(symbol);if(!b||now-b.receivedAt>FRESH||now-b.exchangeAt>FRESH)continue;
   const bids=[...b.bids],asks=[...b.asks],ticker=this.tickers.get(symbol);
   const fresh=(key:string)=>{const x=ticker?.get(key);return x&&now-x.at<=FRESH&&now-x.exchangeAt<=FRESH?x.value:null};
   const times=ticker?[...ticker.values()].filter(x=>now-x.at<=FRESH&&now-x.exchangeAt<=FRESH).map(x=>x.at):[];
   rows.push({symbol,bucketAt:Math.floor(now/BUCKET)*BUCKET,observedAt:now,exchangeAt:b.exchangeAt,updateId:b.updateId,sequence:b.sequence,
    bid:bids[0][0],ask:asks[0][0],bidQuantity:bids[0][1],askQuantity:asks[0][1],bidDepthNotional:bids.reduce((n,[p,q])=>n+p*q,0),askDepthNotional:asks.reduce((n,[p,q])=>n+p*q,0),bidLevels:bids.length,askLevels:asks.length,
    markPrice:fresh('markPrice'),indexPrice:fresh('indexPrice'),openInterest:fresh('openInterest'),indicativeFundingRate:fresh('fundingRate'),nextFundingAt:fresh('nextFundingTime'),tickerObservedAt:times.length?Math.min(...times):null,connectionId:this.connectionId});
  }
  return rows;
 }
 drainTrades(now:number):TradeBucket[]{
  this.expireTradeIds(now);
  const rows:TradeBucket[]=[];
  for(const buckets of this.buckets.values())for(const [time,bucket] of buckets)if(time+BUCKET+LATENESS<=now){rows.push({...bucket});buckets.delete(time)}
  return rows.sort((a,b)=>a.bucketAt-b.bucketAt||a.symbol.localeCompare(b.symbol));
 }
 status(now:number){return {...this.counters,connected:this.connected,connectionId:this.connectionId,connectedAt:this.connected?this.connectedAt:null,
  dedupIds:this.ids.size,bufferedBuckets:[...this.buckets.values()].reduce((n,b)=>n+b.size,0),
  books:[...this.symbols].map(symbol=>{const b=this.books.get(symbol);return {symbol,ready:!!b&&this.connected&&now-b.receivedAt<=FRESH&&now-b.exchangeAt<=FRESH,lastReceivedAt:b?.receivedAt??null,lastExchangeAt:b?.exchangeAt??null}})};}
}
