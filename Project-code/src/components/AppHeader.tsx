// src/components/AppHeader.tsx
import { router, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../state/AuthProvider'; // ✅ παίρνουμε τον τρέχοντα χρήστη
import { colors } from '../theme/colors';

type Props = {
  showBack?: boolean;   // δείξε κουμπί "Πίσω"
  onLogout?: () => void; // custom logout handler (αν δεν δοθεί, θα γίνει signOut() από Auth)
};

export default function AppHeader({ showBack = false, onLogout }: Props) {
  const params = useLocalSearchParams<Record<string, string>>();
  const { user, signOut } = useAuth(); // ✅ user από context (persistent)

  // Ό,τι μπορεί να έχει έρθει από route params (δεύτερο fallback)
  const paramName =
    (params?.name as string) ||
    (params?.displayName as string) ||
    (params?.username as string) ||
    (params?.user as string) ||
    '';

  // Τι θα δείξουμε τελικά:
  // 1) user.name ή user.email από Auth
  // 2) αλλιώς, paramName (αν υπάρχει)
  // 3) αλλιώς, "Χρήστης"
  const displayName = user?.name || user?.email || paramName || 'Χρήστης';

  const goBack = () => {
    try {
      if ((router as any).canGoBack?.()) router.back();
      else router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    }
  };

  const doLogout = async () => {
    if (onLogout) return onLogout();
    try {
      await signOut();            // ✅ καθάρισμα auth state + storage
      router.replace('/');        // -> login
    } catch {
      router.replace('/');
    }
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        {/* Αριστερά: Πίσω (optional) + Logo + App name */}
        <View style={styles.leftRow}>
          {showBack && (
            <Pressable onPress={goBack} style={({ pressed }) => [styles.textBtn, pressed && styles.pressed]}>
              <Text style={[styles.textBtnLabel, { color: '#666' }]}>← Πίσω</Text>
            </Pressable>
          )}

          <View style={[styles.logoRow, showBack && { marginLeft: 8 }]}>
            <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={[styles.logoText, { marginLeft: 8 }]}>Carpets App</Text>
          </View>
        </View>

        {/* Δεξιά: Συνδεδεμένος + Αποσύνδεση */}
        <View style={styles.rightRow}>
          <Text style={styles.connectedText}>
            Συνδεδεμένος: <Text style={styles.userName}>{displayName}</Text>
          </Text>

          <Pressable onPress={doLogout} style={({ pressed }) => [styles.textBtn, pressed && styles.pressed]}>
            <Text style={[styles.textBtnLabel, { color: '#666' }]}>Αποσύνδεση</Text>
          </Pressable>
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
  },
  header: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: { width: 46, height: 36, borderRadius: 8 },
  logoText: { fontSize: 22, fontWeight: '800', color: colors.primary },

  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  connectedText: { fontSize: 15, color: '#666', fontWeight: '400' },
  userName: { color: colors.primary, fontWeight: '400', fontSize: 15 },

  textBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  textBtnLabel: { fontSize: 15, fontWeight: '400' },
  pressed: { opacity: 0.7 },

  divider: { height: 1, backgroundColor: '#E0E0E0', marginTop: 4, marginBottom: 12 },
});
