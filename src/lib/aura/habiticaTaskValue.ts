/**
 * Habitica's hidden "value" → color mapping (red→orange→yellow→green→blue).
 * Mirrors the palette used in the official Habitica web client task list.
 */
export function habiticaValueColor(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value < -20) return "#BE321E";
  if (value < -10) return "#F25524";
  if (value < -1) return "#F19724";
  if (value < 1) return "#F8BA1B";
  if (value < 5) return "#62B466";
  if (value < 12) return "#3BCAEA";
  return "#2998BD";
}
