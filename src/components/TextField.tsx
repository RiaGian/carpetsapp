import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors } from '../theme/colors';

type Props = TextInputProps & { label: string; placeholderText?: string };


export default function TextField({ label, style, placeholderText, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, style as any]}
        placeholder={placeholderText}
        placeholderTextColor="#b0b0b0"  
        {...rest}
      />
    </View>
  );
}


const styles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  label: { fontSize: 12, color: colors.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
});
