// src/screens/ActiveOrdersScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import { database } from '../database/initializeDatabase';
import { observeActiveOrders } from '../services/orders';
import { colors } from '../theme/colors';

type OrderPreview = {
  id: string;
  orderId: string;
  customerName: string;
  orderDate: string;
  status: string;
  totalAmount: number;
  hasDebt: boolean;
};

const ORDER_STATUSES = ['Νέα', 'Σε επεξεργασία', 'Έτοιμη', 'Προς παράδοση'] as const;
type OrderStatus = typeof ORDER_STATUSES[number];

export default function ActiveOrdersScreen() {
  const [orders, setOrders] = useState<OrderPreview[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'Όλες'>('Όλες');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Live observe active orders
  useFocusEffect(
    useCallback(() => {
      const sub = observeActiveOrders(1000).subscribe(async (rows: any[]) => {
        // Get unique customer IDs
        const customerIds = Array.from(
          new Set(
            rows
              .map((r: any) => {
                return r.customer?.id || r.customer_id || r._raw?.customer_id || null;
              })
              .filter(Boolean)
          )
        ) as string[];

        // Batch fetch customers
        const customersMap = new Map<string, any>();
        if (customerIds.length > 0) {
          try {
            const customersColl = database.get('customers');
            const customerRows = await customersColl
              .query(Q.where('id', Q.oneOf(customerIds)))
              .fetch();
            
          customerRows.forEach((c: any) => {
            const fn = c.firstName || c.first_name || c._raw?.first_name || '';
            const ln = c.lastName || c.last_name || c._raw?.last_name || '';
            const name = `${fn} ${ln}`.trim();
            customersMap.set(c.id, name || '—');
          });
          } catch (e) {
            console.error('Error fetching customers', e);
          }
        }

        // Transform to preview format with customer names
        const ordersPreview = rows.map((r: any) => {
          const customerId = r.customer?.id || r.customer_id || r._raw?.customer_id || null;
          const customerName = customerId ? (customersMap.get(customerId) || '—') : '—';
          
          return {
            id: r.id,
            orderId: r.id,
            customerName,
            orderDate: r.orderDate || r.order_date || '—',
            status: r.orderStatus || r.order_status || 'Νέα',
            totalAmount: r.totalAmount || r.total_amount || 0,
            hasDebt: r.hasDebt || r.has_debt || false,
          };
        });
        setOrders(ordersPreview);
      });
      return () => sub.unsubscribe();
    }, [])
  );

  // Filter orders by status and search
  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Filter by status
    if (selectedStatus !== 'Όλες') {
      filtered = filtered.filter(o => o.status === selectedStatus);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o => {
        return (
          o.customerName.toLowerCase().includes(q) ||
          o.orderId.toLowerCase().includes(q) ||
          o.orderDate.toLowerCase().includes(q) ||
          o.status.toLowerCase().includes(q)
        );
      });
    }

    return filtered;
  }, [orders, selectedStatus, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedOrders = filteredOrders.slice(startIdx, startIdx + itemsPerPage);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [selectedStatus, searchQuery]);

  const goPrev = () => setCurrentPage(p => Math.max(1, p - 1));
  const goNext = () => setCurrentPage(p => Math.min(totalPages, p + 1));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Νέα':
        return '#3B82F6'; // Blue
      case 'Σε επεξεργασία':
        return '#F59E0B'; // Orange
      case 'Έτοιμη':
        return '#10B981'; // Green
      case 'Προς παράδοση':
        return '#EC4899'; // Pink
      case 'Παραδόθηκε':
        return '#6B7280'; // Gray
      default:
        return '#6B7280';
    }
  };

  return (
    <Page>
      <AppHeader showBack />
      
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Ionicons name="cart-outline" size={24} color={colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.title}>Ενεργές Παραγγελίες</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{filteredOrders.length}</Text>
            </View>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Αναζήτηση σε πελάτες, κωδικούς, ημερομηνίες..."
            placeholderTextColor={colors.muted}
            style={[
              styles.searchInput,
              Platform.OS !== 'web' && { paddingTop: 8 },
            ]}
            returnKeyType="search"
          />
        </View>

        {/* Status Filters */}
        <View style={styles.filtersRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersContent}>
            {['Όλες', ...ORDER_STATUSES].map((status) => {
              const isSelected = selectedStatus === status;
              return (
                <Pressable
                  key={status}
                  onPress={() => setSelectedStatus(status as OrderStatus | 'Όλες')}
                  style={[
                    styles.filterChip,
                    isSelected && styles.filterChipActive,
                    { backgroundColor: isSelected ? getStatusColor(status === 'Όλες' ? 'Νέα' : status) : '#F3F4F6' },
                  ]}
                >
                  <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                    {status}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Orders List */}
        {paginatedOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {searchQuery || selectedStatus !== 'Όλες'
                ? 'Δεν βρέθηκαν παραγγελίες με τα επιλεγμένα φίλτρα'
                : 'Δεν υπάρχουν ενεργές παραγγελίες'}
            </Text>
          </View>
        ) : (
          <>
            {paginatedOrders.map((order) => (
              <Pressable
                key={order.id}
                onPress={() => router.push(`/editorder?orderId=${order.id}`)}
                style={styles.orderCard}
              >
                <View style={styles.orderCardHeader}>
                  <View style={styles.orderCardLeft}>
                    <Text style={styles.orderId}>#{order.orderId.slice(0, 6).toUpperCase()}</Text>
                    {order.hasDebt && (
                      <View style={styles.debtBadge}>
                        <Text style={styles.debtBadgeText}>Χρέος</Text>
                      </View>
                    )}
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: `${getStatusColor(order.status)}15` },
                    ]}
                  >
                    <Text style={[styles.statusText, { color: getStatusColor(order.status) }]}>
                      {order.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.orderCardBody}>
                  <View style={styles.orderInfoRow}>
                    <Ionicons name="person-outline" size={16} color="#6B7280" />
                    <Text style={styles.orderInfoText} numberOfLines={1}>
                      {order.customerName}
                    </Text>
                  </View>
                  <View style={styles.orderInfoRow}>
                    <Ionicons name="calendar-outline" size={16} color="#6B7280" />
                    <Text style={styles.orderInfoText}>{order.orderDate}</Text>
                  </View>
                </View>

                <View style={styles.orderCardFooter}>
                  <Text style={styles.orderAmount}>{order.totalAmount.toFixed(2)} €</Text>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
              </Pressable>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <View style={styles.pagination}>
                <Pressable
                  onPress={goPrev}
                  disabled={currentPage === 1}
                  style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={currentPage === 1 ? '#9CA3AF' : '#1F2A44'}
                  />
                </Pressable>
                <Text style={styles.pageInfo}>
                  Σελίδα {currentPage} από {totalPages}
                </Text>
                <Pressable
                  onPress={goNext}
                  disabled={currentPage === totalPages}
                  style={[styles.pageBtn, currentPage === totalPages && styles.pageBtnDisabled]}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={currentPage === totalPages ? '#9CA3AF' : '#1F2A44'}
                  />
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  scroller: { flex: 1, width: '100%' },
  container: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2A44',
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#E9F2FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countBadgeText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
   paddingVertical: Platform.OS !== 'web' ? 2 : 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    fontSize: Platform.OS !== 'web' ? 13 : 15,
    color: '#1F2A44',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}),
    paddingVertical: Platform.OS !== 'web' ? 2 : 12,
  },
  filtersRow: {
    marginBottom: 20,
  },
  filtersContent: {
    gap: 8,
    paddingVertical: 4,
  },
  filterChip: {
    paddingHorizontal: Platform.OS !== 'web' ? 10 : 16, // πιο στενό σε κινητό
    paddingVertical: Platform.OS !== 'web' ? 5 : 8, 
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: {
    // Active state handled by backgroundColor in style prop
  },
  filterChipText: {
    fontSize: Platform.OS !== 'web' ? 13 : 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
    textAlign: 'center',
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 12,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 3px 8px rgba(0,0,0,0.08)', cursor: 'pointer' } as any,
    }) as object),
  },
  orderCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  orderCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  orderId: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2A44',
  },
  debtBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  debtBadgeText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '600',
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orderCardBody: {
    marginBottom: 12,
    gap: 8,
  },
  orderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderInfoText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  orderCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  orderAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2A44',
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 16,
  },
  pageBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnDisabled: {
    opacity: 0.5,
  },
  pageInfo: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
});

