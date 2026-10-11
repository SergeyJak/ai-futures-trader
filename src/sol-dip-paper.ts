import type pg from 'pg';
export const SOL_VARIANTS=[{id:'30m',label:'30 минут',minutes:30},{id:'4h',label:'4 часа',minutes:240},{id:'unlimited',label:'До стопа или тейка',minutes:null}] as const;
const fee=.0006,slip=.0003,stop=.01,target=.02;
export function dipSignal(bars:{close:number}[]){if(bars.length<4)return false;const b=bars.slice(-4);return b[2].close/b[0].close<=.995&&b[3].close>b[2].close}
export function exitDecision(position:{entry:number;entryAt:number},bar:{time:number;high:number;low:number;close:number},minutes:number|null){
 if(bar.low<=position.entry*(1-stop))return {reason:'STOP',price:Math.min(bar.close,position.entry*(1-stop))};
 if(bar.high>=position.entry*(1+target))return {reason:'TAKE',price:position.entry*(1+target)};
 if(minutes!==null&&bar.time-position.entryAt>=minutes*60000)return {reason:'TIME',price:bar.close};
 return null;
}
export async function initSolPaper(pool:pg.Pool){
 await pool.query(`CREATE TABLE IF NOT EXISTS sol_dip_accounts(id TEXT PRIMARY KEY,balance DOUBLE PRECISION NOT NULL DEFAULT 100,position JSONB,last_bar TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await pool.query(`CREATE TABLE IF NOT EXISTS sol_dip_trades(id BIGSERIAL PRIMARY KEY,variant TEXT NOT NULL,entry_at TIMESTAMPTZ NOT NULL,exit_at TIMESTAMPTZ NOT NULL,entry_price DOUBLE PRECISION NOT NULL,exit_price DOUBLE PRECISION NOT NULL,net_pnl DOUBLE PRECISION NOT NULL,reason TEXT NOT NULL)`);
 for(const v of SOL_VARIANTS)await pool.query('INSERT INTO sol_dip_accounts(id) VALUES($1) ON CONFLICT DO NOTHING',[v.id]);
 await pool.query(`CREATE TABLE IF NOT EXISTS sol_dip_signal_audit(bar_time TIMESTAMPTZ PRIMARY KEY, signal BOOLEAN NOT NULL, dip_pct DOUBLE PRECISION NOT NULL, bounce_pct DOUBLE PRECISION NOT NULL, recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
}
type Bar={time:number;open:number;high:number;low:number;close:number};
export async function tickSolPaper(pool:pg.Pool){
 const client=await pool.connect();try{
 await client.query('BEGIN');
 const r=await client.query(`SELECT start_at,open,high,low,close FROM market_candles WHERE symbol='SOLUSDT' AND confirmed=true ORDER BY start_at DESC LIMIT 6`);
 const bars:Bar[]=r.rows.reverse().map(x=>({time:new Date(x.start_at).getTime(),open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close)}));
 if(bars.length<5||Date.now()-bars.at(-1)!.time>180000||bars.some((x,i)=>i>0&&x.time-bars[i-1].time!==60000)){await client.query('COMMIT');return}
 const bar=bars.at(-1)!;
 if(!bars.every(x=>Number.isFinite(x.close)&&x.close>0&&Number.isFinite(x.high)&&Number.isFinite(x.low))){await client.query('COMMIT');return}
 const signal=dipSignal(bars.slice(-4));const recent=bars.slice(-4);
 await client.query('INSERT INTO sol_dip_signal_audit(bar_time,signal,dip_pct,bounce_pct) VALUES(to_timestamp($1/1000.0),$2,$3,$4) ON CONFLICT DO NOTHING',[bar.time,signal,(recent[2].close/recent[0].close-1)*100,(recent[3].close/recent[2].close-1)*100]);
 for(const variant of SOL_VARIANTS){
  const a=await client.query('SELECT balance,position,last_bar FROM sol_dip_accounts WHERE id=$1 FOR UPDATE',[variant.id]);const row=a.rows[0];
  if(row.last_bar&&new Date(row.last_bar).getTime()>=bar.time)continue;
  if(row.last_bar&&bar.time-new Date(row.last_bar).getTime()>120000){await client.query('UPDATE sol_dip_accounts SET last_bar=to_timestamp($2/1000.0) WHERE id=$1',[variant.id,bar.time]);continue}
  let balance=Number(row.balance),position=row.position as {entry:number;entryAt:number;quantity:number}|null;
  if(position){const decision=bar.time<=position.entryAt?null:exitDecision(position,bar,variant.minutes);if(decision){const exitPrice=decision.price*(1-slip);const netPnl=position.quantity*(exitPrice-position.entry)-fee*position.quantity*(position.entry+exitPrice);balance+=netPnl;await client.query('INSERT INTO sol_dip_trades(variant,entry_at,exit_at,entry_price,exit_price,net_pnl,reason) VALUES($1,to_timestamp($2/1000.0),to_timestamp($3/1000.0),$4,$5,$6,$7)',[variant.id,position.entryAt,bar.time,position.entry,exitPrice,netPnl,decision.reason]);position=null}}
  else if(row.last_bar&&signal){const entry=bar.close*(1+slip);position={entry,entryAt:bar.time+60000,quantity:Math.max(0,balance)*.1/entry}}
  await client.query('UPDATE sol_dip_accounts SET balance=$2,position=$3,last_bar=to_timestamp($4/1000.0) WHERE id=$1',[variant.id,balance,position===null?null:JSON.stringify(position),bar.time]);
 }
 await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
export async function solPaperReport(pool:pg.Pool){const a=await pool.query('SELECT id,balance,position,last_bar,created_at FROM sol_dip_accounts ORDER BY id');const t=await pool.query('SELECT variant,entry_at,exit_at,entry_price,exit_price,net_pnl,reason FROM sol_dip_trades ORDER BY id DESC LIMIT 60');const audit=await pool.query('SELECT COUNT(*)::int AS checked,COUNT(*) FILTER(WHERE signal)::int AS signals,MAX(bar_time) AS latest FROM sol_dip_signal_audit');return {symbol:'SOLUSDT',mode:'forward-paper-only',realOrders:false,signalAudit:audit.rows[0],startingBalance:100,feeRate:fee,slippageRate:slip,stopLoss:stop,takeProfit:target,variants:SOL_VARIANTS.map(v=>({...v,...a.rows.find(x=>x.id===v.id),trades:t.rows.filter(x=>x.variant===v.id)}))}}
export const solPaperHtml=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SOL · Dip Reversal</title><style>body{margin:0;background:#f5f7fb;color:#172338;font:15px system-ui}main{max-width:1080px;margin:20px auto;padding:14px}h1{font-size:25px}.muted{color:#65758b}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{background:white;border:1px solid #e1e8f2;border-radius:16px;padding:18px}.num{font-size:27px;font-weight:750}small{color:#6c7d91}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:9px;border-bottom:1px solid #e7edf5}@media(max-width:720px){.grid{grid-template-columns:1fr}}</style></head><body><main><h1>SOL · Dip Reversal</h1><p class="muted">Три независимых виртуальных счёта на актуальных подтверждённых свечах SOLUSDT. Реальные ордера отключены.</p><p id="status">Загрузка…</p><div class="grid" id="cards"></div><p class="muted">Сигнал: падение ≥0,5% за 2 минуты и восстановление; стоп 1%, тейк 2%. Начальный баланс 100 USDT на вариант; размер позиции 10% баланса. Комиссия 0,06% на сторону, проскальзывание 0,03%. Учёт начинается с момента запуска, прошлые сделки не дорисовываются.</p></main><script>async function refresh(){try{const r=await fetch('/api/sol-dip',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();document.getElementById('status').textContent='Последнее обновление: '+new Date().toLocaleString('ru-RU')+' · Проверено свечей: '+d.signalAudit.checked+' · Сигналов: '+d.signalAudit.signals+' · Только paper trading';const cards=document.getElementById('cards');cards.replaceChildren();for(const v of d.variants){const c=document.createElement('section');c.className='card';const title=document.createElement('h2');title.textContent=v.label;const bal=document.createElement('div');bal.className='num';bal.textContent=Number(v.balance).toFixed(2)+' USDT';const p=document.createElement('p');p.textContent=v.position?'Открыта LONG · вход '+Number(v.position.entry).toFixed(3):'Нет открытой позиции';const s=document.createElement('small');s.textContent=v.trades.length+' последних закрытых сделок · '+(v.last_bar?new Date(v.last_bar).toLocaleString('ru-RU'):'ожидание свечей');const tbl=document.createElement('table');const body=document.createElement('tbody');for(const t of v.trades.slice(0,8)){const tr=document.createElement('tr');for(const value of [new Date(t.exit_at).toLocaleString('ru-RU'),t.reason,Number(t.net_pnl).toFixed(3)]){const td=document.createElement('td');td.textContent=String(value);tr.append(td)}body.append(tr)}tbl.append(body);c.append(title,bal,p,s,tbl);cards.append(c)}}catch(e){document.getElementById('status').textContent='Ошибка загрузки: '+String(e)}}refresh();setInterval(refresh,15000)</script></body></html>`;
