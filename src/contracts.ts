export const CONTRACT_RULES={
 BTCUSDT:{minQty:0.001,qtyStep:0.001},
 ETHUSDT:{minQty:0.01,qtyStep:0.01},
 SOLUSDT:{minQty:0.1,qtyStep:0.1}
} as const;
export type ContractSymbol=keyof typeof CONTRACT_RULES;
export function feasibleQuantity(symbol:string,entry:number,equity:number,riskFraction=.005,stopFraction=.006,fee=.0006){
 const rules=CONTRACT_RULES[symbol as ContractSymbol];
 if(!rules||!Number.isFinite(entry)||entry<=0||!Number.isFinite(equity)||equity<=0)return 0;
 const exposure=Math.min(equity*riskFraction/stopFraction,equity/(1+fee));
 const steps=Math.floor(exposure/entry/rules.qtyStep+1e-9);
 const rounded=Number((steps*rules.qtyStep).toFixed(8));
 return rounded+1e-10>=rules.minQty&&rounded*entry*(1+fee)<=equity+1e-8?rounded:0;
}
