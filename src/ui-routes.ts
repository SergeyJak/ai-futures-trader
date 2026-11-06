import {relativeStrengthHtml} from './relative-strength-page.js';
import {dataStatusHtml} from './data-status-page.js';
import {withUnifiedHeader} from './unified-header.js';

const retired = new Set(['/dashboard','/experiments','/exit-research','/v5','/v6','/v7','/v8','/sol-dip','/sol-short','/sol-5m','/dip-oos','/finance','/analytics','/research','/market','/research-progress','/research/dip-continuation']);
export function uiResponse(method:string, rawUrl:string){
 const path=new URL(rawUrl,'http://localhost').pathname.replace(/\/+$/,'')||'/';
 const page=path==='/'||path==='/relative-strength'?relativeStrengthHtml:path==='/data-status'?dataStatusHtml:null;
 if(!page&&!retired.has(path)&&!path.startsWith('/strategy/'))return null;
 if(method!=='GET'&&method!=='HEAD')return {status:405,headers:{allow:'GET, HEAD'},body:''};
 if(!page)return {status:302,headers:{location:'/'},body:''};
 return {status:200,headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'"},body:method==='HEAD'?'':withUnifiedHeader(page)};
}
