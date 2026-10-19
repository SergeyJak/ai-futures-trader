export const unifiedHeader = `<div class="af-header"><a class="af-brand" href="/">AI <span>Futures</span></a><details class="af-menu"><summary aria-label="Меню разделов" title="Меню разделов">⋮</summary><nav aria-label="Разделы"><a href="/">Тестовые стратегии</a><a href="/research-progress">Прогресс исследований</a><a href="/finance">Полный финансовый отчёт</a><details class="af-submenu"><summary>Активные тестовые стратегии ▸</summary><div><a href="/sol-dip">SOL · LONG ↗</a><a href="/sol-short">SOL · SHORT ↘</a><a href="/v8">V8 · Liquidity Sweep</a><a href="/sol-5m">SOL · 5m сигналы / 1m сделки</a><a href="/dip-oos">Dip Reversal · OOS</a><a href="/strategy/dip_reversal">Отскок после просадки</a><a href="/strategy/momentum_continuation">Продолжение импульса</a><a href="/strategy/dip_continuation">Продолжение просадки</a><a href="/v7">V7 · Momentum + Volume</a></div></details><details class="af-submenu"><summary>Архив и диагностика ▸</summary><div><a href="/experiments">V3 · Накопленные сделки</a><a href="/exit-research">V4 · Выходы</a><a href="/v6">V6 · Трейдеры</a><a href="/dashboard">V1 / V2 · Архив</a><a href="/v5">V5 · Архив</a><a href="/analytics">Аналитика</a><a href="/market">Рынок</a><a href="/research">Старые исследования</a></div></details></nav></details></div>`;
export const headerCss = `<style>
.af-header,.af-header *{box-sizing:border-box}
.af-header{max-width:1150px;margin:0 auto;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e4eaf5;font:600 16px system-ui;color:#172338}
.af-brand{text-decoration:none!important;color:#172338!important;font-size:22px;font-weight:850}.af-brand span{color:#506ddd}
.af-menu{position:relative}.af-menu>summary{list-style:none;cursor:pointer;border:1px solid #dce4f0;background:#f7f9fd;color:#172338;border-radius:12px;width:43px;height:43px;display:grid;place-items:center;font-size:29px;line-height:1}
.af-menu summary::-webkit-details-marker{display:none}
.af-menu>nav{position:absolute;z-index:100;right:0;top:49px;width:min(330px,calc(100vw - 28px));max-height:calc(100dvh - 115px);overflow-y:auto;overscroll-behavior:contain;background:#fff;border:1px solid #dce4f0;box-shadow:0 12px 35px #17233822;border-radius:14px;padding:10px;display:flex;flex-direction:column;gap:4px;align-items:stretch}
.af-menu>nav>a,.af-submenu>summary,.af-submenu>div>a{display:block!important;width:100%!important;min-height:44px!important;height:auto!important;margin:0!important;float:none!important;position:static!important;transform:none!important;line-height:1.4!important;text-align:left!important;white-space:normal!important;overflow-wrap:anywhere!important;border:0!important;border-radius:9px!important;padding:12px 13px!important;font:600 14px/1.4 system-ui!important;box-shadow:none!important}
.af-menu>nav a{color:#273951!important;text-decoration:none!important}
.af-menu>nav a:hover,.af-submenu>summary:hover{background:#eef3ff!important}
.af-submenu{display:block!important;width:100%!important;margin:0!important;padding:0!important;border:0!important;min-width:0!important}
.af-submenu>summary{cursor:pointer!important;list-style:none!important;background:#f7f9fd!important}
.af-submenu>summary::after{content:'▾';float:right;font-size:13px;transition:transform .15s}
.af-submenu[open]>summary::after{transform:rotate(180deg)}
.af-submenu>div{display:flex!important;flex-direction:column!important;gap:2px!important;padding:4px 0 7px 12px!important;margin:0!important}
.af-submenu>div>a{font-weight:500!important;padding-left:16px!important}
.af-submenu[open]>summary{font-weight:750!important;background:#eef3ff!important}
@media(max-width:600px){.af-menu>nav{right:-2px}}
</style>`;
const menuPersistenceScript = `<script>
(function(){
const menu=document.querySelector('.af-menu');
if(!menu)return;
const groups=Array.from(menu.querySelectorAll('.af-submenu'));
const key='ai-futures-expanded-menu-v1';
try{
 const stored=JSON.parse(sessionStorage.getItem(key)||'[]');
 groups.forEach((g,i)=>{g.open=stored.includes(i)});
}catch{}
const save=()=>{try{sessionStorage.setItem(key,JSON.stringify(groups.flatMap((g,i)=>g.open?[i]:[])))}catch{}};
groups.forEach(g=>g.addEventListener('toggle',save));
menu.addEventListener('toggle',()=>{if(menu.open){try{const stored=JSON.parse(sessionStorage.getItem(key)||'[]');groups.forEach((g,i)=>{g.open=stored.includes(i)})}catch{}}});
})();
</script>`;


