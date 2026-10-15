export type ShortTrendBar={start_at:string;close:string};

/** Only completed candles preceding the entry bar may influence this gate. */
export function shortDowntrendAtEntry(bars:readonly ShortTrendBar[]):boolean{
 if(bars.length<61)return false;
 const history=bars.slice(-61,-1);
 if(history.length!==60)return false;
 const times=history.map(b=>Date.parse(b.start_at));
 const closes=history.map(b=>Number(b.close));
 if(times.some((t,i)=>!Number.isFinite(t)||(i>0&&t-times[i-1]!==60000))
 ||closes.some(v=>!Number.isFinite(v)||v<=0)
 ||Date.parse(bars[bars.length-1].start_at)-times[59]!==60000)return false;
 const sma60=closes.reduce((a,b)=>a+b,0)/60;
 const sma15=closes.slice(-15).reduce((a,b)=>a+b,0)/15;
 return sma15<sma60&&closes[59]<sma60;
}
