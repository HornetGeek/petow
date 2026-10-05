import { API_HOST } from '../services/config';

const IPV4_HOST_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

const stripTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const toAbsoluteBaseUrl = (value: string): string => {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return 'https://api.petow.app';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return stripTrailingSlash(trimmed);
  }
  return stripTrailingSlash(`https://${trimmed}`);
};

const mediaBaseUrl = toAbsoluteBaseUrl(API_HOST);

const normalizeMalformedUrl = (value: string): string => {
  let normalized = value.trim();
  if (!normalized) {
    return '';
  }

  normalized = normalized.replace(/^https:\/(?!\/)/i, 'https://');
  normalized = normalized.replace(/^http:\/(?!\/)/i, 'http://');
  normalized = normalized.replace(
    /^\d{1,3}(?:\.\d{1,3}){3}(\/.*)?$/i,
    (_match, path: string | undefined) => `${mediaBaseUrl}${path || ''}`
  );
  normalized = normalized.replace(/https?:\/\/\.petow\.app/gi, mediaBaseUrl);
  normalized = normalized.replace(/https?:\/\.petow\.app/gi, mediaBaseUrl);
  normalized = normalized.replace('/api/media/', '/media/');
  normalized = normalized.replace('api.petow.app/api/', 'api.petow.app/');
  try {
    const parsed = new URL(normalized);
    if (IPV4_HOST_PATTERN.test(parsed.hostname)) {
      normalized = `${mediaBaseUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch (_error) {
    // Ignore parse failures for relative paths.
  }

  return normalized;
};

export const resolveMediaUrl = (value?: string | null, fallback = ''): string => {
  if (!value || typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (/^(data:|file:|content:)/i.test(trimmed)) {
    return trimmed;
  }

  const normalized = normalizeMalformedUrl(trimmed);
  if (!normalized) {
    return fallback;
  }

  if (normalized.startsWith('//')) {
    return `https:${normalized}`;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${mediaBaseUrl}${path}`;
};

export const buildMediaCandidates = (value?: string | null, fallback = ''): string[] => {
  const resolved = resolveMediaUrl(value);
  const candidates: string[] = [];

  const appendCandidate = (candidate?: string | null) => {
    if (!candidate) return;
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  };

  if (resolved) {
    appendCandidate(resolved);
  }

  const pathFixedCandidates = [...candidates];
  for (const candidate of candidates) {
    if (candidate.includes('/api/media/')) {
      pathFixedCandidates.push(candidate.replace('/api/media/', '/media/'));
    }
  }

  for (const candidate of pathFixedCandidates) {
    appendCandidate(candidate);
  }

  if (fallback) {
    appendCandidate(fallback);
  }

  return candidates;
};