const compactCss = `<style>
.af-compact{max-width:1050px;margin:18px auto 0;padding:0 16px;font:14px system-ui;color:#172338}
.af-compact h1{font-size:23px;margin:0 0 5px}
.af-compact p{margin:0;color:#687991;font-size:13px}
.af-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:17px 0}
.af-kpi{background:#fff;border:1px solid #e4eaf5;border-radius:14px;padding:15px;min-width:0}
.af-kpi span{display:block;font-size:12px;color:#718099}
.af-kpi strong{display:block;font-size:23px;margin-top:6px;font-variant-numeric:tabular-nums}
.af-summary{background:#fff;border:1px solid #e4eaf5;border-radius:14px;padding:16px;line-height:1.5}
.af-legacy{max-width:1150px;margin:15px auto 45px;padding:0 12px;font:14px system-ui;color:#4b5c78}
.af-legacy>summary{cursor:pointer;background:#edf2fd;border:1px solid #dce5f2;border-radius:12px;padding:13px 15px;font-weight:700;list-style:revert}
.af-legacy[open]>summary{margin-bottom:14px}
@media(max-width:600px){.af-kpis{gap:7px}.af-kpi{padding:11px}.af-kpi strong{font-size:19px}.af-compact{padding:0 12px}}
</style>`;
const compactUi = `<section class="af-compact"><h1 id="af-title">Результаты стратегии</h1><p>Виртуальная торговля · Главное без технического шума</p>
<div class="af-kpis"><div class="af-kpi"><span>Лучший чистый PnL</span><strong id="af-accounts">…</strong></div><div class="af-kpi"><span>Закрытых сделок</span><strong id="af-trades">…</strong></div><div class="af-kpi"><span>Макс. просадка</span><strong id="af-plus">…</strong></div></div>
<div class="af-summary"><strong>Результат</strong><p id="af-conclusion">Загрузка данных…</p></div></section><details class="af-legacy"><summary>Раскрыть все счета, сделки и диагностику</summary>`;
const compactScript = `<script>
(function(){
const path=location.pathname;
const spec=path==='/dashboard'?{name:'V1 / V2 · Базовая торговля',url:'/api/paper-accounts'}:path==='/experiments'?{name:'V3 · Парные стратегии',url:'/api/v3'}:path==='/exit-research'?{name:'V4 · Варианты выхода',url:'/api/v4'}:path==='/v5'?{name:'V5 · Независимые сигналы',url:'/api/v5'}:null;
if(!spec)return;
const put=(id,v)=>{const node=document.getElementById(id);if(node)node.textContent=String(v)};
put('af-title',spec.name);
async function refresh(){try{const r=await fetch(spec.url,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json(),accounts=Array.isArray(data.accounts)?data.accounts:[];const trades=accounts.reduce((sum,a)=>sum+(Number(a.trades)||0),0);
const profit=accounts.filter(a=>Number(a.balance)>100).length;const drawdowns=accounts.map(a=>Number(a.max_drawdown_closed)).filter(x=>Number.isFinite(x)&&x>=0);const dd=drawdowns.length?Math.max(...drawdowns):null;
const best=Math.max(...accounts.map(a=>Number(a.balance)).filter(Number.isFinite));put('af-accounts',Number.isFinite(best)?(best-100>=0?'+':'')+(best-100).toFixed(2)+' USDT':'—');put('af-trades',trades);put('af-plus',dd===null?'н/д':(dd*100).toFixed(2)+'%');
put('af-conclusion',accounts.length?('Из '+accounts.length+' виртуальных счетов '+profit+' в плюсе после моделируемых расходов. '+(dd===null?'Историческая максимальная просадка ещё не рассчитана для этой версии.':'Максимальная просадка рассчитана по закрытым сделкам и не учитывает внутрисделочные падения equity.')+' Это исследование, а не гарантия прибыли.'): 'Пока нет доступных счетов. Данные сохраняются независимо от отображения.');
}catch(e){put('af-conclusion','Не удалось загрузить данные. Подробные отчеты доступны ниже.');put('af-accounts','—');put('af-trades','—');put('af-plus','—')}}
refresh();setInterval(refresh,30000);
})();
</script>`;

export function withUnifiedHeader(html:string){let result=(html.includes('id="overlay"')?html:html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/i,'').replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/i,'')).replace('</head>',headerCss+'</head>').replace(/<body([^>]*)>/i,(_m,attrs)=>'<body'+attrs+'>'+unifiedHeader);if(/<title>[^<]*(?:v5|v4|Парные эксперименты|Paper Trading)/i.test(html)){result=result.replace('</head>',compactCss+'</head>').replace(unifiedHeader,unifiedHeader+compactUi).replace('</body>','</details>'+compactScript+'</body>')}return result.replace('</body>',menuPersistenceScript+'</body>')}
