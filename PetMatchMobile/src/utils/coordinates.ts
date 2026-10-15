export type Coordinates = { lat: number; lng: number };

const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

export const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const normalizeLatLng = (lat: unknown, lng: unknown): Coordinates | null => {
  const normalizedLat = toFiniteNumber(lat);
  const normalizedLng = toFiniteNumber(lng);

  if (normalizedLat === null || normalizedLng === null) {
    return null;
  }

  if (
    normalizedLat < LAT_MIN ||
    normalizedLat > LAT_MAX ||
    normalizedLng < LNG_MIN ||
    normalizedLng > LNG_MAX
  ) {
    return null;
  }

  return { lat: normalizedLat, lng: normalizedLng };
};
