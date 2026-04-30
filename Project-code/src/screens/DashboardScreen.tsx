// src/screens/DashboardScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import { colors } from '../theme/colors';


import * as Device from 'expo-device';
import { database } from '../database/initializeDatabase';
import User from '../database/models/Users';
import { logLogout } from '../services/activitylog';

import { usePreview } from '../state/PreviewProvider';

import { useFocusEffect } from '@react-navigation/native';
import { observeCustomers } from '../services/customer';

type CustomersPreview = { count: number; names: string[] };

export default function DashboardScreen() {
  const ref = useRef<any>(null);
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const params = useLocalSearchParams<{ name?: string; email?: string }>();
  const fromParams = useMemo(
    () => ({
      name: (params.name ?? '').toString(),
      email: (params.email ?? '').toString(),
    }),
    [params.name, params.email]
  );

  const [fallbackName, setFallbackName] = useState<string | null>(null);
  const [customersPreview, setCustomersPreviewLocal] = useState<CustomersPreview | null>(null);

  //  params -->  fallback
  React.useEffect(() => {
    if (fromParams.name || fromParams.email) return;
    (async () => {
      try {
        const usersCol = database.get<User>('users');
        const list = await usersCol.query().fetch();
        if (list.length > 0) {
          setFallbackName((list[0] as any).name ?? 'Χρήστης');
        } else setFallbackName('Χρήστης');
      } catch {
        setFallbackName('Χρήστης');
      }
    })();
  }, [fromParams.name, fromParams.email]);

  const displayName = useMemo(
    () => fromParams.name || fallbackName || 'Χρήστης',
    [fromParams.name, fallbackName]
  );

  //  live observe of customer on dashboard
  useFocusEffect(
    useCallback(() => {
      const sub = observeCustomers(500).subscribe((rows: any[]) => {
        const count = rows.length;
        const names = rows.map((r: any) => {
          const first = r.firstName ?? r._raw?.first_name ?? '';
          const last = r.lastName ?? r._raw?.last_name ?? '';
          return `${first} ${last}`.trim() || '—';
        });
        setCustomersPreviewLocal({ count, names });
      });
      return () => sub.unsubscribe();
    }, [])
  );

  // Actions
  const logout = async () => {
    try {
      await logLogout(
        '1',
        Device.modelName || 'Unknown Device',
        Platform.OS
      );
    } catch (error) {
      console.error('Error logging logout:', error);
    }
    router.replace('/');
  };

  const goCustomers   = () => router.push('/customers');
  const goWarehouse   = () => router.push({ pathname: '/warehouse', params: { name: displayName, email: fromParams.email } });
  const goActivityLog = () => router.push('/activitylog');
  const goHistory     = () => router.push('/history');

  const CARDS = [
    { key: 'customers', title: 'Πελάτες', bg: '#E9F2FF', icon: 'people-outline', onPress: goCustomers },
    { key: 'warehouse', title: 'Αποθήκη', bg: '#FFE9F2', icon: 'cube-outline', onPress: goWarehouse },
    { key: 'activity', title: 'Log Δραστηριοτήτων', bg: '#E9F9EF', icon: 'pulse-outline', onPress: goActivityLog },
    { key: 'history', title: 'Ιστορικό', bg: '#F0E9FF', icon: 'time-outline', onPress: goHistory },
  ];

  return (
    <Page>
      <AppHeader onLogout={logout} />

      <View ref={ref} style={styles.content}>
        {/* Πάνω 4 κάρτες */}
        <View style={[styles.grid, isWide ? styles.gridWide : undefined]}>
          {CARDS.map((c) => (
            <DashboardCard
              key={c.key}
              kind={c.key}
              title={c.title}
              bg={c.bg}
              icon={c.icon}
              onPress={c.onPress}
              isWide={isWide}
              customersPreview={c.key === 'customers' ? customersPreview : null}
            />
          ))}
        </View>

        {/* Κάτω mini cards — χωρίς icons, με χρώμα ανά κάρτα */}
        <View style={styles.statsRow}>
          <StatCard title="Συνολικοί Πελάτες" value={String(customersPreview?.count ?? 0)} color="#B8C8FF" />
          <StatCard title="Τεμάχια στην Αποθήκη" value="14" color="#F5A5C0" />
          <StatCard title="Καταγραφές Log" value="32" color="#A3E3BB" />
          <StatCard title="Σύνολο Δεδομένων" value="128" color="#C3B2F7" />
        </View>
      </View>

      {/* Floating κουμπί κάτω-αριστερά, πάνω από όλα */}
      <Pressable
        onPress={() => router.push('/orders')}
        accessibilityRole="button"
        style={styles.floatingCart}
      >
        <Ionicons name="cart" size={24} color="#FFFFFF" />
      </Pressable>
    </Page>
  );
}

