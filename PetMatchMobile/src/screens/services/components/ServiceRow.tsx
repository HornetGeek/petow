import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import FastImage from 'react-native-fast-image';

import AppIcon from '../../../components/icons/AppIcon';
import { resolveMediaUrl } from '../../../utils/mediaUrl';

const FALLBACK_LOGO = 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png';

const PRICING_UNIT_LABELS: Record<string, string> = {
  per_visit: 'للزيارة',
  per_session: 'للجلسة',
  per_hour: 'للساعة',
  per_day: 'لليوم',
  per_night: 'لليلة',
};

// The minimal shape ServiceRow needs from a clinic. ServicesScreen and Home
// can pass any superset of these fields.
export type ClinicSummary = {
  id: number;
  name: string;
  logoUrl?: string;
  distanceLabel?: string;
  accentColor?: string;
};

export type ServiceItem = {
  id: string | number;
  name: string;
  description?: string;
  category?: string;
  basePrice: number;
  priceRange?: string;
  pricingUnit?: string;
  durationMinutes?: number;
  minDurationUnits?: number | null;
};

export interface ServiceRowProps {
  clinic: ClinicSummary;
  service: ServiceItem;
  onBook: (clinicId: number, serviceId: string | number) => void;
  onOpenClinic: (clinicId: number) => void;
}

const ServiceRowImpl: React.FC<ServiceRowProps> = ({ clinic, service, onBook, onOpenClinic }) => {
  const handleBook = useCallback(() => onBook(clinic.id, service.id), [onBook, clinic.id, service.id]);
  const handleOpenClinic = useCallback(() => onOpenClinic(clinic.id), [onOpenClinic, clinic.id]);

  const priceLabel = service.priceRange?.trim()
    || (Number.isFinite(service.basePrice) && service.basePrice > 0 ? `${service.basePrice} ج.م` : null);
  const unitLabel = service.pricingUnit ? PRICING_UNIT_LABELS[service.pricingUnit] : undefined;
  const accent = clinic.accentColor || '#02B7B4';

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <FastImage
          source={{ uri: resolveMediaUrl(clinic.logoUrl, FALLBACK_LOGO), priority: FastImage.priority.normal }}
          style={styles.logo}
          resizeMode={FastImage.resizeMode.contain}
        />
        <View style={styles.headerText}>
          <Text style={styles.clinicName} numberOfLines={1}>{clinic.name}</Text>
          {clinic.distanceLabel ? (
            <View style={styles.metaRow}>
              <AppIcon name="location" size={12} color="#5f6c7b" />
              <Text style={styles.metaText}>{clinic.distanceLabel}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Text style={styles.serviceName} numberOfLines={2}>{service.name}</Text>
      {service.description ? (
        <Text style={styles.serviceDescription} numberOfLines={2}>{service.description}</Text>
      ) : null}

      <View style={styles.factsRow}>
        {service.durationMinutes ? (
          <View style={styles.fact}>
            <Text style={styles.factEmoji}>⏱</Text>
            <Text style={styles.factText}>{service.durationMinutes} د</Text>
          </View>
        ) : null}
        {priceLabel ? (
          <View style={styles.fact}>
            <Text style={styles.priceText}>{priceLabel}</Text>
            {unitLabel ? <Text style={styles.unitText}> / {unitLabel}</Text> : null}
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.detailsButton}
          onPress={handleOpenClinic}
          accessibilityRole="button"
          accessibilityLabel={`فتح تفاصيل ${clinic.name}`}
        >
          <Text style={styles.detailsText}>التفاصيل</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bookButton, { backgroundColor: accent }]}
          onPress={handleBook}
          accessibilityRole="button"
          accessibilityLabel={`حجز ${service.name}`}
        >
          <Text style={styles.bookText}>حجز موعد</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const ServiceRow = memo(ServiceRowImpl);
ServiceRow.displayName = 'ServiceRow';

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5edf4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f4f7fb',
    marginEnd: 10,
  },
  headerText: { flex: 1 },
  clinicName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1c344d',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    color: '#5f6c7b',
  },
  serviceName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1c344d',
    marginBottom: 4,
  },
  serviceDescription: {
    fontSize: 13,
    color: '#5f6c7b',
    lineHeight: 18,
    marginBottom: 8,
  },
  factsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  factText: {
    fontSize: 13,
    color: '#5f6c7b',
  },
  factEmoji: {
    fontSize: 13,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1c344d',
  },
  unitText: {
    fontSize: 12,
    color: '#5f6c7b',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    minHeight: 44,
  },
  detailsButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d7dce5',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  detailsText: {
    color: '#1c344d',
    fontWeight: '600',
    fontSize: 14,
  },
  bookButton: {
    flex: 1.4,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  bookText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
