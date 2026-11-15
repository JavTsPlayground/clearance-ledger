// Number formatting shared by every view. Pure.

export function money(n) {
  const v = Number.isFinite(n) ? n : 0;
  const s = Math.abs(v).toFixed(2);
  // A value that rounds to zero is shown as $0.00, never as -$0.00.
  return (v < 0 && Number(s) !== 0 ? '−' : '') + '$' + s;
}

export function pct(ratio) {
  return (Number.isFinite(ratio) ? Math.round(ratio * 100) : 0) + '%';
}
