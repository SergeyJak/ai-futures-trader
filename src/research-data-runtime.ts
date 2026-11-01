import pg from 'pg';
import WebSocket from 'ws';
import {ResearchDataStore,type MarketSample,type TradeBucket} from './research-data-store.js';
import {fetchFundingHistory,FundingHttpError,type FundingFetcher} from './research-funding.js';
import {MicrostructureState} from './research-microstructure.js';

export type ResearchDataConfig={enabled:boolean;symbols:string[];wsUrl:string;retentionDays:number;takerFeeRate:number;makerFeeRate:number};
export function researchDataConfig(env:NodeJS.ProcessEnv,symbols:string[],wsUrl:string):ResearchDataConfig{
 const url=new URL(wsUrl);if(url.protocol!=='wss:'||url.username||url.password||url.pathname!=='/v5/public/linear')throw new Error('Research requires a secure public linear WebSocket');
 if(!symbols.length||new Set(symbols).size!==symbols.length||symbols.length>10||symbols.some(s=>!/^[A-Z0-9]{2,30}$/.test(s)))throw new Error('Invalid research symbols (maximum 10)');
 if(env.RESEARCH_DATA_ENABLED!==undefined&&!['true','false'].includes(env.RESEARCH_DATA_ENABLED))throw new Error('RESEARCH_DATA_ENABLED must be true or false');
 const retentionDays=Number(env.RESEARCH_DATA_RETENTION_DAYS??7);
 if(!Number.isInteger(retentionDays)||retentionDays<1||retentionDays>30)throw new Error('Research retention must be 1..30 days');
 const takerFeeRate=Number(env.RESEARCH_TAKER_FEE_RATE??.0006),makerFeeRate=Number(env.RESEARCH_MAKER_FEE_RATE??.0002);
 if(![takerFeeRate,makerFeeRate].every(x=>Number.isFinite(x)&&x>=0&&x<=.01))throw new Error('Research fee assumptions must be rates from 0 to 0.01');
 return {enabled:env.RESEARCH_DATA_ENABLED!=='false',symbols:[...symbols],wsUrl,retentionDays,takerFeeRate,makerFeeRate};
}
export interface ResearchSocket{
 readyState:number;on(event:string,listener:(...args:any[])=>void):unknown;send(data:string):unknown;close():unknown;terminate():unknown;
}
type Sink=Pick<ResearchDataStore,'init'|'writeSamples'|'writeTradeBuckets'|'writeFunding'|'saveStatus'|'prune'>;
type Dependencies={socketFactory?:(url:string)=>ResearchSocket;now?:()=>number;fetcher?:FundingFetcher;closeStore?:()=>Promise<void>};
type Batch={samples:MarketSample[];trades:TradeBucket[];createdAt:number};
const errorText=(error:unknown)=>(error instanceof Error?error.message:String(error)).slice(0,240);