// dashboard card
function DashboardCard({ kind, title, bg, icon, onPress, isWide, customersPreview }: any) {
  const { previews } = usePreview();
  const effectivePreview = customersPreview ?? previews.customers;
  const [hovered, setHovered] = useState(false);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.card,
        {
          backgroundColor: bg,
          width: isWide ? '23%' : '100%',
          transform: [{ scale: hovered ? 1.08 : 1 }],
          ...(Platform.OS === 'web'
            ? { transition: 'transform 0.2s ease-in-out' } as any
            : {}),
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <Ionicons name={icon as any} size={22} color="#1F2A44" style={{ marginRight: 8 }} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>

      {/* 👇 Εμφάνιση όλων των πελατών, χωρίς limit */}
      {kind === 'customers' && effectivePreview && (
        <View style={styles.previewNoContainer}>
          <View style={styles.previewHeaderRow}>
            <Text style={styles.previewHeaderText}>Συνολικοί Πελάτες</Text>
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>{effectivePreview.count}</Text>
            </View>
          </View>

          {/* Όλοι οι πελάτες — ακόμη κι αν “κοπούν” */}
          <View style={styles.previewChipsWrap}>
            {effectivePreview.names.map((n: string, idx: number) => (
              <View key={`${n}-${idx}`} style={styles.previewChip}>
                <Ionicons name="person-outline" size={14} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.previewChipText} numberOfLines={1} ellipsizeMode="tail">
                  {n || '—'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Pressable>
  );
}


function StatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <View
      style={[
        styles.statCard,
        {
          borderColor: color,
          ...(Platform.OS === 'web'
            ? {
                boxShadow: `0 10px 0 ${color}15, 0 4px 16px rgba(0,0,0,0.08)`,
              } as any
            : {}),
        },
      ]}
    >
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}


const styles = StyleSheet.create({
  content: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'flex-start' },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'nowrap',
    width: '100%',
    marginTop: 10,
  },
  gridWide: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'nowrap' },
  card: {
    borderRadius: 16,
    width: '20%',
    minHeight: 340,
    marginHorizontal: 12,
    paddingVertical: 20,
    paddingHorizontal: 10,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 6px 14px rgba(0,0,0,0.06)' } as any,
    }) as object),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: '400', color: '#1F2A44' },

  previewNoContainer: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    marginTop: 20,
    paddingHorizontal: 0,
    width: '100%',
  },

  previewHeaderRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    flexDirection: 'row',
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  previewHeaderText: { fontSize: 14, fontWeight: '400', color: '#1F2A44' },
  previewBadge: { backgroundColor: '#007AFF15', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  previewBadgeText: { color: '#007AFF', fontSize: 14, fontWeight: '400' },

  previewChipsWrap: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignSelf: 'stretch',
    gap: 8,
    marginTop: 8,
    width: '100%',
    maxHeight: 150,
    overflow: 'hidden',
  },
  previewChip: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '100%',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 3px 8px rgba(0,0,0,0.08)' } as any,
    }) as object),
  },
  previewChipText: { fontSize: 14, color: '#1F2A44' },

  /** Κάτω mini cards */
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    width: '100%',
    marginTop: 30,
    paddingHorizontal: 20,
    gap: 12,
  },

  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',

    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 4 },
      web: {}, 
    }) as object),
  },

  statValue: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 6,
  },
  statTitle: {
    fontSize: 13,
    color: '#1F2A44',
    textAlign: 'center',
  },

  /** 🛒 Floating button κάτω-αριστερά */
  floatingCart: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#CC5A00', // σκούρο πορτοκαλί
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 6 },
      web: { boxShadow: '0 8px 18px rgba(0,0,0,0.18)', cursor: 'pointer' } as any,
    }) as object),
  },
});
