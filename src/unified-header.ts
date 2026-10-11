export const unifiedHeader = `<div class="af-header"><a class="af-brand" href="/">AI <span>Futures</span></a><details class="af-menu"><summary aria-label="Меню разделов" title="Меню разделов">⋮</summary><nav aria-label="Разделы"><a href="/">Общий обзор</a><a href="/dashboard">v1 / v2 · Торговля</a><a href="/experiments">v3 · Парные стратегии</a><a href="/exit-research">v4 · Выходы</a><a href="/v5">v5 · Исправленные сигналы</a><a href="/v6">v6 · Исследование трейдеров</a><a href="/sol-dip">SOL · Dip Reversal (3 режима)</a><a href="/finance">Финансы · Рейтинг стратегий</a><a href="/analytics">Аналитика</a><a href="/market">Рынок</a><a href="/research">Исследования</a></nav></details></div>`;
export const headerCss = `<style>.af-header{box-sizing:border-box;max-width:1150px;margin:0 auto;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #e4eaf5;font:600 16px system-ui;color:#172338}.af-header *{box-sizing:border-box}.af-brand{text-decoration:none!important;color:#172338!important;font-size:22px;font-weight:850}.af-brand span{color:#506ddd}.af-menu{position:relative}.af-menu summary{list-style:none;cursor:pointer;border:1px solid #dce4f0;background:#f7f9fd;color:#172338;border-radius:12px;width:43px;height:43px;display:grid;place-items:center;font-size:29px;line-height:1}.af-menu summary::-webkit-details-marker{display:none}.af-menu nav{position:absolute;z-index:100;right:0;top:49px;width:min(290px,85vw);background:#fff;border:1px solid #dce4f0;box-shadow:0 12px 35px #17233822;border-radius:14px;padding:8px;display:grid;gap:2px}.af-menu nav a{color:#273951!important;text-decoration:none!important;padding:11px 13px;border-radius:8px;font-size:14px}.af-menu nav a:hover{background:#eef3ff}</style>`;

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

export function withUnifiedHeader(html:string){let result=html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/i,'').replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/i,'').replace('</head>',headerCss+'</head>').replace(/<body([^>]*)>/i,(_m,attrs)=>'<body'+attrs+'>'+unifiedHeader);if(/<title>[^<]*(?:v5|v4|Парные эксперименты|Paper Trading)/i.test(html)){result=result.replace('</head>',compactCss+'</head>').replace(unifiedHeader,unifiedHeader+compactUi).replace('</body>','</details>'+compactScript+'</body>')}return result}
