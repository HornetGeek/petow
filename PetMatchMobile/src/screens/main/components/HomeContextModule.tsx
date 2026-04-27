import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

/**
 * Context-aware module rendered on Home where the static "discover
 * adoption" banner used to live. It only appears when there's a
 * specific actionable signal — unread chats, or a brand-new user
 * with no pets — and otherwise renders nothing. The "earned banner"
 * model: we don't fill the slot with a static promo for verbs the
 * user already has tiles for.
 *
 * Future scenarios worth adding when the parent has the state:
 *   - "request approved in last 24h" → open that specific chat
 *   - "adoption requester needs KYC" → open the chat with the sheet
 */

type Props = {
  unreadCount: number;
  userPetsCount: number;
  onOpenChatList: () => void;
  onOpenAddPet: () => void;
};

const HomeContextModule: React.FC<Props> = ({
  unreadCount,
  userPetsCount,
  onOpenChatList,
  onOpenAddPet,
}) => {
  // Priority 1: unread chats. Most actionable, highest signal.
  if (unreadCount > 0) {
    const label = unreadCount > 99 ? '99+' : String(unreadCount);
    return (
      <TouchableOpacity
        style={[styles.module, styles.unreadModule]}
        onPress={onOpenChatList}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>💬</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>لديك {label} رسالة جديدة</Text>
          <Text style={styles.subtitle}>اضغط لمتابعة محادثاتك</Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>افتح الدردشة</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // Priority 2: brand-new user, no pets yet. Get them to the primary
  // verb (Add Pet) without competing with the quick-action grid.
  if (userPetsCount === 0) {
    return (
      <TouchableOpacity
        style={[styles.module, styles.onboardingModule]}
        onPress={onOpenAddPet}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <View style={styles.iconCircle}>
          <Text style={styles.icon}>🐾</Text>
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>ابدأ الآن</Text>
          <Text style={styles.subtitle}>أضف حيوانك الأول لتبدأ التبني أو التزاوج</Text>
        </View>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>إضافة حيوان</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // No actionable signal — render nothing. The services strip moves up
  // to fill the space, which is the right outcome.
  return null;
};

export default React.memo(HomeContextModule);

const styles = StyleSheet.create({
  module: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    gap: 12,
  },
  unreadModule: {
    backgroundColor: '#DBEAFE',
  },
  onboardingModule: {
    backgroundColor: '#E8F8F5',
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 12,
    color: '#374151',
    marginTop: 2,
    textAlign: 'right',
  },
  cta: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