export class ResearchDataRuntime{
 private state:MicrostructureState;private now:()=>number;private socketFactory:(url:string)=>ResearchSocket;private fetcher:FundingFetcher;
 private socket?:ResearchSocket;private stopped=true;private started=false;private storageReady=false;private timers:ReturnType<typeof setInterval>[]=[];private reconnect?:ReturnType<typeof setTimeout>;
 private abort=new AbortController();private attempt=0;private connection=0;private lastTransportAt=0;
 private flushTask?:Promise<void>;private fundingTask?:Promise<void>;private pruneTask?:Promise<void>;private stopTask?:Promise<void>;private pending?:Batch;
 private skippedFlushes=0;private droppedPersistenceRows=0;private missingSampleObservations=0;private shutdownDiscardedBuckets=0;
 private lastPersistedAt:number|null=null;private fundingRetryAt=0;private fundingLastAttempt:number|null=null;private fundingLastSuccess:number|null=null;
 private fundingCoverage:Record<string,unknown>={};private lastError:string|null=null;private lastSocketError:string|null=null;private lastFundingError:string|null=null;private lastPruneError:string|null=null;
 constructor(private config:ResearchDataConfig,private store:Sink,private dependencies:Dependencies={}){
  this.state=new MicrostructureState(config.symbols);this.now=dependencies.now??Date.now;this.fetcher=dependencies.fetcher??fetch;
  this.socketFactory=dependencies.socketFactory??(url=>new WebSocket(url,{handshakeTimeout:10000,maxPayload:2*1024*1024}));
 }
 get status(){return {enabled:this.config.enabled,storageReady:this.storageReady,stopped:this.stopped,skippedFlushes:this.skippedFlushes,droppedPersistenceRows:this.droppedPersistenceRows,missingSampleObservations:this.missingSampleObservations,shutdownDiscardedBuckets:this.shutdownDiscardedBuckets,
  pendingRows:this.pending?this.pending.samples.length+this.pending.trades.length:0,lastPersistedAt:this.lastPersistedAt,lastError:this.lastError,lastSocketError:this.lastSocketError,
  fundingRetryAt:this.fundingRetryAt,fundingLastAttempt:this.fundingLastAttempt,fundingLastSuccess:this.fundingLastSuccess,lastFundingError:this.lastFundingError,fundingCoverage:this.fundingCoverage,lastPruneError:this.lastPruneError,
  bucketSeconds:10,latenessSeconds:30,retentionDays:this.config.retentionDays,microstructure:this.state.status(this.now())};}
 async start(){
  if(this.started)return;this.started=true;this.stopped=false;
  if(!this.config.enabled)return;
  try{await this.store.init();if(this.stopped)return;this.storageReady=true}catch(e){this.lastError='Schema initialization: '+errorText(e);console.error('RESEARCH_DATA_INIT_ERROR',this.lastError);return}
  this.connect();
  this.every(10000,()=>{void this.flush()});this.every(20000,()=>this.heartbeat());
  this.every(600000,()=>{void this.fundingOnce()});this.every(3600000,()=>{void this.pruneOnce()});
  void this.fundingOnce();void this.pruneOnce();
 }
 private every(ms:number,fn:()=>void){const timer=setInterval(fn,ms);timer.unref();this.timers.push(timer);}
 private connect(){
  if(this.stopped||!this.storageReady)return;
  let ws:ResearchSocket;try{ws=this.socketFactory(this.config.wsUrl)}catch(e){this.lastSocketError=errorText(e);this.scheduleReconnect();return}
  this.socket=ws;
  ws.on('open',()=>{
   if(this.stopped||this.socket!==ws){ws.terminate();return}
   this.lastTransportAt=this.now();this.state.connect(`${this.now()}-${++this.connection}`,this.now());
   try{ws.send(JSON.stringify({op:'subscribe',args:this.config.symbols.flatMap(s=>['orderbook.50.'+s,'publicTrade.'+s,'tickers.'+s])}))}catch(e){this.lastSocketError=errorText(e);ws.terminate()}
  });
  ws.on('message',(raw:unknown)=>{
   if(this.stopped||this.socket!==ws)return;this.lastTransportAt=this.now();
   let payload:unknown;try{payload=JSON.parse(String(raw))}catch{this.state.ingest(null,this.now());return}
   if(payload&&typeof payload==='object'&&(payload as {success?:boolean}).success===false){this.lastSocketError='Public subscription rejected';ws.terminate();return}
   const result=this.state.ingest(payload,this.now());if(result.accepted){this.attempt=0;this.lastSocketError=null}if(result.resync)ws.terminate();
  });
  ws.on('error',(e:unknown)=>{if(this.socket===ws){this.lastSocketError=errorText(e);ws.terminate()}});
  ws.on('close',()=>{if(this.socket!==ws)return;this.state.disconnect(this.now());this.socket=undefined;if(!this.stopped)this.scheduleReconnect()});
 }
 private scheduleReconnect(){
  if(this.stopped||this.reconnect)return;
  const wait=Math.min(30000,1000*2**Math.min(this.attempt++,5));
  this.reconnect=setTimeout(()=>{this.reconnect=undefined;this.connect()},wait);this.reconnect.unref();
 }
 private heartbeat(){
  const ws=this.socket;if(this.stopped||!ws||ws.readyState!==1)return;
  const status=this.state.status(this.now());const staleBooks=status.connectedAt!==null&&this.now()-status.connectedAt>30000&&status.books.some(b=>!b.ready);
  if(this.now()-this.lastTransportAt>60000||staleBooks){this.lastSocketError='Stale public research feed';ws.terminate();return}
  try{ws.send(JSON.stringify({op:'ping'}))}catch(e){this.lastSocketError=errorText(e);ws.terminate()}
 }
 async flush(){
  if(this.stopped||!this.storageReady)return;
  if(this.flushTask){this.skippedFlushes++;return this.flushTask}
  this.flushTask=this.persist().catch(e=>{this.lastError=errorText(e);console.error('RESEARCH_DATA_PERSIST_ERROR',this.lastError)}).finally(()=>{this.flushTask=undefined});
  return this.flushTask;
 }
 private async persist(){
  const now=this.now();
  if(this.pending&&now-this.pending.createdAt>60000){this.droppedPersistenceRows+=this.pending.samples.length+this.pending.trades.length;this.pending=undefined}
  if(!this.pending){const samples=this.state.sample(now);this.missingSampleObservations+=this.config.symbols.length-samples.length;this.pending={samples,trades:this.state.drainTrades(now),createdAt:now}}
  const batch=this.pending;await this.store.writeSamples(batch.samples);await this.store.writeTradeBuckets(batch.trades);
  this.pending=undefined;this.lastPersistedAt=this.now();this.lastError=null;
  if(!this.stopped)await this.store.saveStatus('public-research-runtime',this.status);
 }
 async fundingOnce(){
  if(this.stopped||!this.storageReady||this.now()<this.fundingRetryAt)return;
  if(this.fundingTask)return this.fundingTask;
  this.fundingTask=this.collectFunding().catch(e=>{if(!this.stopped)this.lastFundingError=errorText(e)}).finally(()=>{this.fundingTask=undefined});return this.fundingTask;
 }
 private async collectFunding(){
  const now=this.now();this.fundingLastAttempt=now;this.lastFundingError=null;this.fundingRetryAt=0;
  for(let i=0;i<this.config.symbols.length;i++){
   if(this.stopped)break;const symbol=this.config.symbols[i];
   try{
    const result=await fetchFundingHistory(symbol,now,this.fetcher,this.abort.signal);if(this.stopped)break;
    await this.store.writeFunding(result.rows);this.fundingLastSuccess=this.now();
    this.fundingCoverage[symbol]={at:this.now(),requestedFrom:result.requestedFrom,requestedTo:result.requestedTo,rows:result.rows.length,pages:result.pages,complete:result.complete,reason:result.reason??null,invalidRecords:result.invalidRecords,duplicateRecords:result.duplicateRecords};
   }catch(e){
    if(this.stopped)break;this.lastFundingError=errorText(e);this.fundingCoverage[symbol]={at:this.now(),error:this.lastFundingError,complete:false};
    if(e instanceof FundingHttpError&&(e.status===403||e.status===429)){
     this.fundingRetryAt=this.now()+3600000;
     for(const skipped of this.config.symbols.slice(i+1))this.fundingCoverage[skipped]={at:this.now(),complete:false,reason:'provider-cooldown'};
     break;
    }
   }
  }
  if(!this.stopped)await this.store.saveStatus('public-research-funding',this.status);
 }
 async pruneOnce(){
  if(this.stopped||!this.storageReady)return;if(this.pruneTask)return this.pruneTask;
  this.pruneTask=this.store.prune(this.now(),this.config.retentionDays).then(()=>{this.lastPruneError=null}).catch(e=>{this.lastPruneError=errorText(e)}).finally(()=>{this.pruneTask=undefined});return this.pruneTask;
 }
 async stop(){
  if(this.stopTask)return this.stopTask;
  this.stopTask=this.shutdown();return this.stopTask;
 }
 private async shutdown(){
  this.stopped=true;for(const timer of this.timers)clearInterval(timer);this.timers=[];if(this.reconnect)clearTimeout(this.reconnect);this.reconnect=undefined;
  this.abort.abort(new Error('Research collector stopped'));this.shutdownDiscardedBuckets=this.state.status(this.now()).bufferedBuckets;this.state.disconnect(this.now());
  this.socket?.terminate();
  await Promise.allSettled([this.flushTask,this.fundingTask,this.pruneTask].filter((p):p is Promise<void>=>!!p));
  if(this.pending){this.droppedPersistenceRows+=this.pending.samples.length+this.pending.trades.length;this.pending=undefined}
  if(this.storageReady)try{await this.store.saveStatus('public-research-runtime',this.status)}catch(e){this.lastError=errorText(e)}
  await this.dependencies.closeStore?.();
 }
}

export function createResearchData(config:ResearchDataConfig,databaseUrl:string){
 const pool=new pg.Pool({connectionString:databaseUrl,max:2,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:6000,idleTimeoutMillis:10000});
 pool.on('error',error=>console.error('RESEARCH_POOL_ERROR',error.message));
 const store=new ResearchDataStore(pool);const runtime=new ResearchDataRuntime(config,store,{closeStore:()=>pool.end()});
 return {config,store,runtime};
}
