import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, LOCAL_FEATURE_OVERRIDES } from './config';

const APP_CONFIG_URL = `${API_BASE_URL}/accounts/app-config/`;
const STORAGE_KEY = 'mobile_app_config_cache_v1';
const CACHE_TTL_MS = 5 * 60 * 1000;

export type AppConfig = {
  clinicHomeEnabled: boolean;
  clinicMapEnabled: boolean;
  serverMapClusteringEnabled: boolean;
  requestChatV2Enabled: boolean;
  androidMinSupportedVersion: string;
  iosMinSupportedVersion: string;
  androidRecommendedVersion: string;
  iosRecommendedVersion: string;
  androidStoreUrl: string;
  iosStoreUrl: string;
  updatedAt: string | null;
};

type AppConfigCache = {
  config: AppConfig;
  savedAt: number;
};

let inMemoryConfig: AppConfig | null = null;
let lastFetchedAt = 0;
let inFlightPromise: Promise<AppConfig> | null = null;

const normalizeBool = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  return fallback;
};

const normalizeString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

export const getDefaultAppConfig = (): AppConfig => ({
  clinicHomeEnabled: true,
  clinicMapEnabled: true,
  serverMapClusteringEnabled: true,
  requestChatV2Enabled: false,
  androidMinSupportedVersion: '',
  iosMinSupportedVersion: '',
  androidRecommendedVersion: '',
  iosRecommendedVersion: '',
  androidStoreUrl: '',
  iosStoreUrl: '',
  updatedAt: null,
});

const applyDevOverrides = (config: AppConfig): AppConfig => {
  if (!__DEV__) return config;
  const overrides = LOCAL_FEATURE_OVERRIDES;
  if (!overrides) return config;
  const next: AppConfig = { ...config };
  if (typeof overrides.clinicHomeEnabled === 'boolean') {
    next.clinicHomeEnabled = overrides.clinicHomeEnabled;
  }
  if (typeof overrides.clinicMapEnabled === 'boolean') {
    next.clinicMapEnabled = overrides.clinicMapEnabled;
  }
  if (typeof overrides.serverMapClusteringEnabled === 'boolean') {
    next.serverMapClusteringEnabled = overrides.serverMapClusteringEnabled;
  }
  if (typeof overrides.requestChatV2Enabled === 'boolean') {
    next.requestChatV2Enabled = overrides.requestChatV2Enabled;
  }
  return next;
};

export const parseAppConfig = (payload: any): AppConfig => {
  const defaults = getDefaultAppConfig();
  return {
    clinicHomeEnabled: normalizeBool(
      payload?.clinic_home_enabled,
      defaults.clinicHomeEnabled,
    ),
    clinicMapEnabled: normalizeBool(
      payload?.clinic_map_enabled,
      defaults.clinicMapEnabled,
    ),
    serverMapClusteringEnabled: normalizeBool(
      payload?.server_map_clustering_enabled,
      defaults.serverMapClusteringEnabled,
    ),
    requestChatV2Enabled: normalizeBool(
      payload?.request_chat_v2_enabled,
      defaults.requestChatV2Enabled,
    ),
    androidMinSupportedVersion: normalizeString(payload?.android_min_supported_version),
    iosMinSupportedVersion: normalizeString(payload?.ios_min_supported_version),
    androidRecommendedVersion: normalizeString(payload?.android_recommended_version),
    iosRecommendedVersion: normalizeString(payload?.ios_recommended_version),
    androidStoreUrl: normalizeString(payload?.android_store_url),
    iosStoreUrl: normalizeString(payload?.ios_store_url),
    updatedAt: typeof payload?.updated_at === 'string' ? payload.updated_at : null,
  };
};

const loadCachedAppConfig = async (): Promise<AppConfigCache | null> => {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.config || typeof parsed.savedAt !== 'number') return null;
    return { config: parsed.config as AppConfig, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
};

const saveCachedAppConfig = async (config: AppConfig) => {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ config, savedAt: Date.now() }),
    );
  } catch {
    // Ignore cache write errors.
  }
};

export const fetchAppConfig = async (force = false): Promise<AppConfig> => {
  const now = Date.now();
  if (!force && inMemoryConfig && now - lastFetchedAt < CACHE_TTL_MS) {
    return applyDevOverrides(inMemoryConfig);
  }

  if (inFlightPromise) {
    return inFlightPromise;
  }

  inFlightPromise = (async () => {
    const defaults = getDefaultAppConfig();
    const cached = await loadCachedAppConfig();

    if (
      !force &&
      !inMemoryConfig &&
      cached &&
      now - cached.savedAt < CACHE_TTL_MS
    ) {
      inMemoryConfig = cached.config;
      lastFetchedAt = cached.savedAt;
      return applyDevOverrides(cached.config);
    }

    try {
      const response = await fetch(APP_CONFIG_URL);
      if (!response.ok) {
        throw new Error(`Failed to load app config: ${response.status}`);
      }
      const payload = await response.json();
      const config = parseAppConfig(payload);
      inMemoryConfig = config;
      lastFetchedAt = Date.now();
      await saveCachedAppConfig(config);
      return applyDevOverrides(config);
    } catch {
      if (inMemoryConfig) {
        return applyDevOverrides(inMemoryConfig);
      }
      if (cached) {
        inMemoryConfig = cached.config;
        lastFetchedAt = cached.savedAt;
        return applyDevOverrides(cached.config);
      }
      return applyDevOverrides(defaults);
    } finally {
      inFlightPromise = null;
    }
  })();

  return inFlightPromise;
};

export const __resetAppConfigStateForTests = () => {
  inMemoryConfig = null;
  lastFetchedAt = 0;
  inFlightPromise = null;
};
