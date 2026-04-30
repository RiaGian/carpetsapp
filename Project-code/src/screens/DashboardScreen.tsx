// src/screens/DashboardScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import { colors } from '../theme/colors';

// WatermelonDB
import { database } from '../database/initializeDatabase';
import User from '../database/models/Users';

// Προεπισκοπήσεις (shared state)
import { usePreview } from '../state/PreviewProvider';

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
  const [fallbackEmail, setFallbackEmail] = useState<string | null>(null);

  useEffect(() => {
    if (fromParams.name || fromParams.email) return;
    (async () => {
      try {
        const usersCol = database.get<User>('users');
        const list = await usersCol.query().fetch();
        if (list.length > 0) {
          setFallbackName((list[0] as any).name ?? 'Χρήστης');
          setFallbackEmail((list[0] as any).email ?? '');
        } else {
          setFallbackName('Χρήστης');
          setFallbackEmail('');
        }
      } catch {
        setFallbackName('Χρήστης');
        setFallbackEmail('');
      }
    })();
  }, [fromParams.name, fromParams.email]);

  const displayName = useMemo(
    () => fromParams.name || fallbackName || 'Χρήστης',
    [fromParams.name, fallbackName]
  );

  const goCustomers = () => router.push(`/customers?name=${encodeURIComponent(displayName || '')}`);
  const goWarehouse = () => router.push(`/warehouse?name=${encodeURIComponent(displayName || '')}`);
  const goActivityLog = () => router.push(`/activitylog?name=${encodeURIComponent(displayName || '')}`);
  const goHistory = () => router.push(`/history?name=${encodeURIComponent(displayName || '')}`);
  const logout = () => router.replace('/');

  const CARDS: Array<{
    key: string;
    title: string;
    bg: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
  }> = [
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
            />
          ))}
        </View>

        {/* Κάτω 4 mini cards */}
        <View style={styles.statsRow}>
          <StatCard title="Συνολικοί Πελάτες" value="2" icon="people-outline" />
          <StatCard title="Τεμάχια στην Αποθήκη" value="14" icon="cube-outline" />
          <StatCard title="Καταγραφές Log" value="32" icon="pulse-outline" />
          <StatCard title="Σύνολο Δεδομένων" value="128" icon="stats-chart-outline" />
        </View>
      </View>
    </Page>
  );
}

/** Μονή κάρτα */
function DashboardCard({ kind, title, bg, icon, onPress, isWide }: any) {
  const { previews } = usePreview();
  const customersPreview = previews.customers;
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
        <Ionicons name={icon} size={22} color="#1F2A44" style={{ marginRight: 8 }} />
        <Text style={styles.cardTitle}>{title}</Text>
      </View>

      {/* Προεπισκόπηση Πελατών */}
      {kind === 'customers' && customersPreview && (
        <View style={styles.previewNoContainer}>
          <View style={styles.previewHeaderRow}>
            <Text style={styles.previewHeaderText}>Συνολικοί Πελάτες</Text>
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>{customersPreview.count}</Text>
            </View>
          </View>

          <View style={styles.previewChipsWrap}>
            {customersPreview.names.map((n: string, idx: number) => (
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

/** Mini cards κάτω από τα βασικά */
function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={22} color="#1F2A44" style={{ marginBottom: 6 }} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },

  /** Πάνω grid */
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'nowrap',
    paddingHorizontal: 8,
    width: '100%',
    marginTop: 10,
    paddingTop: 10,
  },

  gridWide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'nowrap',
  },

  /** Μεγάλες κάρτες */
  card: {
    borderRadius: 16,
    width: '20%',
    minHeight: 340,
    marginHorizontal: 12,
    paddingVertical: 20,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'flex-start',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 6px 14px rgba(0,0,0,0.06)' } as any,
    }) as object),
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  cardTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#1F2A44',
  },

  /** Προεπισκόπηση Πελατών */
  previewNoContainer: {
    width: '100%',
    alignItems: 'flex-start',
    marginTop: 20,
    paddingHorizontal: 10,
  },

  previewHeaderRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    width: '100%',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
      web: { boxShadow: '0 3px 8px rgba(0,0,0,0.08)' } as any,
    }) as object),
  },

  previewHeaderText: { fontSize: 14, fontWeight: '400', color: '#1F2A44' },
  previewBadge: {
    backgroundColor: '#007AFF15',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  previewBadgeText: { color: '#007AFF', fontSize: 14, fontWeight: '400' },
  previewChipsWrap: { flexDirection: 'column', gap: 10, width: '100%' },
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
    alignItems: 'center',
    width: '100%',
    marginTop: 30,
    paddingHorizontal: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
      web: { boxShadow: '0 4px 10px rgba(0,0,0,0.08)' } as any,
    }) as object),
  },
  statTitle: {
    fontSize: 13,
    color: '#374151',
    textAlign: 'center',
    marginTop: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2A44',
  },
});
