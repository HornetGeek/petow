import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDefaultAppConfig } from './appConfig';
import {
  buildSoftUpdateDismissalKey,
  compareVersions,
  dismissSoftUpdate,
  evaluateUpdateRequirement,
  hasDismissedSoftUpdate,
} from './appUpdate';

describe('appUpdate', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('compares dotted versions numerically', () => {
    expect(compareVersions('1.0.16', '1.0.9')).toBe(1);
    expect(compareVersions('1.0.9', '1.0.16')).toBe(-1);
    expect(compareVersions('1.1', '1.1.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('marks Android versions below minimum as hard update', () => {
    const config = {
      ...getDefaultAppConfig(),
      androidMinSupportedVersion: '1.0.16',
      androidStoreUrl: 'https://play.google.com/store/apps/details?id=com.petmatchmobile',
    };

    const requirement = evaluateUpdateRequirement(config, '1.0.15', 'android');

    expect(requirement.kind).toBe('hard');
    expect(requirement.targetVersion).toBe('1.0.16');
  });

  it('marks iOS versions below recommended as soft update when minimum is satisfied', () => {
    const config = {
      ...getDefaultAppConfig(),
      iosMinSupportedVersion: '1.1.0',
      iosRecommendedVersion: '1.1.3',
      iosStoreUrl: 'https://apps.apple.com/app/id1234567890',
    };

    const requirement = evaluateUpdateRequirement(config, '1.1.1', 'ios');

    expect(requirement.kind).toBe('soft');
    expect(requirement.targetVersion).toBe('1.1.3');
  });

  it('allows versions equal to minimum supported', () => {
    const config = {
      ...getDefaultAppConfig(),
      androidMinSupportedVersion: '1.0.16',
      androidRecommendedVersion: '1.0.16',
    };

    const requirement = evaluateUpdateRequirement(config, '1.0.16', 'android');

    expect(requirement.kind).toBe('none');
  });

  it('persists soft update dismissal by current and target version', async () => {
    const key = buildSoftUpdateDismissalKey('1.0.16', '1.0.20', 'android');

    expect(await hasDismissedSoftUpdate('1.0.16', '1.0.20', 'android')).toBe(false);
    await dismissSoftUpdate('1.0.16', '1.0.20', 'android');

    expect(await AsyncStorage.getItem(key)).toBe('1');
    expect(await hasDismissedSoftUpdate('1.0.16', '1.0.20', 'android')).toBe(true);
    expect(await hasDismissedSoftUpdate('1.0.16', '1.0.21', 'android')).toBe(false);
  });
});
