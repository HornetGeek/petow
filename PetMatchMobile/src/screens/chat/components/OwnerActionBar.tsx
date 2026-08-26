import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';

type Props = {
  onApprove: () => Promise<void> | void;
  onReject: () => Promise<void> | void;
  disabled?: boolean;
};

const OwnerActionBar: React.FC<Props> = ({ onApprove, onReject, disabled }) => {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const wrap = (kind: 'approve' | 'reject', fn: () => Promise<void> | void) => async () => {
    if (busy || disabled) return;
    setBusy(kind);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={[styles.button, styles.reject]}
        onPress={wrap('reject', onReject)}
        disabled={!!busy || !!disabled}
        accessibilityRole="button"
        accessibilityLabel="رفض"
      >
        {busy === 'reject' ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>✕  رفض</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.button, styles.approve]}
        onPress={wrap('approve', onApprove)}
        disabled={!!busy || !!disabled}
        accessibilityRole="button"
        accessibilityLabel="قبول"
      >
        {busy === 'approve' ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>✓  قبول</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default OwnerActionBar;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approve: { backgroundColor: '#16A34A' },
  reject: { backgroundColor: '#B91C1C' },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
