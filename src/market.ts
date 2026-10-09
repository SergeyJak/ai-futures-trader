import WebSocket from 'ws';
import {parseCandle} from './candles.js';
import type {Database} from './database.js';
export class MarketStream{
 private socket?:WebSocket;private stopped=false;private timer?:ReturnType<typeof setTimeout>;private ping?:ReturnType<typeof setInterval>;private attempt=0;private latest=0;private queue=Promise.resolve();
 constructor(private url:string,private symbols:string[],private db:Database){}
 get status(){return {connected:this.socket?.readyState===WebSocket.OPEN,lastDataAt:this.latest}}
 start(){this.stopped=false;this.connect()}
 private connect(){if(this.stopped)return;const ws=new WebSocket(this.url,{handshakeTimeout:10000});this.socket=ws;
 ws.on('open',()=>{this.attempt=0;console.log('Market stream connected');ws.send(JSON.stringify({op:'subscribe',args:this.symbols.map(x=>'kline.1.'+x)}));
 this.ping=setInterval(()=>{if(ws.readyState===WebSocket.OPEN){ws.send(JSON.stringify({op:'ping'}));if(this.latest&&Date.now()-this.latest>90000)ws.terminate()}},20000)});
 ws.on('message',raw=>{let candles;try{candles=parseCandle(JSON.parse(raw.toString()),new Set(this.symbols))}catch(e){console.warn('Discarded market payload',String(e));return}
 if(!candles.length)return;this.latest=Date.now();
 for(const c of candles)this.queue=this.queue.then(()=>this.db.upsert(c)).catch(e=>{console.error('Persistence failed',e);ws.terminate()})});
 ws.on('error',e=>console.error('WebSocket error',e.message));
 ws.on('close',()=>{if(this.ping)clearInterval(this.ping);if(this.stopped)return;this.latest=0;
 const wait=Math.min(30000,1000*2**Math.min(this.attempt++,5));this.timer=setTimeout(()=>this.connect(),wait+Math.floor(Math.random()*500))})}
 async stop(){this.stopped=true;if(this.timer)clearTimeout(this.timer);if(this.ping)clearInterval(this.ping);this.socket?.close();await this.queue}
}