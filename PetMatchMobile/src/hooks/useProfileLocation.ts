import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiService, User } from '../services/api';
import { Coordinates } from '../utils/formatters';

type Result = {
  userLocation: Coordinates | null;
  profile: User | null;
  isLoading: boolean;
  isReady: boolean;
};

export const useProfileLocation = (): Result => {
  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await apiService.getProfile();
      return res.success && res.data ? res.data : null;
    },
  });

  const userLocation = useMemo<Coordinates | null>(() => {
    if (!data) return null;
    const lat = Number((data as any).latitude);
    const lng = Number((data as any).longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return null;
  }, [data]);

  return {
    userLocation,
    profile: data ?? null,
    isLoading: isLoading || isFetching,
    isReady: !isLoading && !isFetching && !isError,
  };
};
