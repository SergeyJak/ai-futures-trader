import {EXPERIMENT_KEYS} from './strategy-paper.js';
import type {StrategyKey} from './strategy-pages.js';

type Variant={
 id:string;position?:unknown;last_bar?:string|Date|null;
 closedTrades:number;realizedNetPnl:number;postFixClosedTrades:number;
 postFixRealizedNetPnl:number;postFixWins:number;postFixMaxDrawdownClosed:number;
};
type Report={variants:Variant[];realOrders:boolean;funding:string};

/** Compact read-only production evidence; never mix legacy and corrected execution PnL. */
export function summarizeStrategyPaperTelemetry(reports:Record<StrategyKey,Report>,now=new Date()){
 return {
  at:now.toISOString(),mode:'forward-paper-only',realOrders:false,
  funding:'excluded from realized PnL',
  strategies:EXPERIMENT_KEYS.map(key=>({
   strategy:key,
   variants:reports[key].variants.map(v=>{
    const lastBarMs=v.last_bar==null?NaN:new Date(v.last_bar).getTime();
    const lagMinutes=Number.isFinite(lastBarMs)?Math.max(0,Math.floor((now.getTime()-lastBarMs)/60000)):null;
    return {
     id:v.id,closed:v.closedTrades,legacyClosed:Math.max(0,v.closedTrades-v.postFixClosedTrades),
     postFixClosed:v.postFixClosedTrades,postFixNetPnl:v.postFixRealizedNetPnl,
     postFixWinRate:v.postFixClosedTrades>0?v.postFixWins/v.postFixClosedTrades:null,
     postFixMaxDrawdownClosed:v.postFixMaxDrawdownClosed,
     insufficientSample:v.postFixClosedTrades<30,
     active:typeof v.position==='object'&&v.position!==null&&!('pendingAt' in v.position),
     lastBarLagMinutes:lagMinutes,stale:lagMinutes===null||lagMinutes>3
    };
   })
  }))
 };
}
