/** Research-only forward candle exit simulation. Never use provider's actual exit to pick a strategy. */
import type {BacktestConfig,CompletedTrade} from './v6-oos-backtest.js';
import {DEFAULT_OOS_CONFIG} from './v6-oos-backtest.js';
export type ExitCandle={startMs:number;open:number;high:number;low:number;close:number};
export type ExitPolicy={kind:'time';minutes:30|240}|{kind:'bracket';stopPct:number;takePct:number;maxMinutes:number};
export type ReplayResult={status:'evaluated';exitMs:number;exitPrice:number;reason:'time'|'stop'|'take'|'both_hit_stop_first';netReturn:number}|{status:'insufficient_candles'|'invalid_input';reason:string};
/** Conservative execution: the first fully subsequent candle begins no earlier than the observed entry.
 * A candle touching both stop and take is counted as a stop, never an optimistic take.
 * An incomplete minute or any missing minute invalidates the simulation.
 */
export function replayV6Exit(trade:Pick<CompletedTrade,'openedMs'|'side'|'entry'>,candles:ExitCandle[],policy:ExitPolicy,costs:BacktestConfig=DEFAULT_OOS_CONFIG):ReplayResult{
 if(!Number.isSafeInteger(trade.openedMs)||trade.openedMs<=0||!Number.isFinite(trade.entry)||trade.entry<=0||!['LONG','SHORT'].includes(trade.side)||!Number.isFinite(costs.feePerSide)||!Number.isFinite(costs.slippagePerSide)||costs.feePerSide<0||costs.slippagePerSide<0)return {status:'invalid_input',reason:'Invalid entry or costs'};
 const minutes=policy.kind==='time'?policy.minutes:policy.maxMinutes;
 if(!Number.isSafeInteger(minutes)||minutes<1||minutes>10080||policy.kind==='bracket'&&(!Number.isFinite(policy.stopPct)||!Number.isFinite(policy.takePct)||policy.stopPct<=0||policy.takePct<=0||policy.stopPct>=1))return {status:'invalid_input',reason:'Invalid exit policy'};
 const start=Math.ceil(trade.openedMs/60000)*60000;
 const byTime=new Map(candles.map(c=>[c.startMs,c]));
 if(byTime.size!==candles.length||candles.some(c=>!Number.isSafeInteger(c.startMs)||c.startMs%60000!==0))return {status:'insufficient_candles',reason:'Duplicate or invalid candle timestamps'};
 const dir=trade.side==='LONG'?1:-1;
 for(let i=0;i<minutes;i++){
  const ms=start+i*60000,c=byTime.get(ms);
  if(!c||![c.open,c.high,c.low,c.close].every(x=>Number.isFinite(x)&&x>0)||c.low>c.high||c.open<c.low||c.open>c.high||c.close<c.low||c.close>c.high)return {status:'insufficient_candles',reason:'Missing or invalid confirmed minute candle'};
  let exit:number|undefined;let reason:'time'|'stop'|'take'|'both_hit_stop_first'='time';
  if(policy.kind==='bracket'){
   const stop=trade.entry*(1-dir*policy.stopPct),take=trade.entry*(1+dir*policy.takePct);
   // At a gap, execute at the opening price when worse than the intended stop.
   const stopHit=dir===1?c.low<=stop:c.high>=stop;
   const takeHit=dir===1?c.high>=take:c.low<=take;
   if(stopHit){exit=dir===1?Math.min(stop,c.open):Math.max(stop,c.open);reason=takeHit?'both_hit_stop_first':'stop'}
   else if(takeHit){exit=take;reason='take'}
  }
  if(exit===undefined&&i===minutes-1){exit=c.close;reason='time'}
  if(exit!==undefined)return {status:'evaluated',exitMs:ms+60000,exitPrice:exit,reason,netReturn:dir*(exit/trade.entry-1)-2*(costs.feePerSide+costs.slippagePerSide)};
 }
 return {status:'insufficient_candles',reason:'No exit'};
}
