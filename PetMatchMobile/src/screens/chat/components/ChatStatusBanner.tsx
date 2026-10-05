import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { ChatPhase } from '../../../services/api';

type Props = {
  phase: ChatPhase;
  perspective: 'requester' | 'owner';
  onStartKyc?: () => void;
  onRetryKyc?: () => void;
  rejectionReason?: string; // KYC admin notes
};

const palette: Record<ChatPhase, { bg: string; text: string; iconColor: string }> = {
  pending: { bg: '#FEF3C7', text: '#92400E', iconColor: '#92400E' },
  approved: { bg: '#D1FAE5', text: '#065F46', iconColor: '#065F46' },
  approved_pending_kyc: { bg: '#DBEAFE', text: '#1E3A8A', iconColor: '#1E3A8A' },
  approved_kyc_pending_review: { bg: '#FEF3C7', text: '#92400E', iconColor: '#92400E' },
  approved_kyc_rejected: { bg: '#FEE2E2', text: '#991B1B', iconColor: '#991B1B' },
  rejected: { bg: '#E5E7EB', text: '#374151', iconColor: '#374151' },
};

const labelFor = (phase: ChatPhase, perspective: 'requester' | 'owner'): string => {
  if (phase === 'pending') return '⏳ هذا الطلب قيد المراجعة';
  if (phase === 'approved') return '✅ تم قبول الطلب';
  if (phase === 'rejected') return '🗂 لم يتم قبول هذا الطلب';
  if (phase === 'approved_pending_kyc') {
    return perspective === 'requester'
      ? '🪪 ارفع هويتك لبدء المحادثة'
      : '🪪 في انتظار توثيق المتقدم';
  }
  if (phase === 'approved_kyc_pending_review') {
    return perspective === 'requester'
      ? '⏳ مستندات التوثيق قيد المراجعة'
      : '⏳ قيد مراجعة المستندات';
  }
  if (phase === 'approved_kyc_rejected') {
    return perspective === 'requester'
      ? '✗ لم يتم قبول مستندات التوثيق'
      : '✗ لم تُقبل مستندات المتقدم';
  }
  return '';
};

const ChatStatusBanner: React.FC<Props> = ({
  phase,
  perspective,
  onStartKyc,
  onRetryKyc,
  rejectionReason,
}) => {
  const colors = palette[phase];
  const label = labelFor(phase, perspective);
  if (!label) return null;

  const showKycCta =
    perspective === 'requester' && phase === 'approved_pending_kyc' && !!onStartKyc;
  const showRetryCta =
    perspective === 'requester' && phase === 'approved_kyc_rejected' && !!onRetryKyc;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.label, { color: colors.text }]} numberOfLines={2}>
        {label}
      </Text>
      {phase === 'approved_kyc_rejected' && rejectionReason ? (
        <Text style={[styles.reason, { color: colors.text }]} numberOfLines={3}>
          {rejectionReason}
        </Text>
      ) : null}
      {showKycCta ? (
        <TouchableOpacity onPress={onStartKyc} style={styles.cta}>
          <Text style={styles.ctaText}>ابدأ التوثيق</Text>
        </TouchableOpacity>
      ) : null}
      {showRetryCta ? (
        <TouchableOpacity onPress={onRetryKyc} style={styles.cta}>
          <Text style={styles.ctaText}>أعد المحاولة</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export default React.memo(ChatStatusBanner);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  label: { flex: 1, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  reason: { width: '100%', fontSize: 12, fontStyle: 'italic', textAlign: 'right' },
  cta: { backgroundColor: '#1E3A8A', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  ctaText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
});
