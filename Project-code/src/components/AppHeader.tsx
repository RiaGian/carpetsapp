// src/components/AppHeader.tsx
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

// WatermelonDB fallback
import { database } from '../database/initializeDatabase';
import User from '../database/models/Users';

type Props = {
  showBack?: boolean;           // προαιρετικό "← Πίσω" αριστερά του logo
  onLogout?: () => void;        // προαιρετικό override του logout
};

export default function AppHeader({ showBack = false, onLogout }: Props) {
  const params = useLocalSearchParams<Record<string, string>>();

  // διάβασε όνομα από διάφορα κλειδιά στα params
  const paramName =
    (params?.name as string) ||
    (params?.displayName as string) ||
    (params?.username as string) ||
    (params?.user as string) ||
    '';

  const [fallbackName, setFallbackName] = React.useState<string>('Χρήστης');

  // Fallback DB load
  React.useEffect(() => {
    if (paramName) return;
    let cancelled = false;
    (async () => {
      try {
        const usersCol = database.get<User>('users');
        const list = await usersCol.query().fetch();
        if (!cancelled) setFallbackName(list[0] ? ((list[0] as any).name ?? 'Χρήστης') : 'Χρήστης');
      } catch {
        if (!cancelled) setFallbackName('Χρήστης');
      }
    })();
    return () => { cancelled = true; };
  }, [paramName]);

  // Επανέλεγξε κάθε φορά που η οθόνη επανέρχεται σε focus
  useFocusEffect(
    React.useCallback(() => {
      if (paramName) return;
      let cancelled = false;
      (async () => {
        try {
          const usersCol = database.get<User>('users');
          const list = await usersCol.query().fetch();
          if (!cancelled) setFallbackName(list[0] ? ((list[0] as any).name ?? 'Χρήστης') : 'Χρήστης');
        } catch {
          if (!cancelled) setFallbackName('Χρήστης');
        }
      })();
      return () => { cancelled = true; };
    }, [paramName])
  );

  const displayName = paramName || fallbackName || 'Χρήστης';

  const goBack = () => {
    try {
      if ((router as any).canGoBack?.()) router.back();
      else router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    }
  };

  const doLogout = () => {
    if (onLogout) return onLogout();
    router.replace('/');
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

  connectedText: { fontSize: 14, color: '#666', fontWeight: '600' },
  userName: { color: colors.primary, fontWeight: '800' },

  textBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  textBtnLabel: { fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },

  divider: { height: 1, backgroundColor: '#E0E0E0', marginTop: 4, marginBottom: 12 },
});
