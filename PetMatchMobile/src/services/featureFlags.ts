import { useCallback, useEffect, useState } from 'react';
import { fetchAppConfig, getDefaultAppConfig, type AppConfig } from './appConfig';

export type FeatureFlags = {
  clinicHomeEnabled: boolean;
  clinicMapEnabled: boolean;
  serverMapClusteringEnabled: boolean;
};

const mapAppConfigToFeatureFlags = (config: AppConfig): FeatureFlags => ({
  clinicHomeEnabled: config.clinicHomeEnabled,
  clinicMapEnabled: config.clinicMapEnabled,
  serverMapClusteringEnabled: config.serverMapClusteringEnabled,
});

const getDefaultFlags = (): FeatureFlags => (
  mapAppConfigToFeatureFlags(getDefaultAppConfig())
);

export const fetchFeatureFlags = async (force = false): Promise<FeatureFlags> => {
  const config = await fetchAppConfig(force);
  return mapAppConfigToFeatureFlags(config);
};

export const useFeatureFlags = () => {
  const [flags, setFlags] = useState<FeatureFlags>(getDefaultFlags());

  const refreshFlags = useCallback(async (force = true) => {
    const remoteFlags = await fetchFeatureFlags(force);
    setFlags(remoteFlags);
    return remoteFlags;
  }, []);

  useEffect(() => {
    let isMounted = true;
    fetchFeatureFlags(false).then((remoteFlags) => {
      if (isMounted) {
        setFlags(remoteFlags);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  return { ...flags, refreshFlags };
};
