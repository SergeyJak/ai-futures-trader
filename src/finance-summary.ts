export function summarizeFinance(accounts: Array<{balance:number|string;trades?:number;wins?:number;fees?:number;max_drawdown_closed?:number}>){
 const positive=accounts.filter(a=>Number(a.balance)>100).length;
 return {accounts:accounts.length,positive,net:accounts.reduce((n,a)=>n+Number(a.balance)-100,0),closedTrades:accounts.reduce((n,a)=>n+(a.trades??0),0),fees:accounts.every(a=>a.fees!==undefined)?accounts.reduce((n,a)=>n+(a.fees??0),0):null,maxClosedDrawdown:accounts.some(a=>a.max_drawdown_closed!==undefined)?Math.max(...accounts.map(a=>a.max_drawdown_closed??0)):null};
}
