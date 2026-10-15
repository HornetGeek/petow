import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import VerificationFormBody from '../../profile/VerificationFormBody';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
};

const VerificationFormSheet: React.FC<Props> = ({ visible, onClose, onSubmitted }) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handleRow}>
            <View style={styles.handle} />
          </View>
          <View style={styles.headerRow}>
            <Text style={styles.title}>توثيق الهوية</Text>
            {/* NOTE: VerificationFormBody owns its own `submitting` state and shows a
                blocking Alert on success. Closing the sheet while a submission is
                in-flight is technically possible via this button or the Android back
                button, but the body will still call `onSubmitted` from the success
                Alert's onPress, which by then references a torn-down sheet. If this
                becomes a real issue, hoist `submitting` to this host and gate close. */}
            <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <VerificationFormBody
            onSubmitted={() => {
              onSubmitted();
              onClose();
            }}
            onCancel={onClose}
          />
        </View>
      </View>
    </Modal>
  );
};

export default VerificationFormSheet;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 16,
    maxHeight: '90%',
  },
  handleRow: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#111827' },
  close: { fontSize: 18, color: '#6B7280' },
});
