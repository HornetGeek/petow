import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { apiService, VerificationStatus } from '../../services/api';
import AppIcon from '../../components/icons/AppIcon';
import VerificationFormBody from './VerificationFormBody';

interface VerificationScreenProps {
  onClose: () => void;
  onVerificationSubmitted?: () => void;
  noticeMessage?: string;
}

const VerificationScreen: React.FC<VerificationScreenProps> = ({ onClose, onVerificationSubmitted, noticeMessage }) => {
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    loadVerificationStatus();
  }, []);

  const loadVerificationStatus = async () => {
    try {
      setStatusLoading(true);
      const response = await apiService.getVerificationStatus();
      if (response.success && response.data) {
        setVerificationStatus(response.data);
      }
    } catch (error) {
      console.error('Error loading verification status:', error);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleSubmitted = () => {
    if (onVerificationSubmitted) {
      onVerificationSubmitted();
    }
    onClose();
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'approved':
        return '#4CAF50';
      case 'rejected':
        return '#F44336';
      case 'pending':
        return '#FF9800';
      default:
        return '#757575';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'approved':
        return '✓';
      case 'rejected':
        return '✗';
      case 'pending':
        return '⏱';
      default:
        return '?';
    }
  };

  const NoticeBanner = () => {
    if (!noticeMessage) {
      return null;
    }
    return (
      <View style={styles.noticeBanner}>
        <Text style={styles.noticeTitle}>هام</Text>
        <Text style={styles.noticeText}>{noticeMessage}</Text>
      </View>
    );
  };

  const Header = ({ title }: { title: string }) => (
    <View style={styles.header}>
      <Text style={styles.title}>{title}</Text>
      <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel="إغلاق">
        <AppIcon name="close" size={22} color="#666" />
      </TouchableOpacity>
    </View>
  );

  if (statusLoading) {
    return (
      <View style={styles.container}>
        <Header title="التحقق من الحساب" />
        <NoticeBanner />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      </View>
    );
  }

  if (verificationStatus?.has_verification && verificationStatus.verification) {
    const { verification } = verificationStatus;
    const statusColor = getStatusColor(verification.status);
    const statusIcon = getStatusIcon(verification.status);

    return (
      <View style={styles.container}>
        <Header title="حالة التحقق" />
        <ScrollView style={styles.content}>
          <NoticeBanner />
          <View style={[styles.statusCard, { borderColor: statusColor }]}>
            <View style={[styles.statusIconContainer, { backgroundColor: statusColor }]}>
              <Text style={styles.statusIcon}>{statusIcon}</Text>
            </View>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {verification.status_display}
            </Text>
            <Text style={styles.statusDate}>
              تاريخ التقديم: {new Date(verification.created_at).toLocaleDateString('ar-EG')}
            </Text>
            {verification.reviewed_at && (
              <Text style={styles.statusDate}>
                تاريخ المراجعة: {new Date(verification.reviewed_at).toLocaleDateString('ar-EG')}
              </Text>
            )}
            {verification.admin_notes && (
              <View style={styles.notesContainer}>
                <Text style={styles.notesLabel}>ملاحظات الإدارة:</Text>
                <Text style={styles.notesText}>{verification.admin_notes}</Text>
              </View>
            )}
          </View>

          {verification.status === 'pending' && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                طلبك قيد المراجعة. سيتم إعلامك بالنتيجة في أقرب وقت.
              </Text>
            </View>
          )}

          {verification.status === 'approved' && (
            <View style={[styles.infoBox, { backgroundColor: '#E8F5E9' }]}>
              <Text style={[styles.infoText, { color: '#2E7D32' }]}>
                تم التحقق من حسابك بنجاح! يمكنك الآن تقديم طلبات التبني.
              </Text>
            </View>
          )}

          {verification.status === 'rejected' && (
            <View style={[styles.infoBox, { backgroundColor: '#FFEBEE' }]}>
              <Text style={[styles.infoText, { color: '#C62828' }]}>
                تم رفض طلب التحقق. يرجى التواصل مع الدعم للمزيد من المعلومات.
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="التحقق من الحساب" />

      <ScrollView style={styles.content}>
        <NoticeBanner />
        <View style={styles.instructionsCard}>
          <Text style={styles.instructionsTitle}>تعليمات التحقق</Text>
          <Text style={styles.instructionsText}>
            • قم بتحميل صورة واضحة لبطاقة الهوية الخاصة بك{'\n'}
            • صوّر فيديو قصير (10–15 ثانية) وأنت تحمل بطاقة الهوية بجانب وجهك{'\n'}
            • تأكد من وضوح وجهك والهوية في الفيديو{'\n'}
            • سيتم مراجعة طلبك خلال 24–48 ساعة
          </Text>
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.instructionsText, { color: '#0f5132' }]}>لماذا نطلب ذلك؟</Text>
            <Text style={[styles.instructionsText, { marginTop: 6 }]}>
              الهدف هو تأكيد حسابك وحماية مجتمع Petow من الحسابات الوهمية ومنع التجار،
              ليكون التطبيق أكثر أمانًا للجميع.
            </Text>
          </View>
        </View>

        <VerificationFormBody onSubmitted={handleSubmitted} />

        <View style={styles.privacyNote}>
          <Text style={styles.privacyNoteText}>
            معلوماتك الشخصية محمية ومشفرة. سيتم استخدامها فقط لأغراض التحقق.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  noticeBanner: {
    backgroundColor: '#FFF4E5',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FDBA74',
    marginBottom: 16,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#C2410C',
    marginBottom: 8,
  },
  noticeText: {
    fontSize: 14,
    color: '#9A3412',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  instructionsCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 10,
  },
  instructionsText: {
    fontSize: 14,
    color: '#424242',
    lineHeight: 22,
  },
  privacyNote: {
    marginTop: 20,
    padding: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    marginBottom: 20,
  },
  privacyNoteText: {
    fontSize: 12,
    color: '#E65100',
    textAlign: 'center',
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
  },
  statusIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIcon: {
    fontSize: 40,
    color: '#fff',
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  statusDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  notesContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    width: '100%',
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  notesText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  infoBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 14,
    color: '#2E7D32',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default VerificationScreen;
