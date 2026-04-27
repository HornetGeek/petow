import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { fetchAppConfig, type AppConfig } from '../services/appConfig';
import {
  dismissSoftUpdate,
  evaluateUpdateRequirement,
  getInstalledAppVersion,
  hasDismissedSoftUpdate,
  type UpdateRequirement,
} from '../services/appUpdate';

type AppUpdateGateProps = {
  children: React.ReactNode;
};

const openStoreUrl = async (storeUrl: string) => {
  if (!storeUrl) {
    Alert.alert('التحديث غير متاح', 'رابط التحديث غير مُعد بعد. حاول مرة أخرى لاحقاً.');
    return;
  }

  try {
    const supported = await Linking.canOpenURL(storeUrl);
    if (!supported) {
      throw new Error('unsupported_url');
    }
    await Linking.openURL(storeUrl);
  } catch {
    Alert.alert('تعذر فتح المتجر', 'لم نتمكن من فتح رابط التحديث على هذا الجهاز.');
  }
};

const AppUpdateGate: React.FC<AppUpdateGateProps> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [hardRequirement, setHardRequirement] = useState<UpdateRequirement | null>(null);
  const [softRequirement, setSoftRequirement] = useState<UpdateRequirement | null>(null);
  const [softVisible, setSoftVisible] = useState(false);

  const evaluateConfig = useCallback(async (force = false) => {
    if (force) {
      setIsRetrying(true);
    } else {
      setIsLoading(true);
    }

    try {
      const config: AppConfig = await fetchAppConfig(true);
      const currentVersion = getInstalledAppVersion();
      const requirement = evaluateUpdateRequirement(config, currentVersion);

      if (requirement.kind === 'hard') {
        setHardRequirement(requirement);
        setSoftRequirement(null);
        setSoftVisible(false);
        return;
      }

      setHardRequirement(null);

      if (requirement.kind === 'soft') {
        const dismissed = await hasDismissedSoftUpdate(
          requirement.currentVersion,
          requirement.targetVersion,
        );
        setSoftRequirement(requirement);
        setSoftVisible(!dismissed);
        return;
      }

      setSoftRequirement(null);
      setSoftVisible(false);
    } finally {
      setIsRetrying(false);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    evaluateConfig(false);
  }, [evaluateConfig]);

  const handleSoftDismiss = useCallback(async () => {
    if (softRequirement?.kind === 'soft') {
      await dismissSoftUpdate(
        softRequirement.currentVersion,
        softRequirement.targetVersion,
      );
    }
    setSoftVisible(false);
  }, [softRequirement]);

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#02B7B4" />
        <Text style={styles.loadingTitle}>جارٍ تجهيز التطبيق</Text>
        <Text style={styles.loadingSubtitle}>نتحقق من توفر أحدث إصدار مناسب لهذا الجهاز.</Text>
      </View>
    );
  }

  if (hardRequirement?.kind === 'hard') {
    return (
      <View style={styles.blockedScreen}>
        <View style={styles.blockedCard}>
          <Text style={styles.badge}>تحديث إلزامي</Text>
          <Text style={styles.blockedTitle}>يلزم تحديث التطبيق للمتابعة</Text>
          <Text style={styles.blockedBody}>
            هذا الإصدار لم يعد مدعوماً. حدّث التطبيق من المتجر للاستمرار في استخدام Petow.
          </Text>
          <Text style={styles.versionMeta}>
            الإصدار الحالي: {hardRequirement.currentVersion || 'غير معروف'}
          </Text>
          <Text style={styles.versionMeta}>
            الحد الأدنى المطلوب: {hardRequirement.targetVersion}
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => openStoreUrl(hardRequirement.storeUrl)}
          >
            <Text style={styles.primaryButtonText}>التحديث الآن</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, isRetrying && styles.buttonDisabled]}
            onPress={() => evaluateConfig(true)}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <ActivityIndicator size="small" color="#1c344d" />
            ) : (
              <Text style={styles.secondaryButtonText}>إعادة المحاولة</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <>
      {children}
      <Modal
        visible={softVisible && softRequirement?.kind === 'soft'}
        transparent
        animationType="fade"
        onRequestClose={handleSoftDismiss}
      >
        <Pressable style={styles.modalOverlay} onPress={handleSoftDismiss}>
          <Pressable style={styles.softCard} onPress={() => undefined}>
            <Text style={styles.softBadge}>تحديث موصى به</Text>
            <Text style={styles.softTitle}>يتوفر إصدار أحدث من التطبيق</Text>
            <Text style={styles.softBody}>
              نوصي بتحديث Petow للحصول على أفضل أداء وأحدث التحسينات.
            </Text>
            <Text style={styles.versionMeta}>
              الإصدار الحالي: {softRequirement?.currentVersion || 'غير معروف'}
            </Text>
            <Text style={styles.versionMeta}>
              الإصدار الموصى به: {softRequirement?.targetVersion}
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => openStoreUrl(softRequirement?.storeUrl || '')}
            >
              <Text style={styles.primaryButtonText}>فتح المتجر</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleSoftDismiss}>
              <Text style={styles.secondaryButtonText}>لاحقاً</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    backgroundColor: '#f4f7fb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  loadingTitle: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: '700',
    color: '#1c344d',
    textAlign: 'center',
  },
  loadingSubtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    color: '#607183',
    textAlign: 'center',
  },
  blockedScreen: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    justifyContent: 'center',
  },
  blockedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffe3e3',
    color: '#d90429',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 16,
  },
  blockedTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#10243b',
    marginBottom: 12,
  },
  blockedBody: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4f6275',
    marginBottom: 18,
  },
  versionMeta: {
    fontSize: 13,
    color: '#6f8090',
    marginBottom: 6,
  },
  primaryButton: {
    marginTop: 18,
    backgroundColor: '#02B7B4',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    backgroundColor: '#edf2f7',
  },
  secondaryButtonText: {
    color: '#1c344d',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  softCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 22,
  },
  softBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e6faf9',
    color: '#027c79',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 14,
  },
  softTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10243b',
    marginBottom: 10,
  },
  softBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#556779',
  },
});

export default AppUpdateGate;
