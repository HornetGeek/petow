import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import FastImage from 'react-native-fast-image';

import { apiService, Pet } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { resolveMediaUrl } from '../../utils/mediaUrl';
import { generateTimeSlots, TimeSlot } from '../../utils/serviceTimeSlots';
import type { ClinicSummary, ServiceItem } from '../services/components/ServiceRow';

const FALLBACK_LOGO = 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png';

const PRICING_UNIT_LABELS: Record<string, string> = {
  per_visit: 'للزيارة',
  per_session: 'للجلسة',
  per_hour: 'للساعة',
  per_day: 'لليوم',
  per_night: 'لليلة',
};

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];
// Sunday-first week, Arabic short labels.
const WEEKDAY_LABELS = ['أحد', 'إثن', 'ثلاث', 'أربع', 'خميس', 'جمعة', 'سبت'];

type ClinicForBooking = ClinicSummary & {
  phone?: string;
  whatsapp?: string;
  workingHours?: string;
};

type ServiceBookingScreenProps = {
  clinic: ClinicForBooking;
  service: ServiceItem;
  onClose: () => void;
};

// Used as a stable date "key" that ignores time-of-day so equality checks
// don't false-negative on the calendar grid.
const dateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const startOfDay = (d: Date): Date => {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
};

interface MonthGridProps {
  visibleMonth: Date;
  selectedDate: Date | null;
  minDate: Date;
  onSelect: (d: Date) => void;
  onChangeMonth: (delta: 1 | -1) => void;
}

