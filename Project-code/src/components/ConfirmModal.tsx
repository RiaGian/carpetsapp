import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { colors } from '../theme/colors'


type Props = {
  visible: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  visible,
  title = 'Επιβεβαίωση',
  message,
  confirmText = 'Διαγραφή',
  cancelText = 'Άκυρο',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <TouchableOpacity onPress={onCancel} style={[styles.btn, styles.cancel]}>
              <Text style={[styles.btnText, styles.cancelText]}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm} style={[styles.btn, styles.danger]}>
              <Text style={[styles.btnText, styles.dangerText]}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  card: {
    width: '100%', maxWidth: 420, backgroundColor: '#fff',
    borderRadius: 14, padding: 18,
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8, color: '#111827' },
  message: { fontSize: 14, color: '#374151', marginBottom: 14 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  btnText: { fontWeight: '800', fontSize: 14 },
  cancel: { backgroundColor: '#F3F4F6' },
  cancelText: { color: '#374151' },
  danger: { backgroundColor: '#e2edfeff' },
  dangerText: { color: colors.primary },
})
