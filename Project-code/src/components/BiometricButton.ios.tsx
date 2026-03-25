import * as LocalAuthentication from 'expo-local-authentication';
import { Alert, Text, TouchableOpacity } from 'react-native';

type Props = { onSuccess: () => void };

export default function BiometricButton({ onSuccess }: Props) {
  const onPress = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        Alert.alert('Face ID', 'Η συσκευή δεν έχει ρυθμιστεί για Face ID.');
        return;
      }

      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Face ID',
        disableDeviceFallback: true,
        requireConfirmation: false,
      });

      if (res.success) onSuccess();
    } catch (e) {
      Alert.alert('Σφάλμα Face ID', String(e));
    }
  };

  return (
    <TouchableOpacity onPress={onPress} style={{ padding: 12, alignItems: 'center' }}>
      <Text>🔓 Σύνδεση με Face ID</Text>
    </TouchableOpacity>
  );
}
