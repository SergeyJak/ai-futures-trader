export const unifiedHeader = `<div class="af-header"><a class="af-brand" href="/">AI <span>Futures</span></a><details class="af-menu"><summary aria-label="Меню разделов" title="Меню разделов">⋮</summary><nav aria-label="Разделы"><a href="/">Бумажный тест</a><a href="/data-status">Состояние данных</a></nav></details></div>`;
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
@media(max-width:600px){.af-menu>nav{right:-2px}}
</style>`;export function withUnifiedHeader(html:string){return html.replace(/<header\b[^>]*>[\s\S]*?<\/header>/i,'').replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/i,'').replace('</head>',headerCss+'</head>').replace(/<body([^>]*)>/i,(_m,attrs)=>'<body'+attrs+'>'+unifiedHeader)}
