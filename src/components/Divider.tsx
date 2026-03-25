import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export default function Divider({ label = 'ή' }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.line} />
      <Text style={styles.text}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 14, width: '100%' },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  text: { color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
});