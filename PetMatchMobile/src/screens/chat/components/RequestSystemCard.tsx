import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

type AdoptionPayload = {
  kind: 'adoption';
  housingType?: string;
  hasExperience?: boolean;
  experienceText?: string;
  notes?: string;
  feedingPlan?: string;
  exercisePlan?: string;
  vetCarePlan?: string;
  emergencyPlan?: string;
};

type BreedingPayload = {
  kind: 'breeding';
  myPetName?: string;
  meetingDate?: string;
  notes?: string;
};

export type RequestSystemCardPayload = AdoptionPayload | BreedingPayload;

type Props = {
  payload: RequestSystemCardPayload;
  defaultCollapsed?: boolean;
};

const renderRow = (label: string, value: string | undefined) => {
  if (!value) return null;
  return (
    <View style={styles.row} key={label}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={3}>{value}</Text>
    </View>
  );
};

const RequestSystemCard: React.FC<Props> = ({ payload, defaultCollapsed = false }) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const title = payload.kind === 'adoption' ? '📋 طلب تبني' : '📋 طلب تزاوج';

  return (
    <View style={styles.card}>
      <TouchableOpacity
        onPress={() => setCollapsed(c => !c)}
        accessibilityRole="button"
        style={styles.header}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.toggle}>{collapsed ? 'عرض التفاصيل' : 'إخفاء'}</Text>
      </TouchableOpacity>
      {collapsed ? null : (
        <View style={styles.body}>
          {payload.kind === 'adoption' ? (
            <>
              {renderRow('نوع السكن', payload.housingType)}
              {renderRow(
                'خبرة سابقة',
                payload.hasExperience
                  ? payload.experienceText || 'نعم'
                  : payload.hasExperience === false
                  ? 'لا'
                  : undefined,
              )}
              {renderRow('خطة التغذية', payload.feedingPlan)}
              {renderRow('خطة التمارين', payload.exercisePlan)}
              {renderRow('الرعاية البيطرية', payload.vetCarePlan)}
              {renderRow('خطة الطوارئ', payload.emergencyPlan)}
              {renderRow('ملاحظات', payload.notes)}
            </>
          ) : (
            <>
              {renderRow('الحيوان المختار', payload.myPetName)}
              {renderRow('موعد اللقاء المقترح', payload.meetingDate)}
              {renderRow('ملاحظات', payload.notes)}
            </>
          )}
        </View>
      )}
    </View>
  );
};

export default React.memo(RequestSystemCard);

const styles = StyleSheet.create({
  card: {
    margin: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 14, fontWeight: '700', color: '#111827' },
  toggle: { fontSize: 12, color: '#1E3A8A', fontWeight: '600' },
  body: { paddingHorizontal: 14, paddingBottom: 12, gap: 6 },
  row: { flexDirection: 'column', gap: 2 },
  rowLabel: { fontSize: 11, color: '#6B7280', textAlign: 'right' },
  rowValue: { fontSize: 13, color: '#111827', textAlign: 'right' },
});
