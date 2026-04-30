// src/screens/DashboardScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AppHeader from '../components/AppHeader';
import Page from '../components/Page';

// WatermelonDB
import * as Device from 'expo-device';
import { database } from '../database/initializeDatabase';
import User from '../database/models/Users';
import { logLogout } from '../services/activitylog';

export default function DashboardScreen() {
  const ref = useRef<any>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  // Προαιρετικά από params (π.χ. μετά το login)
  const params = useLocalSearchParams<{ name?: string; email?: string }>();
  const fromParams = useMemo(
    () => ({
      name: (params.name ?? '').toString(),
      email: (params.email ?? '').toString(),
    }),
    [params.name, params.email]
  );

  // Debug: Log what we received from login
  console.log('📥 Dashboard received params:', params);
  console.log('📥 Dashboard fromParams:', fromParams);

  // Debug: Log what we received from login
  console.log('📥 Dashboard received params:', params);
  console.log('📥 Dashboard fromParams:', fromParams);

  // Fallback από DB
  const [fallbackName, setFallbackName] = useState<string | null>(null);

  useEffect(() => {
    if (fromParams.name || fromParams.email) return;
    (async () => {
      try {
        const usersCol = database.get<User>('users');
        const list = await usersCol.query().fetch();
        if (list.length > 0) {
          setFallbackName((list[0] as any).name ?? 'Χρήστης');
        } else {
          setFallbackName('Χρήστης');
        }
      } catch {
        setFallbackName('Χρήστης');
      }
    })();
  }, [fromParams.name, fromParams.email]);

  const displayName = useMemo(
    () => fromParams.name || fallbackName || 'Χρήστης',
    [fromParams.name, fallbackName]
  );

  // Actions
  const logout = async () => {
    try {
      // Log logout activity - we'll use a system user ID since we don't have the actual user ID here
      await logLogout(
        '1', // System user ID for logout logging
        Device.modelName || 'Unknown Device',
        Platform.OS
      );
    } catch (error) {
      console.error('Error logging logout:', error);
    }
    router.replace('/');
  };
  
  const goCustomers   = () => router.push('/customers');
  const goWarehouse   = () => {
    console.log('🚀 Navigating to warehouse with params:', { name: displayName, email: fromParams.email });
    router.push({
      pathname: '/warehouse',
      params: { name: displayName, email: fromParams.email }
    });
  };
  const goActivityLog = () => router.push('/activitylog');
  const goHistory     = () => router.push('/history');

  // Κάρτες Dashboard
  const CARDS: {
    key: string;
    title: string;
    desc: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }[] = [
    { key: 'customers',  title: 'Πελάτες',              desc: 'Διαχείριση πελατών & καρτελών.',          bg: '#E9F2FF', icon: 'people-outline',   onPress: goCustomers },
    { key: 'warehouse',  title: 'Αποθήκη',              desc: 'Ράφια, τεμάχια, κωδικοί, καταστάσεις.',   bg: '#FFE9F2', icon: 'cube-outline',      onPress: goWarehouse },
    { key: 'activity',   title: 'Log Δραστηριοτήτων',   desc: 'Ζωντανό αρχείο καταγραφής ενεργειών.',    bg: '#E9F9EF', icon: 'pulse-outline',     onPress: goActivityLog },
    { key: 'history',    title: 'Ιστορικό',             desc: 'Αναζήτηση & σύνοψη ανά έτος.',            bg: '#F0E9FF', icon: 'time-outline',      onPress: goHistory },
  ];

  return (
    <Page>
      {/* Ενιαίος header (χωρίς "Πίσω" στο dashboard) */}
      <AppHeader onLogout={logout} />

      {/* Περιεχόμενο Dashboard */}
      <View ref={ref} style={styles.content}>
        <View style={[styles.grid, isWide ? styles.gridWide : undefined]}>
          {CARDS.map((c) => (
            <DashboardCard
              key={c.key}
              title={c.title}
              desc={c.desc}
              bg={c.bg}
              icon={c.icon}
              onPress={c.onPress}
              isWide={isWide}
            />
          ))}
        </View>
      </View>
    </Page>
  );
}

function DashboardCard({
  title,
  desc,
  bg,
  icon,
  onPress,
  isWide,
}: {
  title: string;
  desc: string;
  bg: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  isWide: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: '#00000014' }}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: bg, width: isWide ? '48%' : '100%' },
        pressed ? { opacity: 0.96 } : null,
      ]}
    >
      <View style={styles.cardHeader}>
        <Ionicons name={icon} size={22} color="#1F2A44" style={{ marginRight: 8 }} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>
      <Text style={styles.cardDesc}>{desc}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: '#fff',
  },
  /** GRID */
  grid: {
    flexDirection: 'column',
    paddingTop: 8,
    paddingBottom: 32,
  },
  gridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  /** CARD */
  card: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 22,
    minHeight: 100,
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 16,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 2 },
      web: {},
    }) as object),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#1F2A44' },
  cardDesc: { marginTop: 6, fontSize: 13, color: '#4A5768' },
});
