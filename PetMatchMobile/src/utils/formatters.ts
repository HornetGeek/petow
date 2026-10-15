// Shared formatting helpers for list rendering
import { resolveMediaUrl } from './mediaUrl';

export const parseAgeToMonths = (value?: string | null): number | null => {
  if (!value) return null;
  const normalized = value
    .replace(/٠/g, '0')
    .replace(/١/g, '1')
    .replace(/٢/g, '2')
    .replace(/٣/g, '3')
    .replace(/٤/g, '4')
    .replace(/٥/g, '5')
    .replace(/٦/g, '6')
    .replace(/٧/g, '7')
    .replace(/٨/g, '8')
    .replace(/٩/g, '9');
  const yearsMatch = normalized.match(/(\d+)\s*سنة/);
  const monthsMatch = normalized.match(/(\d+)\s*شهر/);
  let total = 0;
  if (yearsMatch) total += parseInt(yearsMatch[1], 10) * 12;
  if (monthsMatch) total += parseInt(monthsMatch[1], 10);
  if (!total) {
    const genericMatch = normalized.match(/(\d+)/);
    if (genericMatch) total += parseInt(genericMatch[1], 10);
  }
  return total || null;
};

export const timeAgo = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.max(0, now.getTime() - d.getTime());
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  if (hours < 24) return `منذ ${hours} ساعة`;
  if (days < 30) return `منذ ${days} يوم`;
  const months = Math.floor(days / 30);
  if (months < 12) return `منذ ${months} شهر`;
  const years = Math.floor(months / 12);
  return `منذ ${years} سنة`;
};

export type Coordinates = { lat: number; lng: number };

export const distanceKm = (pLat?: number, pLng?: number, user?: Coordinates | null): number | null => {
  if (!user) return null;
  const plat = Number(pLat);
  const plon = Number(pLng);
  if (!Number.isFinite(plat) || !Number.isFinite(plon)) return null;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(plat - user.lat);
  const dLon = toRad(plon - user.lng);
  const lat1 = toRad(user.lat);
  const lat2 = toRad(plat);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = R * c;
  return Number.isFinite(km) ? km : null;
};

export const formatDistanceLabel = (km: number | null): string | null => {
  if (km === null) return null;
  return `${km.toFixed(km < 10 ? 1 : 0)} كم`;
};

export const normalizeImageUrl = (url?: string): string => {
  return resolveMediaUrl(url, 'https://via.placeholder.com/400x300?text=No+Image');
};
