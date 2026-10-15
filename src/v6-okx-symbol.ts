/** Only USDT-margined perpetuals map unambiguously to the Bybit candle symbols.
 * Never silently treat BTC-USD-SWAP (inverse) or BTC-USDC-SWAP as BTCUSDT.
 */
export function normalizeOkxSwapSymbol(instId:unknown):string|null{
 if(typeof instId!=='string')return null;
 const match=/^([A-Z0-9]{2,20})-USDT-SWAP$/.exec(instId);
 return match?match[1]+'USDT':null;
}
/** Static, internally selected SQL expressions only; mirrors normalizeOkxSwapSymbol. */
export function okxSwapSymbolSql(rawRef:'h.raw'|'o.raw'):string{
 const instrument=`${rawRef}->>'instId'`;
 return `CASE WHEN ${instrument} ~ '^[A-Z0-9]{2,20}-USDT-SWAP$' THEN split_part(${instrument},'-',1) || 'USDT' ELSE NULL END`;
}
