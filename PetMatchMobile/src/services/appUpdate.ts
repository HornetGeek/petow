import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { type AppConfig } from './appConfig';

const SOFT_UPDATE_DISMISS_PREFIX = 'soft_update_dismissed_v1';

export type UpdateRequirement =
  | {
      kind: 'none';
      currentVersion: string;
      storeUrl: string;
      targetVersion: string;
    }
  | {
      kind: 'soft' | 'hard';
      currentVersion: string;
      storeUrl: string;
      targetVersion: string;
    };

const normalizeVersion = (value: string): string => value.trim();

const toVersionParts = (value: string): number[] => {
  const normalized = normalizeVersion(value);
  if (!normalized) return [];
  return normalized.split('.').map((part) => {
    const match = part.match(/\d+/);
    return match ? Number(match[0]) : 0;
  });
};

export const compareVersions = (left: string, right: string): number => {
  const leftParts = toVersionParts(left);
  const rightParts = toVersionParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
};

export const getInstalledAppVersion = (): string => {
  return normalizeVersion(DeviceInfo.getVersion());
};

const getPlatformRule = (config: AppConfig, platform: string) => {
  if (platform === 'ios') {
    return {
      minSupportedVersion: config.iosMinSupportedVersion,
      recommendedVersion: config.iosRecommendedVersion,
      storeUrl: config.iosStoreUrl,
    };
  }

  return {
    minSupportedVersion: config.androidMinSupportedVersion,
    recommendedVersion: config.androidRecommendedVersion,
    storeUrl: config.androidStoreUrl,
  };
};

export const evaluateUpdateRequirement = (
  config: AppConfig,
  currentVersion: string,
  platform: string = Platform.OS,
): UpdateRequirement => {
  const { minSupportedVersion, recommendedVersion, storeUrl } = getPlatformRule(config, platform);

  if (
    minSupportedVersion &&
    compareVersions(currentVersion, minSupportedVersion) < 0
  ) {
    return {
      kind: 'hard',
      currentVersion,
      storeUrl,
      targetVersion: minSupportedVersion,
    };
  }

  if (
    recommendedVersion &&
    compareVersions(currentVersion, recommendedVersion) < 0
  ) {
    return {
      kind: 'soft',
      currentVersion,
      storeUrl,
      targetVersion: recommendedVersion,
    };
  }

  return {
    kind: 'none',
    currentVersion,
    storeUrl,
    targetVersion: '',
  };
};

export const buildSoftUpdateDismissalKey = (
  currentVersion: string,
  targetVersion: string,
  platform: string = Platform.OS,
): string => {
  return [
    SOFT_UPDATE_DISMISS_PREFIX,
    platform,
    normalizeVersion(currentVersion),
    normalizeVersion(targetVersion),
  ].join(':');
};

export const hasDismissedSoftUpdate = async (
  currentVersion: string,
  targetVersion: string,
  platform: string = Platform.OS,
): Promise<boolean> => {
  const key = buildSoftUpdateDismissalKey(currentVersion, targetVersion, platform);
  try {
    const value = await AsyncStorage.getItem(key);
    return value === '1';
  } catch {
    return false;
  }
};

export const dismissSoftUpdate = async (
  currentVersion: string,
  targetVersion: string,
  platform: string = Platform.OS,
) => {
  const key = buildSoftUpdateDismissalKey(currentVersion, targetVersion, platform);
  try {
    await AsyncStorage.setItem(key, '1');
  } catch {
    // Ignore persistence errors for non-critical UX state.
  }
};
