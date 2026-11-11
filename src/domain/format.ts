/** Indian digit grouping: 412800 -> "4,12,800". */
export function formatIndianNumber(n: number): string {
  const sign = n < 0 ? "-" : "";
  const digits = Math.round(Math.abs(n)).toString();
  if (digits.length <= 3) return sign + digits;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${sign}${rest},${last3}`;
}

/** Rupees with Indian grouping: formatINR(412800) === "₹4,12,800". */
export function formatINR(n: number): string {
  const s = formatIndianNumber(n);
  return s.startsWith("-") ? `-₹${s.slice(1)}` : `₹${s}`;
}
