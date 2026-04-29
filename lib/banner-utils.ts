/** Parse "1200X628" or "1200x628" → [width, height]. Returns null if unparseable. */
export function parseBannerSize(size: string): [number, number] | null {
  const parts = size.toUpperCase().split("X");
  if (parts.length !== 2) return null;
  const w = parseInt(parts[0], 10);
  const h = parseInt(parts[1], 10);
  if (!w || !h) return null;
  return [w, h];
}