const MonthGrid = memo<MonthGridProps>(({ visibleMonth, selectedDate, minDate, onSelect, onChangeMonth }) => {
  const cells = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // getDay(): 0=Sun, 6=Sat. We render Sun-first (matches WEEKDAY_LABELS).
    const leadingBlanks = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const total = leadingBlanks + daysInMonth;
    const trailingBlanks = (7 - (total % 7)) % 7;
    const out: Array<{ day: number | null; date: Date | null }> = [];
    for (let i = 0; i < leadingBlanks; i += 1) out.push({ day: null, date: null });
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push({ day: d, date: new Date(year, month, d) });
    }
    for (let i = 0; i < trailingBlanks; i += 1) out.push({ day: null, date: null });
    return out;
  }, [visibleMonth]);

  const minStamp = startOfDay(minDate).getTime();
  const selectedKey = selectedDate ? dateKey(selectedDate) : null;

  return (
    <View style={styles.calendar}>
      <View style={styles.monthHeader}>
        <TouchableOpacity
          onPress={() => onChangeMonth(-1)}
          style={styles.monthArrow}
          accessibilityRole="button"
          accessibilityLabel="الشهر السابق"
        >
          <Text style={styles.monthArrowText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {ARABIC_MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
        </Text>
        <TouchableOpacity
          onPress={() => onChangeMonth(1)}
          style={styles.monthArrow}
          accessibilityRole="button"
          accessibilityLabel="الشهر التالي"
        >
          <Text style={styles.monthArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map(label => (
          <Text key={label} style={styles.weekLabel}>{label}</Text>
        ))}
      </View>

      <View style={styles.daysGrid}>
        {cells.map((cell, idx) => {
          if (!cell.date) {
            return <View key={`blank-${idx}`} style={styles.dayCell} />;
          }
          const cellKey = dateKey(cell.date);
          const isSelected = cellKey === selectedKey;
          const isPast = startOfDay(cell.date).getTime() < minStamp;
          return (
            <TouchableOpacity
              key={cellKey}
              style={[
                styles.dayCell,
                isSelected && styles.dayCellSelected,
              ]}
              onPress={() => !isPast && onSelect(cell.date as Date)}
              disabled={isPast}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: isPast }}
            >
              <Text style={[
                styles.dayText,
                isPast && styles.dayTextPast,
                isSelected && styles.dayTextSelected,
              ]}>
                {cell.day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});
MonthGrid.displayName = 'MonthGrid';

const ServiceBookingScreen: React.FC<ServiceBookingScreenProps> = ({ clinic, service, onClose }) => {
  const { user } = useAuth();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [myPets, setMyPets] = useState<Pet[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [loadingPets, setLoadingPets] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const profileName = useMemo(() => {
    if (!user) return '';
    if (user.full_name) return user.full_name.trim();
    return `${user.first_name || ''} ${user.last_name || ''}`.trim();
  }, [user]);
  const profilePhone = (user?.phone || '').trim();
  const profileEmail = (user?.email || '').trim();

  const [phone, setPhone] = useState(profilePhone);
  const [notes, setNotes] = useState('');
  const phoneTouched = useRef(false);

  // Keep phone in sync with profile if the profile loads after mount and the
  // user hasn't typed yet.
  useEffect(() => {
    if (!phoneTouched.current && profilePhone && !phone) {
      setPhone(profilePhone);
    }
  }, [profilePhone, phone]);

  useEffect(() => {
    let cancelled = false;
    setLoadingPets(true);
    apiService.getMyPets()
      .then(res => {
        if (cancelled) return;
        if (res.success && res.data) {
          setMyPets(res.data.results || []);
        }
      })
      .catch(() => {
        if (cancelled) return;
      })
      .finally(() => {
        if (!cancelled) setLoadingPets(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectDate = useCallback((d: Date) => {
    setSelectedDate(d);
    setSelectedSlot(null); // reset slot when date changes
  }, []);

  const handleChangeMonth = useCallback((delta: 1 | -1) => {
    setVisibleMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }, []);

  const slots: TimeSlot[] = useMemo(() => {
    if (!selectedDate) return [];
    return generateTimeSlots(clinic.workingHours, selectedDate);
  }, [selectedDate, clinic.workingHours]);

  const handleSelectSlot = useCallback((time: string) => setSelectedSlot(time), []);
  const handleSelectPet = useCallback((petId: number) => {
    setSelectedPetId(prev => (prev === petId ? null : petId));
  }, []);

  const priceLabel = service.priceRange?.trim()
    || (Number.isFinite(service.basePrice) && service.basePrice > 0 ? `${service.basePrice} ج.م` : null);
  const unitLabel = service.pricingUnit ? PRICING_UNIT_LABELS[service.pricingUnit] : undefined;

  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return null;
    return `${selectedDate.getDate()} ${ARABIC_MONTHS[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
  }, [selectedDate]);

  const canSubmit = !!(selectedDate && selectedSlot && phone.trim().length >= 7) && !submitting;

  const buildWhatsappMessage = () => {
    const lines = [
      'طلب موعد لخدمة',
      `العيادة: ${clinic.name}`,
      `الخدمة: ${service.name}`,
    ];
    if (priceLabel) {
      lines.push(`السعر: ${priceLabel}${unitLabel ? ` / ${unitLabel}` : ''}`);
    }
    if (service.durationMinutes) lines.push(`المدة: ${service.durationMinutes} دقيقة`);
    if (formattedSelectedDate) lines.push(`التاريخ المفضل: ${formattedSelectedDate}`);
    if (selectedSlot) lines.push(`الوقت المفضل: ${selectedSlot}`);
    lines.push(`الاسم: ${profileName || '—'}`);
    lines.push(`الهاتف: ${phone.trim()}`);
    if (profileEmail) lines.push(`البريد: ${profileEmail}`);
    const selectedPet = myPets.find(p => p.id === selectedPetId);
    if (selectedPet) lines.push(`الحيوان: ${selectedPet.name} (${selectedPet.breed_name || selectedPet.pet_type_display})`);
    if (notes.trim()) lines.push(`ملاحظات: ${notes.trim()}`);
    return lines.join('\n');
  };

  const buildWhatsappUrls = (rawPhone: string | undefined, message: string) => {
    const encoded = encodeURIComponent(message);
    const normalized = (rawPhone || '').replace(/[^\d]/g, '');
    if (!normalized) {
      return { app: `whatsapp://send?text=${encoded}`, web: `https://wa.me/?text=${encoded}` };
    }
    return {
      app: `whatsapp://send?phone=${normalized}&text=${encoded}`,
      web: `https://wa.me/${normalized}?text=${encoded}`,
    };
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedDate || !selectedSlot) return;
    setSubmitting(true);
    const message = buildWhatsappMessage();
    const target = clinic.whatsapp || clinic.phone;
    const { app, web } = buildWhatsappUrls(target, message);

    // Fire-and-log the API call in parallel with the WhatsApp deeplink.
    const numericServiceId = Number(service.id);
    if (Number.isFinite(numericServiceId)) {
      apiService
        .createStorefrontBooking(clinic.id, {
          service_id: numericServiceId,
          customer_name: profileName || 'بدون اسم',
          customer_phone: phone.trim(),
          customer_email: profileEmail || null,
          pet_name: myPets.find(p => p.id === selectedPetId)?.name || null,
          preferred_date: dateKey(selectedDate),
          preferred_time: selectedSlot,
          notes: notes.trim() || null,
        })
        .catch(err => console.warn('createStorefrontBooking failed (non-blocking):', err));
    }

    try {
      const supported = await Linking.canOpenURL(app);
      await Linking.openURL(supported ? app : web);
      onClose();
    } catch (err) {
      try {
        await Linking.openURL(web);
        onClose();
      } catch (fallbackErr) {
        Alert.alert('خطأ', 'تعذر فتح واتساب. حاول مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="إغلاق">
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>طلب موعد</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        enableOnAndroid
        extraScrollHeight={20}
      >
        <View style={styles.summaryCard}>
          <FastImage
            source={{ uri: resolveMediaUrl(clinic.logoUrl, FALLBACK_LOGO), priority: FastImage.priority.normal }}
            style={styles.summaryLogo}
            resizeMode={FastImage.resizeMode.contain}
          />
          <View style={styles.summaryText}>
            <Text style={styles.summaryClinic} numberOfLines={1}>{clinic.name}</Text>
            <Text style={styles.summaryService} numberOfLines={2}>{service.name}</Text>
            <View style={styles.summaryFacts}>
              {service.durationMinutes ? (
                <Text style={styles.summaryFactText}>⏱ {service.durationMinutes} د</Text>
              ) : null}
              {priceLabel ? (
                <Text style={styles.summaryPrice}>
                  {priceLabel}{unitLabel ? ` / ${unitLabel}` : ''}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>اختر التاريخ</Text>
        <MonthGrid
          visibleMonth={visibleMonth}
          selectedDate={selectedDate}
          minDate={today}
          onSelect={handleSelectDate}
          onChangeMonth={handleChangeMonth}
        />

        {selectedDate ? (
          <>
            <Text style={styles.sectionLabel}>اختر الوقت</Text>
            <View style={styles.slotGrid}>
              {slots.map(slot => {
                const isSelected = slot.time === selectedSlot;
                return (
                  <TouchableOpacity
                    key={slot.time}
                    style={[
                      styles.slot,
                      isSelected && styles.slotSelected,
                      slot.disabled && styles.slotDisabled,
                    ]}
                    onPress={() => !slot.disabled && handleSelectSlot(slot.time)}
                    disabled={slot.disabled}
                    accessibilityRole="button"
                    accessibilityLabel={slot.label}
                    accessibilityState={{ selected: isSelected, disabled: slot.disabled }}
                  >
                    <Text style={[
                      styles.slotText,
                      isSelected && styles.slotTextSelected,
                      slot.disabled && styles.slotTextDisabled,
                    ]}>
                      {slot.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {myPets.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>لأي حيوان؟ (اختياري)</Text>
            <View style={styles.petGrid}>
              {myPets.map(pet => {
                const isSelected = pet.id === selectedPetId;
                return (
                  <TouchableOpacity
                    key={pet.id}
                    onPress={() => handleSelectPet(pet.id)}
                    style={[styles.petPill, isSelected && styles.petPillSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[styles.petPillText, isSelected && styles.petPillTextSelected]}>
                      {pet.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : loadingPets ? (
          <ActivityIndicator size="small" color="#02B7B4" style={styles.petLoader} />
        ) : null}

        <Text style={styles.sectionLabel}>رقم الهاتف للتواصل</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={text => {
            phoneTouched.current = true;
            setPhone(text);
          }}
          keyboardType="phone-pad"
          placeholder="مثال: 01234567890"
          placeholderTextColor="#94a3b8"
        />

        <Text style={styles.sectionLabel}>ملاحظات (اختياري)</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="أي تفاصيل تساعد العيادة في التحضير..."
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </KeyboardAwareScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="تأكيد عبر واتساب"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>تأكيد عبر واتساب</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default ServiceBookingScreen;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    paddingTop: Platform.OS === 'ios' ? 50 : 14,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 18, color: '#475569', fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  headerSpacer: { width: 40 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },

  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#e5edf4',
  },
  summaryLogo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#f4f7fb',
    marginEnd: 12,
  },
  summaryText: { flex: 1 },
  summaryClinic: { fontSize: 14, color: '#5f6c7b', marginBottom: 2 },
  summaryService: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 6 },
  summaryFacts: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  summaryFactText: { fontSize: 13, color: '#5f6c7b' },
  summaryPrice: { fontSize: 13, fontWeight: '700', color: '#0f172a' },

  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 18,
    marginBottom: 10,
  },

  calendar: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5edf4',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  monthArrow: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f4f7fb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowText: { fontSize: 24, color: '#1c344d', fontWeight: '700' },
  monthLabel: { fontSize: 16, fontWeight: '700', color: '#0f172a' },

  weekRow: { flexDirection: 'row', paddingHorizontal: 4, marginBottom: 4 },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600',
  },

  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 4 },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#02B7B4',
    borderRadius: 100,
  },
  dayText: { fontSize: 14, color: '#1c344d', fontWeight: '600' },
  dayTextPast: { color: '#cbd5e1', fontWeight: '500' },
  dayTextSelected: { color: '#fff', fontWeight: '700' },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: {
    minWidth: 78,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  slotSelected: { backgroundColor: '#02B7B4', borderColor: '#02B7B4' },
  slotDisabled: { backgroundColor: '#f4f7fb', borderColor: '#eef2f7' },
  slotText: { fontSize: 13, color: '#1c344d', fontWeight: '600' },
  slotTextSelected: { color: '#fff' },
  slotTextDisabled: { color: '#cbd5e1' },

  petGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  petPill: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e1e8f0',
    backgroundColor: '#fff',
  },
  petPillSelected: { backgroundColor: '#02B7B4', borderColor: '#02B7B4' },
  petPillText: { fontSize: 13, color: '#1c344d', fontWeight: '600' },
  petPillTextSelected: { color: '#fff' },
  petLoader: { alignSelf: 'flex-start', marginTop: 8 },

  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e1e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
  },
  notesInput: { minHeight: 90, textAlignVertical: 'top' },

  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  submitButton: {
    backgroundColor: '#02B7B4',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  submitButtonDisabled: { backgroundColor: '#94a3b8' },
  submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
