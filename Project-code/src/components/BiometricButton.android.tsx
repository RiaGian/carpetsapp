import * as LocalAuthentication from 'expo-local-authentication';
import { Alert, Text, TouchableOpacity } from 'react-native';

type Props = { onSuccess: () => void };

export default function BiometricButton({ onSuccess }: Props) {
  const onPress = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware) {
        Alert.alert('Αποτύπωμα', 'Η συσκευή δεν υποστηρίζει βιομετρικά.');
        return;
      }
      if (!isEnrolled) {
        Alert.alert('Αποτύπωμα', 'Δεν έχει καταχωρηθεί αποτύπωμα στη συσκευή.');
        return;
      }

      // Αν η συσκευή υποστηρίζει και άλλα βιομετρικά, το Android θα εμφανίσει το system prompt.
      // Στόχος μας είναι fingerprint, αλλά το prompt μπορεί να δείξει και άλλες επιλογές αν υπάρχουν.
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Fingerprint',
        // Στο Android μπορούμε να επιτρέψουμε fallback σε PIN/Pattern αν το θες:
        // fallbackToDeviceCredential: true, // (Υποστηρίζεται σε αρκετές εκδόσεις)
        requireConfirmation: false,
      });

      if (res.success) onSuccess();
    } catch (e) {
      Alert.alert('Σφάλμα Αποτυπώματος', String(e));
    }
  };

  return (
    <TouchableOpacity onPress={onPress} style={{ padding: 12, alignItems: 'center' }}>
      <Text>🖐️ Σύνδεση με αποτύπωμα</Text>
    </TouchableOpacity>
  );
}
