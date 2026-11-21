// Both the collector and the browser must resolve contradictory price evidence
// identically. "free" is never a safe default when a priced activity appears.
export function tourPriceStatus(item = {}) {
  const value = String(item.priceText || item.price || '').trim();
  const freeEvidence = item.free === true || /^무료(?:\s|$)/.test(value);
  const paidEvidence = /유료|(?:\d[\d,]*|\d+\s*[만천])\s*원|₩/.test(value);
  if ((freeEvidence && paidEvidence) || /가격\s*변동|별도\s*문의|비용\s*문의/.test(value)) return 'unknown';
  if (['free', 'paid', 'unknown'].includes(item.priceStatus)) {
    if ((item.priceStatus === 'free' && paidEvidence) || (item.priceStatus === 'paid' && freeEvidence)) return 'unknown';
    return item.priceStatus;
  }
  if (freeEvidence) return 'free';
  if (paidEvidence) return 'paid';
  return 'unknown';
}
