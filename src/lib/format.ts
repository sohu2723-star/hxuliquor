export function formatCurrency(value: number): string {
  return `Ks ${Math.round(value).toLocaleString('en-US')}`
}
