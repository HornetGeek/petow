import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetAppConfigStateForTests,
  fetchAppConfig,
  getDefaultAppConfig,
} from './appConfig';

describe('appConfig', () => {
  beforeEach(async () => {
    __resetAppConfigStateForTests();
    jest.clearAllMocks();
    await AsyncStorage.clear();
    global.fetch = jest.fn();
  });

  it('returns defaults when there is no cache and fetch fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    const config = await fetchAppConfig(true);

    expect(config).toEqual(getDefaultAppConfig());
  });

  it('returns cached config when fetch fails', async () => {
    await AsyncStorage.setItem(
      'mobile_app_config_cache_v1',
      JSON.stringify({
        savedAt: Date.now() - 60_000,
        config: {
          ...getDefaultAppConfig(),
          androidMinSupportedVersion: '1.0.16',
          androidRecommendedVersion: '1.0.20',
        },
      }),
    );
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    const config = await fetchAppConfig(true);

    expect(config.androidMinSupportedVersion).toBe('1.0.16');
    expect(config.androidRecommendedVersion).toBe('1.0.20');
  });
});
