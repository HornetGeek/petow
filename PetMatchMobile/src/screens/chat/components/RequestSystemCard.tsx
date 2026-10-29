import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  housingTypeLabel,
  experienceLevelLabel,
  timeAvailabilityLabel,
  feePaidByLabel,
  yesNoLabel,
  formatMeetingDate,
} from '../../../utils/requestEnumLabels';

type AdoptionPayload = {
  kind: 'adoption';
  adopterName?: string;
  adopterAge?: number;
  adopterPhone?: string;
  housingType?: string;
  familyMembers?: number;
  experienceLevel?: string;
  timeAvailability?: string;
  reasonForAdoption?: string;
  feedingPlan?: string;
  exercisePlan?: string;
  vetCarePlan?: string;
  emergencyPlan?: string;
  notes?: string;
  familyAgreement?: boolean;
  agreesToFollowUp?: boolean;
  agreesToVetCare?: boolean;
  agreesToTraining?: boolean;
};

type BreedingPayload = {
  kind: 'breeding';
  myPetName?: string;
  myPetBreed?: string;
  myPetTypeDisplay?: string;
  meetingDate?: string;
  message?: string;
  contactPhone?: string;
  agreedFee?: string;
  feePaidBy?: string;
  veterinaryClinicName?: string;
};

export type RequestSystemCardPayload = AdoptionPayload | BreedingPayload;

type Props = {
  payload: RequestSystemCardPayload;
  defaultCollapsed?: boolean;
};

const renderRow = (label: string, value: string | number | undefined) => {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={styles.row} key={label}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{String(value)}</Text>
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
              {renderRow('الاسم', payload.adopterName)}
              {renderRow('العمر', payload.adopterAge)}
              {renderRow('الهاتف', payload.adopterPhone)}
              {renderRow('نوع السكن', housingTypeLabel(payload.housingType))}
              {renderRow('عدد أفراد العائلة', payload.familyMembers)}
              {renderRow('مستوى الخبرة', experienceLevelLabel(payload.experienceLevel))}
              {renderRow('الوقت المتاح', timeAvailabilityLabel(payload.timeAvailability))}
              {renderRow('سبب التبني', payload.reasonForAdoption)}
              {renderRow('خطة التغذية', payload.feedingPlan)}
              {renderRow('خطة التمارين', payload.exercisePlan)}
              {renderRow('الرعاية البيطرية', payload.vetCarePlan)}
              {renderRow('خطة الطوارئ', payload.emergencyPlan)}
              {renderRow('ملاحظات', payload.notes)}
              {renderRow('موافقة العائلة', yesNoLabel(payload.familyAgreement))}
              {renderRow('موافقة على المتابعة', yesNoLabel(payload.agreesToFollowUp))}
              {renderRow('موافقة على الرعاية البيطرية', yesNoLabel(payload.agreesToVetCare))}
              {renderRow('موافقة على التدريب', yesNoLabel(payload.agreesToTraining))}
            </>
          ) : (
            <>
              {renderRow(
                'حيواني المختار',
                payload.myPetName
                  ? payload.myPetBreed
                    ? `${payload.myPetName} – ${payload.myPetBreed}`
                    : payload.myPetName
                  : undefined,
              )}
              {renderRow('نوع الحيوان', payload.myPetTypeDisplay)}
              {renderRow('موعد اللقاء المقترح', formatMeetingDate(payload.meetingDate))}
              {renderRow('رسالة الطالب', payload.message)}
              {renderRow('رقم التواصل', payload.contactPhone)}
              {renderRow('العيادة البيطرية', payload.veterinaryClinicName)}
              {renderRow(
                'الأتعاب',
                payload.agreedFee
                  ? `${payload.agreedFee}${payload.feePaidBy ? ` — ${feePaidByLabel(payload.feePaidBy)}` : ''}`
                  : undefined,
              )}
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
  body: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  row: { flexDirection: 'column', gap: 2 },
  rowLabel: { fontSize: 11, color: '#6B7280', textAlign: 'right' },
  rowValue: { fontSize: 13, color: '#111827', textAlign: 'right' },
});
