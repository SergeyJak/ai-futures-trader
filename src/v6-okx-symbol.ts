export function okxSwapToMarketSymbol(id: unknown): string | null {
 if (typeof id !== 'string') return null;
 const m = /^([A-Z0-9]{2,20})-USDT-SWAP$/.exec(id);
 return m ? m[1] + 'USDT' : null;
}
export const OKX_MARKET_SYMBOL_SQL = "CASE WHEN (h.raw->>'instId') ~ '^[A-Z0-9]{2,20}-USDT-SWAP$' THEN replace(h.raw->>'instId','-USDT-SWAP','USDT') ELSE NULL END";
