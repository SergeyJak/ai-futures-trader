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
    const futureBar=Number.isFinite(lastBarMs)&&lastBarMs>now.getTime();
    const lagMinutes=Number.isFinite(lastBarMs)&&!futureBar?Math.floor((now.getTime()-lastBarMs)/60000):null;
    const qualityIssues:string[]=[];
    if(!Number.isInteger(v.closedTrades)||v.closedTrades<0)qualityIssues.push('invalid_closed_count');
    if(!Number.isInteger(v.postFixClosedTrades)||v.postFixClosedTrades<0||v.postFixClosedTrades>v.closedTrades)qualityIssues.push('invalid_postfix_count');
    if(!Number.isInteger(v.postFixWins)||v.postFixWins<0||v.postFixWins>v.postFixClosedTrades)qualityIssues.push('invalid_postfix_wins');
    if(!Number.isFinite(v.realizedNetPnl)||!Number.isFinite(v.postFixRealizedNetPnl))qualityIssues.push('invalid_pnl');
    if(!Number.isFinite(v.postFixMaxDrawdownClosed)||v.postFixMaxDrawdownClosed<0||v.postFixMaxDrawdownClosed>1)qualityIssues.push('invalid_drawdown');
    if(futureBar)qualityIssues.push('future_bar');
    if(v.last_bar!=null&&!Number.isFinite(lastBarMs))qualityIssues.push('invalid_bar_time');
    return {
     id:v.id,closed:v.closedTrades,legacyClosed:Math.max(0,v.closedTrades-v.postFixClosedTrades),
     postFixClosed:v.postFixClosedTrades,postFixNetPnl:v.postFixRealizedNetPnl,
     postFixWinRate:v.postFixClosedTrades>0?v.postFixWins/v.postFixClosedTrades:null,
     postFixMaxDrawdownClosed:v.postFixMaxDrawdownClosed,
     insufficientSample:v.postFixClosedTrades<30,
     active:typeof v.position==='object'&&v.position!==null&&!('pendingAt' in v.position),
     lastBarLagMinutes:lagMinutes,stale:lagMinutes===null||lagMinutes>3,
     qualityIssues,postFixMetricsValid:qualityIssues.length===0
    };
   })
  }))
 };
}
