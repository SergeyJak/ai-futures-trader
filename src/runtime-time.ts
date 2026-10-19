export function minutesSince(timestamp:number,now:number){return Math.max(0,Math.round((now-timestamp)/60000))}
