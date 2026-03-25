// src/screens/DashboardScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';

import { Q } from '@nozbe/watermelondb';
import { LinearGradient } from 'expo-linear-gradient';
import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import ActivityLog from '../database/models/ActivityLog';
import { listHistoryItems, listHistoryOrders, type HistoryItem, type HistoryOrder } from '../services/history';
import { colors } from '../theme/colors';

import * as Device from 'expo-device';
import { database } from '../database/initializeDatabase';
import User from '../database/models/Users';
import { logLogout } from '../services/activitylog';

import { usePreview } from '../state/PreviewProvider';

import { useFocusEffect } from '@react-navigation/native';
import { Calendar } from 'react-native-calendars';
import { listCustomers, observeCustomers } from '../services/customer';
import { observeActiveOrders, observeReadyForDeliveryOrders } from '../services/orders';
import { createPickup, observePickups } from '../services/pickups';


type CustomersPreview = { count: number; names: string[] };
type ShelfPreview = { code: string; count: number };
type WarehousePreview = { totalShelves: number; shelves: ShelfPreview[] };

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

  const [historyItemsPreview, setHistoryItemsPreview] = useState<HistoryItem[]>([]);
  const [historyOrdersPreview, setHistoryOrdersPreview] = useState<HistoryOrder[]>([]);
  const [activeOrdersPreview, setActiveOrdersPreview] = useState<any[]>([]);
  const [readyForDeliveryOrders, setReadyForDeliveryOrders] = useState<any[]>([]);
  const [pickups, setPickups] = useState<any[]>([]);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(
    new Date().toISOString().split('T')[0] // Today's date by default
  );
  
  // Pickup creation modal state
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [pickupCustomerId, setPickupCustomerId] = useState<string | null>(null);
  const [pickupCustomers, setPickupCustomers] = useState<{ id: string; label: string; firstName: string; lastName: string; phone: string; afm: string; address: string }[]>([]);
  const [pickupDate, setPickupDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [pickupTime, setPickupTime] = useState<string>('10:00');
  const [pickupDateModalOpen, setPickupDateModalOpen] = useState(false);
  const [pickupSearchQuery, setPickupSearchQuery] = useState('');
  const [pickupDebouncedQuery, setPickupDebouncedQuery] = useState('');
  const previousCustomerCountRef = useRef<number>(0);
  
  const [creatingPickup, setCreatingPickup] = useState(false);

  const [warehousePreview, setWarehousePreview] = useState<WarehousePreview | null>(null);
  
  const [activityCounts, setActivityCounts] = useState({
    authentication: 0,
    orders: 0,
    customers: 0,
  });
  const [activityTotal, setActivityTotal] = useState(0);

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

  const getCategoryFromAction = (action: string):
    'authentication' | 'customers' | 'orders' | 'items' | 'shelves' | 'history' | 'system' => {
    const A = (action || '').toUpperCase();
    if (A.includes('LOGIN') || A.includes('LOGOUT') || A.includes('PASSWORD') || A.includes('DEVICE') || A.includes('SESSION'))
      return 'authentication';
    if (A.includes('CUSTOMER')) return 'customers';
    if (A.includes('ORDER')) return 'orders';
    if (A.includes('ITEM')) return 'items';
    if (A.includes('SHELF')) return 'shelves';
    if (A.includes('HISTORY') || A.includes('EXPORT') || A.includes('VIEW')) return 'history';
    return 'system';
  };
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

  // Live observe active orders (not delivered)
  useFocusEffect(
    useCallback(() => {
      const sub = observeActiveOrders(50).subscribe((rows: any[]) => {
        // Transform to preview format with customer names
        const ordersPreview = rows.slice(0, 10).map((r: any) => {
          const customer = r.customer?._raw || r.customer || {};
          const customerName = customer.first_name && customer.last_name
            ? `${customer.first_name} ${customer.last_name}`.trim()
            : customer.first_name || customer.last_name || '—';
          
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
        setActiveOrdersPreview(ordersPreview);
      });
      return () => sub.unsubscribe();
    }, [])
  );

  // Helper functions for search
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const isAFM = (q: string) => /^\d{9}$/.test(q);
  const isPhone = (q: string) => /^\d{7,}$/.test(q);

  // Load customers for pickup modal and handle return from customer creation
  useFocusEffect(
    useCallback(() => {
      const loadCustomers = async () => {
        try {
          const customers = await listCustomers(1000);
          const options = customers.map((c: any) => ({
            id: c.id,
            label: `${c.firstName || ''} ${c.lastName || ''}`.trim() || '—',
            firstName: c.firstName || '',
            lastName: c.lastName || '',
            phone: c.phone || '',
            afm: c.afm || '',
            address: c.address || '',
          }));
          
          // Check if we're returning from customer creation
          const fromPickupCreation = await AsyncStorage.getItem('fromPickupCreation');
          if (fromPickupCreation === 'true') {
            // Clear the flag
            await AsyncStorage.removeItem('fromPickupCreation');
            
            // Check if a new customer was created (customer count increased)
            if (options.length > previousCustomerCountRef.current && previousCustomerCountRef.current > 0) {
              // Find the newest customer (by comparing with previous list or using createdAt)
              // Since we don't have createdAt in the options, we'll use the last one in the list
              // (assuming newest customers are added at the end)
              const newestCustomer = options[options.length - 1];
              if (newestCustomer) {
                setPickupCustomerId(newestCustomer.id);
                setPickupModalOpen(true);
              }
            } else if (options.length > 0 && previousCustomerCountRef.current === 0) {
              // First time loading, but we came from pickup creation
              // Select the last customer (newest)
              const newestCustomer = options[options.length - 1];
              if (newestCustomer) {
                setPickupCustomerId(newestCustomer.id);
                setPickupModalOpen(true);
              }
            }
          }
          
          previousCustomerCountRef.current = options.length;
          setPickupCustomers(options);
        } catch (e) {
          console.error('Failed to load customers:', e);
        }
      };
      
      // Always load customers when screen gets focus
      loadCustomers();
    }, [])
  );

  // Reset search when modal closes
  React.useEffect(() => {
    if (!pickupModalOpen) {
      setPickupSearchQuery('');
      setPickupDebouncedQuery('');
    }
  }, [pickupModalOpen]);

  // Debounce search query
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setPickupDebouncedQuery(pickupSearchQuery.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [pickupSearchQuery]);

  // Filter customers based on search
  const filteredPickupCustomers = React.useMemo(() => {
    const q = pickupDebouncedQuery;
    if (!q) return pickupCustomers;

    if (isAFM(q)) {
      return pickupCustomers.filter(c => (c.afm || '').includes(q));
    }
    if (isPhone(q)) {
      return pickupCustomers.filter(c => (c.phone || '').includes(q));
    }

    const nq = normalize(q);
    return pickupCustomers.filter(c => {
      const fullName = `${c.firstName} ${c.lastName}`.trim();
      const hay = [fullName, c.address || '', c.afm || '', c.phone || '']
        .map(x => normalize(x))
        .join(' | ');
      return hay.includes(nq);
    });
  }, [pickupDebouncedQuery, pickupCustomers]);

  // Live observe ready for delivery orders (for calendar)
  useFocusEffect(
    useCallback(() => {
      const sub = observeReadyForDeliveryOrders(1000).subscribe(async (rows: any[]) => {
        // Transform orders with customer names and delivery dates
        // Filter out orders without delivery_date
        const ordersWithDelivery = await Promise.all(
          rows
            .filter((r: any) => {
              const deliveryDate = r.deliveryDate || r.delivery_date;
              return deliveryDate != null && deliveryDate !== '';
            })
            .map(async (r: any) => {
              let customerName = '—';
              let customerPhone = '—';
              let customerAddress = '—';
              
              // Get customer_id from order
              const customerId = r.customer_id || r._raw?.customer_id || r.customer?.id;
              
              // Fetch customer data by customer_id
              if (customerId) {
                try {
                  const customers = database.get('customers');
                  const customer: any = await customers.find(customerId);
                  
                  // Access customer properties from the model (camelCase) or _raw (snake_case)
                  const firstName = customer.firstName || customer._raw?.first_name || '';
                  const lastName = customer.lastName || customer._raw?.last_name || '';
                  const phone = customer.phone || customer._raw?.phone || '';
                  const address = customer.address || customer._raw?.address || '';
                  
                  customerName = firstName && lastName
                    ? `${firstName} ${lastName}`.trim()
                    : firstName || lastName || '—';
                  customerPhone = phone || '—';
                  customerAddress = address || '—';
                } catch (err) {
                  console.warn('Failed to fetch customer for order:', customerId, err);
                }
              }
              
              const notes = r.notes || r._raw?.notes || '';
              // Check if it's a pickup order (marked with ΠΑΡΑΛΑΒΗ) or delivery order
              const isPickup = notes && notes.trim() === 'ΠΑΡΑΛΑΒΗ';
              
              return {
                id: r.id,
                orderId: r.id,
                customerName,
                customerPhone,
                customerAddress,
                orderDate: r.orderDate || r.order_date || '—',
                deliveryDate: r.deliveryDate || r.delivery_date || null,
                status: r.orderStatus || r.order_status || 'Προς παράδοση',
                totalAmount: r.totalAmount || r.total_amount || 0,
                hasDebt: r.hasDebt || r.has_debt || false,
                isPickup,
              };
            })
        );
        setReadyForDeliveryOrders(ordersWithDelivery);
      });
      return () => sub.unsubscribe();
    }, [])
  );

  // Live observe pickups (for calendar)
  useFocusEffect(
    useCallback(() => {
      const sub = observePickups().subscribe(async (rows: any[]) => {
        // Transform pickups with customer names, address, and phone
        // Fetch customer data for each pickup using customer_id
        const pickupsWithCustomer = await Promise.all(rows.map(async (r: any) => {
          let customerName = '—';
          let customerPhone = '—';
          let customerAddress = '—';
          
          // Get customer_id from pickup
          const customerId = r.customer_id || r._raw?.customer_id || r.customer?.id;
          
          // Fetch customer data by customer_id
          if (customerId) {
            try {
              const customers = database.get('customers');
              const customer: any = await customers.find(customerId);
              
              // Access customer properties from the model (camelCase) or _raw (snake_case)
              const firstName = customer.firstName || customer._raw?.first_name || '';
              const lastName = customer.lastName || customer._raw?.last_name || '';
              const phone = customer.phone || customer._raw?.phone || '';
              const address = customer.address || customer._raw?.address || '';
              
              customerName = firstName && lastName
                ? `${firstName} ${lastName}`.trim()
                : firstName || lastName || '—';
              customerPhone = phone || '—';
              customerAddress = address || '—';
            } catch (err) {
              console.warn('Failed to fetch customer for pickup:', customerId, err);
            }
          }
          
          return {
            id: r.id,
            pickupId: r.id,
            customerName,
            customerPhone,
            customerAddress,
            pickupDate: r.pickupDate || r.pickup_date || null,
            pickupTimeStart: r.pickupTimeStart || r.pickup_time_start || null,
            pickupTimeEnd: r.pickupTimeEnd || r.pickup_time_end || null,
            notes: r.notes || '',
            isPickup: true,
          };
        }));
        setPickups(pickupsWithCustomer);
      });
      return () => sub.unsubscribe();
    }, [])
  );

  const [warehouseActiveCount, setWarehouseActiveCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const witemsCol: any = database.get('warehouse_items');

      // observe 
      const sub = witemsCol
        .query()              
        .observe()
        .subscribe((rows: any[]) => {
          const activeCount = rows.filter((r: any) => {
            
            const raw = r._raw || {};
            return r.is_active === true || raw.is_active === 1 || r.active === true;
          }).length;

          setWarehouseActiveCount(activeCount);
        });

      return () => sub.unsubscribe();
    }, [])
  );


  React.useEffect(() => {
  let cancelled = false;
  (async () => {
    try {
      const [items, orders] = await Promise.all([
        listHistoryItems(),
        listHistoryOrders(),
      ]);
      if (!cancelled) {
        setHistoryItemsPreview(items || []);
        setHistoryOrdersPreview(orders || []);
      }
    } catch (e) {
      console.error('history preview load failed', e);
      if (!cancelled) {
        setHistoryItemsPreview([]);
        setHistoryOrdersPreview([]);
      }
    }
  })();
  return () => { cancelled = true; };
  }, []);

  // live observe : ActivityLog 
  React.useEffect(() => {
    const col = database.get<ActivityLog>('activity_logs');
    const sub = col
      .query(Q.sortBy('timestamp', Q.desc))
      .observe()
      .subscribe((rows: any[]) => {
        const counts = { authentication: 0, orders: 0, customers: 0 };
        for (const r of rows) {
          const cat =
            (r.category as string) || getCategoryFromAction(r.action || '');
          if (cat === 'authentication') counts.authentication++;
          else if (cat === 'orders') counts.orders++;
          else if (cat === 'customers') counts.customers++;
        }
        setActivityCounts(counts);
        setActivityTotal(rows.length);
      });

    return () => sub.unsubscribe();
  }, []);

  // helper 
  const safeGet = (table: string) => (database as any)?.get?.(table) ?? null;

  // Live observe shelves
  useFocusEffect(
    useCallback(() => {
      const shelvesColl = safeGet('shelves');
      if (!shelvesColl) return;

      const sub = shelvesColl
        .query(Q.sortBy('created_at', Q.desc))
        .observe()
        .subscribe((rows: any[]) => {
          // Χρησιμοποιούμε το item_count του κάθε ραφιού για την προεπισκόπηση
          const shelvesPreview = rows.map((r: any) => ({
            code: r.code ?? '',
            count: Number(r.item_count ?? 0),
          }));
          setWarehousePreview({
            totalShelves: shelvesPreview.length,
            // μπορείς να περιορίσεις πόσα δείχνεις στο dashboard (π.χ. 8)
            shelves: shelvesPreview.slice(0, 8),
          });
        });

      return () => sub.unsubscribe();
    }, [])
  );


  // clients + orders+ items 
  const totalData = useMemo(() => {
    const customersCount = customersPreview?.count ?? 0;
    const ordersCount    = historyOrdersPreview?.length ?? 0;
    const itemsCount     = historyItemsPreview?.length ?? 0;
    return customersCount + ordersCount + itemsCount;
  }, [
    customersPreview?.count,
    historyOrdersPreview?.length,
    historyItemsPreview?.length,
  ]);

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
  const goActiveOrders = () => router.push('/activeorders' as any);
  const openItemsModal = () => router.push('/orderitems');

  const CARDS = [
    { key: 'customers', title: 'Πελάτες', bg: '#E9F2FF', icon: 'people-outline', onPress: goCustomers },
    { key: 'warehouse', title: 'Αποθήκη', bg: '#FFE9F2', icon: 'cube-outline', onPress: goWarehouse },
    { key: 'activity', title: 'Log Δραστηριοτήτων', bg: '#E9F9EF', icon: 'pulse-outline', onPress: goActivityLog },
    { key: 'history', title: 'Ιστορικό', bg: '#F0E9FF', icon: 'time-outline', onPress: goHistory },
    { key: 'activeorders', title: 'Ενεργές Παραγγελίες', bg: '#FFF4E6', icon: 'cart-outline', onPress: goActiveOrders },
  ];

  return (
    
    <Page>
      <AppHeader onLogout={logout} />
      <ScrollView 
        style={{ flex: 1 }} 
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={true}
      >

      <View ref={ref} style={styles.content}>
        {/* Items Management Button */}
        <Pressable
          onPress={openItemsModal}
          style={styles.itemsManagementButton}
        >
          <Ionicons name="layers-outline" size={20} color="#FFFFFF" />
          <Text style={styles.itemsManagementButtonText}>Διαχείριση Τεμαχίων</Text>
        </Pressable>

        {/* Πάνω 4 κάρτες */}
        <View
          style={[
            styles.grid,
            isWide ? styles.gridWide : undefined,
            Platform.OS !== 'web' && { 
              flexWrap: 'wrap',  
              rowGap: 6, 
              justifyContent: 'space-between',
              columnGap: 6,
              paddingHorizontal: 8,
            }, //  iOS/Android
          ]}
        >
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
              historyItemsPreview={c.key === 'history' ? historyItemsPreview : null}
              historyOrdersPreview={c.key === 'history' ? historyOrdersPreview : null}
              warehousePreview={c.key === 'warehouse' ? warehousePreview : null}
              activityCounts={activityCounts}
              activeOrdersPreview={c.key === 'activeorders' ? activeOrdersPreview : null}
            />
          ))}
        </View>

        {/* Κάτω mini cards */}
        {Platform.OS === 'web' ? (
          <View style={styles.statsRow}>
            <StatCard title="Συνολικοί Πελάτες" value={String(customersPreview?.count ?? 0)} color="#B8C8FF" />
            <StatCard title="Τεμάχια στην Αποθήκη" value={String(warehouseActiveCount)} color="#F5A5C0" />
            <StatCard title="Καταγραφές Log" value={String(activityTotal)} color="#A3E3BB" />
            <StatCard title="Σύνολο Δεδομένων" value={String(totalData)} color="#C3B2F7" />
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard title={`Συνολικοί\nΠελάτες`} value={String(customersPreview?.count ?? 0)} color="#B8C8FF" />
              <StatCard title={`Καταγραφές\nLog`} value={String(activityTotal)} color="#A3E3BB" />
            </View>
            <View style={styles.statsRow}>
              <StatCard title={`Τεμάχια στην\nΑποθήκη`} value={String(warehouseActiveCount)} color="#F5A5C0" />
              <StatCard title={`Σύνολο\nΔεδομένων`} value={String(totalData)} color="#C3B2F7" />
            </View>
          </>
        )}

        {/* Calendar for Ready to Deliver Orders */}
        <View style={styles.calendarSection}>
            <View style={styles.calendarHeader}>
              <Ionicons name="calendar-outline" size={24} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.calendarTitle}>Ημερολόγιο</Text>
              <View style={styles.calendarBadge}>
                <Text style={styles.calendarBadgeText}>{readyForDeliveryOrders.length + pickups.length}</Text>
              </View>
            </View>
            
            <Calendar
              current={new Date().toISOString().split('T')[0]} // Set current month to today
              markingType={'custom'}
              markedDates={(() => {
                const today = new Date().toISOString().split('T')[0];
                const marked: any = {};
                
                // Mark today as selected and current
                marked[today] = {
                  selected: true,
                  selectedColor: '#3B82F6',
                  selectedTextColor: '#FFFFFF',
                  customStyles: {
                    container: {
                      backgroundColor: '#3B82F6',
                      borderRadius: 8,
                    },
                    text: {
                      color: '#FFFFFF',
                      fontWeight: '700',
                    },
                  },
                };
                
                // Mark dates with delivery orders (separate pickup and delivery)
                const pickupOrders = readyForDeliveryOrders.filter((o: any) => o.isPickup);
                const deliveryOrders = readyForDeliveryOrders.filter((o: any) => !o.isPickup);
                
                // Combine pickups from pickups table with pickup orders
                const allPickups = [...pickups, ...pickupOrders];
                
                // Mark delivery orders (blue)
                deliveryOrders.forEach((order) => {
                  if (order.deliveryDate) {
                    const dateStr = new Date(order.deliveryDate).toISOString().split('T')[0];
                    const deliveryOrdersForDate = deliveryOrders.filter((o) => {
                      if (!o.deliveryDate) return false;
                      return new Date(o.deliveryDate).toISOString().split('T')[0] === dateStr;
                    }).length;
                    
                    if (marked[dateStr]) {
                      // If already marked, add delivery dot
                      marked[dateStr].dots = marked[dateStr].dots || [];
                      marked[dateStr].dots.push({
                        color: dateStr === today ? '#FFFFFF' : '#3B82F6',
                        selectedDotColor: '#FFFFFF',
                      });
                    } else {
                      // New date with delivery orders
                      marked[dateStr] = {
                        selected: dateStr === selectedCalendarDate,
                        selectedColor: dateStr === selectedCalendarDate ? '#3B82F6' : 'transparent',
                        marked: true,
                        customStyles: {
                          container: {
                            backgroundColor: dateStr === selectedCalendarDate ? '#3B82F6' : '#EFF6FF',
                            borderColor: '#3B82F6',
                            borderWidth: dateStr === selectedCalendarDate ? 0 : 1,
                            borderRadius: 8,
                          },
                          text: {
                            color: dateStr === selectedCalendarDate ? '#FFFFFF' : '#1E40AF',
                            fontWeight: dateStr === selectedCalendarDate ? '700' : '600',
                          },
                        },
                        dots: [{
                          color: '#3B82F6',
                          selectedDotColor: '#FFFFFF',
                        }],
                        count: deliveryOrdersForDate,
                      };
                    }
                  }
                });
                
                // Mark pickup orders (orange/amber)
                allPickups.forEach((order: any) => {
                  const pickupDate = order.pickupDate || order.deliveryDate;
                  if (pickupDate) {
                    const dateStr = new Date(pickupDate).toISOString().split('T')[0];
                    const pickupOrdersForDate = allPickups.filter((o: any) => {
                      const oDate = o.pickupDate || o.deliveryDate;
                      if (!oDate) return false;
                      return new Date(oDate).toISOString().split('T')[0] === dateStr;
                    }).length;
                    
                    if (marked[dateStr]) {
                      // If already marked, add pickup dot
                      marked[dateStr].dots = marked[dateStr].dots || [];
                      marked[dateStr].dots.push({
                        color: dateStr === today ? '#FFFFFF' : '#F59E0B',
                        selectedDotColor: '#FFFFFF',
                      });
                    } else {
                      // New date with pickup orders only
                      marked[dateStr] = {
                        selected: dateStr === selectedCalendarDate,
                        selectedColor: dateStr === selectedCalendarDate ? '#F59E0B' : 'transparent',
                        marked: true,
                        customStyles: {
                          container: {
                            backgroundColor: dateStr === selectedCalendarDate ? '#F59E0B' : '#FEF3C7',
                            borderColor: '#F59E0B',
                            borderWidth: dateStr === selectedCalendarDate ? 0 : 1,
                            borderRadius: 8,
                          },
                          text: {
                            color: dateStr === selectedCalendarDate ? '#FFFFFF' : '#92400E',
                            fontWeight: dateStr === selectedCalendarDate ? '700' : '600',
                          },
                        },
                        dots: [{
                          color: '#F59E0B',
                          selectedDotColor: '#FFFFFF',
                        }],
                        count: pickupOrdersForDate,
                      };
                    }
                  }
                });
                
                return marked;
              })()}
              onDayPress={(day) => {
                setSelectedCalendarDate(day.dateString);
              }}
              style={styles.calendar}
              theme={{
                todayTextColor: '#3B82F6',
                selectedDayBackgroundColor: '#3B82F6',
                selectedDayTextColor: '#FFFFFF',
                arrowColor: '#3B82F6',
                monthTextColor: '#1F2A44',
                textDayFontWeight: '500',
                textMonthFontWeight: '700',
                textDayHeaderFontWeight: '600',
                textDayFontSize: 14,
                textMonthFontSize: 18,
                textDayHeaderFontSize: 14,
                calendarBackground: '#FFFFFF',
                dayTextColor: '#1F2A44',
                textDisabledColor: '#D1D5DB',
                dotColor: '#3B82F6',
                selectedDotColor: '#FFFFFF',
                indicatorColor: '#3B82F6',
                textDayFontFamily: 'System',
                textMonthFontFamily: 'System',
                textDayHeaderFontFamily: 'System',
                'stylesheet.calendar.main': {
                  container: {
                    paddingLeft: 0,
                    paddingRight: 0,
                  },
                  week: {
                    marginTop: 6,
                    marginBottom: 6,
                    flexDirection: 'row',
                    justifyContent: 'space-around',
                  },
                },
                'stylesheet.day.basic': {
                  today: {
                    borderRadius: 10,
                    backgroundColor: '#3B82F6',
                  },
                  todayText: {
                    color: '#FFFFFF',
                    fontWeight: '700',
                    fontSize: 14,
                  },
                  selected: {
                    borderRadius: 10,
                    backgroundColor: '#3B82F6',
                  },
                  base: {
                    width: 35,
                    height: 35,
                    alignItems: 'center',
                    justifyContent: 'center',
                  },
                  text: {
                    marginTop: 0,
                    fontSize: 14,
                    fontWeight: '600',
                    color: '#1F2A44',
                  },
                },
              } as any}
            />
            
            {/* Events List for Selected Date */}
            {(() => {
              // Combine deliveries and pickups for the selected date
              const deliveriesForSelectedDate = readyForDeliveryOrders
                .filter((o: any) => {
                  if (!o.deliveryDate) return false;
                  const orderDate = new Date(o.deliveryDate).toISOString().split('T')[0];
                  return orderDate === selectedCalendarDate && !o.isPickup;
                })
                .map((o: any) => ({ ...o, type: 'delivery' }));
              
              const pickupsForSelectedDate = pickups
                .filter((p: any) => {
                  if (!p.pickupDate) return false;
                  const pickupDate = new Date(p.pickupDate).toISOString().split('T')[0];
                  return pickupDate === selectedCalendarDate;
                })
                .map((p: any) => ({ ...p, type: 'pickup', deliveryDate: p.pickupDate }));
              
              // Also include pickup orders from readyForDeliveryOrders
              const pickupOrdersForSelectedDate = readyForDeliveryOrders
                .filter((o: any) => {
                  if (!o.deliveryDate) return false;
                  const orderDate = new Date(o.deliveryDate).toISOString().split('T')[0];
                  return orderDate === selectedCalendarDate && o.isPickup;
                })
                .map((o: any) => ({ ...o, type: 'pickup' }));
              
              const allEventsForSelectedDate = [
                ...deliveriesForSelectedDate,
                ...pickupsForSelectedDate,
                ...pickupOrdersForSelectedDate,
              ].sort((a: any, b: any) => {
                // Sort by time
                const timeA = new Date(a.deliveryDate || a.pickupDate).getTime();
                const timeB = new Date(b.deliveryDate || b.pickupDate).getTime();
                return timeA - timeB;
              });

              return (
                <View style={styles.eventsContainer}>
                  <View style={styles.eventsHeader}>
                    {allEventsForSelectedDate.length === 0 ? (
                      <Text style={styles.noEventsText}>
                        Δεν υπάρχουν παραγγελίες ή παραλαβές για {new Date(selectedCalendarDate).toLocaleDateString('el-GR', { 
                          weekday: 'long', 
                          day: 'numeric', 
                          month: 'long',
                          year: 'numeric'
                        })}
                      </Text>
                    ) : (
                      <>
                        <View style={{ flex: 1 }}>
                          <Ionicons name="list-outline" size={20} color={colors.primary} style={{ marginRight: 8 }} />
                          <Text style={styles.eventsTitle}>
                            {allEventsForSelectedDate.length} {allEventsForSelectedDate.length === 1 ? 'Συμβάν' : 'Συμβάντα'} - {new Date(selectedCalendarDate).toLocaleDateString('el-GR', { 
                              weekday: 'long', 
                              day: 'numeric', 
                              month: 'long'
                            })}
                          </Text>
                        </View>
                      </>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        setPickupDate(selectedCalendarDate);
                        setPickupModalOpen(true);
                      }}
                      style={styles.createPickupButtonSmall}
                    >
                      <Ionicons name="add-circle" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                      {Platform.OS !== 'web' ? (
                        <Text style={styles.createPickupButtonTextSmall}>
                          Δημιουργία{'\n'}Παραλαβής
                        </Text>
                      ) : (
                        <Text style={styles.createPickupButtonTextSmall}>
                          Δημιουργία Παραλαβής
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  {allEventsForSelectedDate.length > 0 && (
                    <ScrollView style={styles.eventsList} showsVerticalScrollIndicator={false}>
                      {allEventsForSelectedDate.map((order: any) => {
                        const eventDate = order.deliveryDate || order.pickupDate;
                        const deliveryTime = new Date(eventDate).toLocaleTimeString('el-GR', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        });
                        const isPickup = order.isPickup || order.type === 'pickup';
                        const eventColor = isPickup ? '#F59E0B' : '#3B82F6';
                        const eventBgColor = isPickup ? '#FEF3C7' : '#EFF6FF';
                        const eventTextColor = isPickup ? '#92400E' : '#1E40AF';
                        
                        return (
                          <Pressable
                            key={order.id}
                            onPress={() => {
                              if (order.type === 'pickup' && order.pickupId) {
                                // TODO: Navigate to pickup edit screen when created
                                // For now, just show alert
                                Alert.alert('Παραλαβή', `Παραλαβή #${order.pickupId.slice(0, 6).toUpperCase()}`);
                              } else {
                                router.push(`/editorder?orderId=${order.id}` as any);
                              }
                            }}
                            style={[styles.eventCard, { borderColor: eventColor, backgroundColor: eventBgColor }]}
                          >
                            <View style={[styles.eventTimeContainer, { borderRightColor: eventColor }]}>
                              <Ionicons name={isPickup ? "arrow-down-circle-outline" : "time-outline"} size={16} color={eventColor} />
                              <Text style={[styles.eventTime, { color: eventTextColor }]}>{deliveryTime}</Text>
                            </View>
                            <View style={styles.eventContent}>
                              <View style={styles.eventHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Text style={[styles.eventOrderId, { color: eventTextColor }]}>
                                    #{order.orderId?.slice(0, 6).toUpperCase() || order.pickupId?.slice(0, 6).toUpperCase() || 'N/A'}
                                  </Text>
                                  <View style={[styles.typeBadge, { backgroundColor: eventColor }]}>
                                    <Text style={styles.typeBadgeText}>
                                      {isPickup ? 'Παραλαβή' : 'Παράδοση'}
                                    </Text>
                                  </View>
                                </View>
                                {order.hasDebt && (
                                  <View style={styles.debtBadge}>
                                    <Text style={styles.debtBadgeText}>Χρέος</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={[styles.eventCustomerName, { color: eventTextColor }]} numberOfLines={1}>
                                {order.customerName || '—'}
                              </Text>
                              {(order.customerAddress && order.customerAddress !== '—') && (
                                <Text style={[styles.eventCustomerInfo, { color: eventTextColor }]} numberOfLines={1}>
                                  📍 {order.customerAddress}
                                </Text>
                              )}
                              {(order.customerPhone && order.customerPhone !== '—') && (
                                <Text style={[styles.eventCustomerInfo, { color: eventTextColor }]} numberOfLines={1}>
                                  📞 {order.customerPhone}
                                </Text>
                              )}
                              {order.type !== 'pickup' && order.totalAmount !== undefined && (
                                <View style={styles.eventFooter}>
                                  <Text style={[styles.eventAmount, { color: eventTextColor }]}>
                                    {order.totalAmount.toFixed(2)} €
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                </View>
              );
            })()}
          </View>
      </View>

      </ScrollView>

      {/* Floating κουμπί  */}
      <Pressable
        onPress={() => router.push('/orders')}
        accessibilityRole="button"
        style={styles.floatingCart}
      >
        <Ionicons name="cart" size={24} color="#FFFFFF" />
      </Pressable>

      {/* Pickup Creation Modal */}
      <Modal
        visible={pickupModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPickupModalOpen(false);
          setPickupCustomerId(null);
          setPickupSearchQuery('');
          setPickupDebouncedQuery('');
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Δημιουργία Παραλαβής</Text>
              <TouchableOpacity
                onPress={() => {
                  setPickupModalOpen(false);
                  setPickupCustomerId(null);
                  setPickupSearchQuery('');
                  setPickupDebouncedQuery('');
                }}
              >
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Customer Selection */}
              <View style={styles.modalField}>
                    <Text style={styles.modalLabel}>Πελάτης</Text>
                    <View style={styles.searchContainer}>
                      <Ionicons name="search-outline" size={20} color="#6B7280" style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.searchInput}
                        value={pickupSearchQuery}
                        onChangeText={setPickupSearchQuery}
                        placeholder="Όνομα, Επώνυμο, ΑΦΜ, Τηλέφωνο, Διεύθυνση"
                        placeholderTextColor="#9CA3AF"
                      />
                      {pickupSearchQuery.length > 0 && (
                        <TouchableOpacity
                          onPress={() => setPickupSearchQuery('')}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                      )}
                    </View>
                    {pickupDebouncedQuery && filteredPickupCustomers.length === 0 ? (
                      <View style={styles.noResultsContainer}>
                        <Text style={styles.noResultsText}>
                          Δεν βρέθηκαν πελάτες με &quot;{pickupDebouncedQuery}&quot;
                        </Text>
                      </View>
                    ) : filteredPickupCustomers.length > 0 ? (
                      <ScrollView style={styles.customerList} nestedScrollEnabled>
                        {filteredPickupCustomers.map((customer) => (
                          <TouchableOpacity
                            key={customer.id}
                            onPress={() => {
                              setPickupCustomerId(customer.id);
                              setPickupSearchQuery('');
                            }}
                            style={[
                              styles.customerOption,
                              pickupCustomerId === customer.id && styles.customerOptionSelected
                            ]}
                          >
                            <View style={styles.customerOptionContent}>
                              <Text style={[
                                styles.customerOptionName,
                                pickupCustomerId === customer.id && styles.customerOptionNameSelected
                              ]}>
                                {customer.label}
                              </Text>
                              {customer.phone && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                  <Ionicons name="call-outline" size={14} color="#6B7280" style={{ marginRight: 4 }} />
                                  <Text style={styles.customerOptionDetail}>{customer.phone}</Text>
                                </View>
                              )}
                              {customer.address && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                                  <Ionicons name="location-outline" size={14} color="#6B7280" style={{ marginRight: 4 }} />
                                  <Text style={styles.customerOptionDetail}>{customer.address}</Text>
                                </View>
                              )}
                            </View>
                            {pickupCustomerId === customer.id && (
                              <Ionicons name="checkmark-circle" size={20} color="#3B82F6" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    ) : null}
                    {pickupCustomerId && (
                      <View style={styles.selectedCustomerContainer}>
                        <Text style={styles.selectedCustomerLabel}>Επιλεγμένος πελάτης:</Text>
                        <Text style={styles.selectedCustomerName}>
                          {pickupCustomers.find(c => c.id === pickupCustomerId)?.label || '—'}
                        </Text>
                        <TouchableOpacity
                          onPress={() => setPickupCustomerId(null)}
                          style={styles.clearSelectionButton}
                        >
                          <Ionicons name="close-circle" size={18} color="#6B7280" />
                          <Text style={styles.clearSelectionText}>Ακύρωση επιλογής</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                </View>
                
                <TouchableOpacity
                  onPress={async () => {
                    // Store flag that we're navigating from pickup creation
                    await AsyncStorage.setItem('fromPickupCreation', 'true');
                    // Store current customer count
                    previousCustomerCountRef.current = pickupCustomers.length;
                    setPickupModalOpen(false);
                    router.push('/customers');
                  }}
                  style={styles.newCustomerButton}
                >
                  <Ionicons name="person-add-outline" size={18} color="#3B82F6" style={{ marginRight: 6 }} />
                  <Text style={styles.newCustomerButtonText}>Νέος πελάτης</Text>
                </TouchableOpacity>

              {/* Date Selection */}
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Ημερομηνία</Text>
                <TouchableOpacity
                  onPress={() => setPickupDateModalOpen(true)}
                  style={styles.dateTimeButton}
                >
                  <Ionicons name="calendar-outline" size={18} color="#3B82F6" style={{ marginRight: 8 }} />
                  <Text style={styles.dateTimeButtonText}>
                    {new Date(pickupDate).toLocaleDateString('el-GR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Time Selection */}
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Ώρα</Text>
                <TextInput
                  style={styles.modalInput}
                  value={pickupTime}
                  onChangeText={setPickupTime}
                  placeholder="Ώρα (π.χ. 10:00)"
                  keyboardType="numeric"
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={async () => {
                  if (!pickupCustomerId) {
                    Alert.alert('Προσοχή', 'Παρακαλώ επιλέξτε πελάτη.');
                    return;
                  }
                  if (!pickupTime.match(/^\d{1,2}:\d{2}$/)) {
                    Alert.alert('Προσοχή', 'Παρακαλώ εισάγετε έγκυρη ώρα (π.χ. 10:00).');
                    return;
                  }

                  setCreatingPickup(true);
                  try {
                    // Create pickup datetime
                    const [hours, minutes] = pickupTime.split(':');
                    const pickupDateTime = new Date(pickupDate);
                    pickupDateTime.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);

                    // Create pickup in the pickups table
                    await createPickup({
                      customerId: pickupCustomerId!,
                      pickupDate: pickupDateTime.toISOString(),
                      pickupTimeStart: pickupTime,
                      createdBy: 'system',
                    }, 'system');

                    Alert.alert('OK', 'Η παραλαβή δημιουργήθηκε επιτυχώς.');
                    setPickupModalOpen(false);
                    setPickupCustomerId(null);
                    setPickupDate(new Date().toISOString().split('T')[0]);
                    setPickupTime('10:00');
                    setPickupSearchQuery('');
                    setPickupDebouncedQuery('');
                  } catch (e: any) {
                    console.error('Failed to create pickup:', e);
                    Alert.alert('Σφάλμα', e.message || 'Αποτυχία δημιουργίας παραλαβής.');
                  } finally {
                    setCreatingPickup(false);
                  }
                }}
                style={[styles.submitButton, creatingPickup && styles.submitButtonDisabled]}
                disabled={creatingPickup}
              >
                <Text style={styles.submitButtonText}>
                  {creatingPickup ? 'Δημιουργία...' : 'Δημιουργία Παραλαβής'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>

        {/* Date Picker Modal */}
        {pickupDateModalOpen && (
          <Modal
            visible={pickupDateModalOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setPickupDateModalOpen(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.datePickerModal}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Επιλογή Ημερομηνίας</Text>
                  <TouchableOpacity onPress={() => setPickupDateModalOpen(false)}>
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>
                <Calendar
                  current={pickupDate}
                  onDayPress={(day) => {
                    setPickupDate(day.dateString);
                    setPickupDateModalOpen(false);
                  }}
                  markedDates={{
                    [pickupDate]: {
                      selected: true,
                      selectedColor: '#3B82F6',
                    },
                  }}
                  minDate={new Date().toISOString().split('T')[0]}
                />
              </View>
            </View>
          </Modal>
        )}
      </Modal>

    </Page>
  );
}

// dashboard card
function DashboardCard({ kind, title, bg, icon, onPress, isWide, customersPreview, historyItemsPreview, historyOrdersPreview, activityCounts, warehousePreview, activeOrdersPreview }: any) {
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
          width: isWide ? '18%' : '100%', // Adjusted for 5 cards
          marginHorizontal: isWide ? 8 : 12, // Reduced margin for 5 cards
          transform: [{ scale: hovered ? 1.04 : 1 }],
          ...getShadow('rgba(59,130,246,0.12)'),
          ...(Platform.OS === 'web'
            ? ({
                transition:
                  'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
              } as any)
            : {}),

          //  (iOS / Android) 
          ...(Platform.OS !== 'web' && {
            width: kind === 'activeorders' ? '100%' : '48%', // 2x2 + 1 full
            marginHorizontal: 0,
            marginBottom: 10,
            minHeight: kind === 'history' ? 175 : 155,
            paddingVertical: 10,
            overflow: 'visible',
          }),
        },
      ]}
    >
      <LinearGradient
        colors={[`${bg}00`, `${bg}`, `${bg}`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.cardInner,
          Platform.OS !== 'web' && { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 18, overflow: 'hidden', } 
        ]}
      >
        {/* glossy rim για web */}
        {Platform.OS === 'web' ? <View style={styles.glossRim} /> : null}

        {/* header */}
        <View style={styles.cardHeader}>
          <Ionicons
            name={icon as any}
            size={Platform.OS !== 'web' ? 18 : 22}   // 👈 μικρότερο icon σε mobile
            color="#1F2A44"
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.cardTitle, Platform.OS !== 'web' && { fontSize: 16 }]}>
            {title}
          </Text>
        </View>

        {/* περιεχόμενο ανά είδος */}
        {kind === 'customers' && effectivePreview && (
          <View style={[styles.previewNoContainer, Platform.OS !== 'web' && { marginTop: 8 }]}>
            <View style={[styles.previewHeaderRow, Platform.OS !== 'web' && { paddingVertical: 6 }]}>
              <Text style={[styles.previewHeaderText, Platform.OS !== 'web' && { fontSize: 13 }]}>
                {Platform.OS === 'web' ? 'Συνολικοί Πελάτες' : 'Πελάτες'}
              </Text>
              <View style={styles.previewBadge}>
                <Text style={[styles.previewBadgeText, Platform.OS !== 'web' && { fontSize: 13 }]}>
                  {effectivePreview.count}
                </Text>
              </View>
            </View>

            <View style={[styles.previewChipsWrap, Platform.OS !== 'web' && {  flexShrink: 1, minHeight: 0, width: '100%' }]}>
              {(Platform.OS !== 'web' ? effectivePreview.names.slice(0, 2) : effectivePreview.names).map(
                (n: string, idx: number) => (
                  <View
                    key={`${n}-${idx}`}
                    style={[
                      styles.previewChip,
                      Platform.OS !== 'web' && { paddingVertical: 6, paddingHorizontal: 10, minWidth: 0, } 
                    ]}
                  >
                    <Ionicons
                      name="person-outline"
                      size={12} 
                      color={colors.primary}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[styles.previewChipText, Platform.OS !== 'web' && { fontSize: 13, flex: 1,minWidth: 0, }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {n || '—'}
                    </Text>
                  </View>
                )
              )}
            </View>
          </View>
        )}

        {kind === 'warehouse' && (
          <View style={[styles.hminiClip, Platform.OS !== 'web' && { maxHeight: 120 }]}>{/* 👈 compact */}
            <WarehouseMiniCard onPressOpenWarehouse={onPress} preview={warehousePreview} />
          </View>
        )}

        {kind === 'history' && (
          <View style={[styles.hminiClip, Platform.OS !== 'web' && { maxHeight: 137 }]}>
            <HistoryMiniCard
              onPressGoHistory={onPress}
              itemsCount={(historyItemsPreview || []).length}
              ordersCount={(historyOrdersPreview || []).length}
            />
          </View>
        )}

        {kind === 'activity' && (
          <View style={[styles.hminiClip, Platform.OS !== 'web' && { maxHeight: 120 }]}>
            <ActivityMiniCard onPressOpenLog={onPress} counts={activityCounts} />
          </View>
        )}

        {kind === 'activeorders' && (
          <View style={[styles.hminiClip, Platform.OS !== 'web' && { maxHeight: 120 }]}>
            <ActiveOrdersMiniCard onPressOpenOrders={onPress} ordersPreview={activeOrdersPreview || []} />
          </View>
        )}
      </LinearGradient>

    </Pressable>

  );
  
}


function HistoryMiniCard({
  onPressGoHistory,
  itemsCount,
  ordersCount,
}: {
  onPressGoHistory?: () => void;
  itemsCount: number;
  ordersCount: number;
}) {
  const isMobile = Platform.OS !== 'web'; // true σε iOS/Android, false σε web

  return (
    <View style={styles.hminiWrap}>
      {/* Μικρή search bar (ψευδο-input) */}
      <Pressable style={styles.hminiSearch} onPress={onPressGoHistory}>
        <Ionicons name="search-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
        <Text style={styles.hminiSearchText} numberOfLines={1}>
           {Platform.OS === 'web' ? 'Αναζήτηση σε όλα τα δεδομένα...' : 'Αναζήτηση...'}
        </Text>
      </Pressable>

      {/* 4 mini “dropdowns” — ΜΟΝΟ στο web */}
      {!isMobile && (
        <>
          <View style={styles.hminiGrid2}>
            <Pressable style={styles.hminiDrop}>
              <Text style={styles.hminiDropText}>Όλα ▾</Text>
            </Pressable>
            <Pressable style={styles.hminiDrop}>
              <Text style={styles.hminiDropText}>Όλα τα έτη ▾</Text>
            </Pressable>
          </View>
          <View style={styles.hminiGrid2}>
            <Pressable style={styles.hminiDrop}>
              <Text style={styles.hminiDropText}>Νεότερα πρώτα ▾</Text>
            </Pressable>
            <Pressable style={styles.hminiDrop}>
              <Text style={styles.hminiDropText}>Κατηγορία ▾</Text>
            </Pressable>
          </View>
        
      


      <Pressable style={styles.hminiCTA} onPress={onPressGoHistory}>
        <Text style={styles.hminiCTAText}>Κλικ για πλήρες ιστορικό</Text>
      </Pressable>
      </>
      )}

      {/* Ανάλυση Ιστορικού */}
      <View style={[styles.hminiAnalysis, isMobile && { marginTop: 8 }]}>
        <Text style={styles.hminiAnalysisTitle}>Ανάλυση Ιστορικού</Text>

        <View style={styles.hminiStatRow}>
          <View style={styles.hminiStatBadge}>
            <Ionicons name="cube-outline" size={14} color="#1F2A44" />
          </View>
          <Text style={styles.hminiStatLabel}>Τεμάχια</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.hminiStatValue}>{itemsCount}</Text>
        </View>

        <View style={styles.hminiDivider} />

        <View style={styles.hminiStatRow}>
          <View style={styles.hminiStatBadge}>
            <Ionicons name="cart-outline" size={14} color="#1F2A44" />
          </View>
          <Text style={styles.hminiStatLabel}>Παραγγελίες</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.hminiStatValue}>{ordersCount}</Text>
        </View>
      </View>
    </View>
  );
}


function ActivityMiniCard({
  onPressOpenLog,
  counts,
}: {
  onPressOpenLog?: () => void;
  counts: { authentication: number; orders: number; customers: number };
}) {
  const isMobile = Platform.OS !== 'web'; // true σε iOS/Android, false σε web

  const rows = [
    { key: 'authentication', label: Platform.OS === 'web' ? 'Πιστοποίηση' : 'Πιστοπ.', icon: 'lock-closed', color: '#8B5CF6', value: counts.authentication },
    { key: 'orders',         label: 'Παραγγελίες',   icon: 'cart-outline',  color: '#F59E0B', value: counts.orders },
    { key: 'customers',      label: 'Πελάτες',       icon: 'people-outline',color: '#3B82F6', value: counts.customers },
  ];

  return (
    <View style={styles.alogWrap}>
      {/* Search bar */}
      <Pressable style={styles.hminiSearch} onPress={onPressOpenLog}>
        <Ionicons name="search-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
        <Text style={styles.hminiSearchText} numberOfLines={1}>
          {Platform.OS === 'web' ? 'Αναζήτηση δραστηριοτήτων...' : 'Αναζήτηση δραστ...'}
        </Text>
      </Pressable>

      {/* 3 φίλτρα — ΜΟΝΟ στο web */}
      {!isMobile && (
        <View style={styles.alogGrid3}>
          <Pressable style={styles.hminiDrop}><Text style={styles.hminiDropText}>Σύνδεση ▾</Text></Pressable>
          <Pressable style={styles.hminiDrop}><Text style={styles.hminiDropText}>Ράφια ▾</Text></Pressable>
          <Pressable style={styles.hminiDrop}><Text style={styles.hminiDropText}>Σήμερα ▾</Text></Pressable>
        </View>
      )}

      {/* Ανάλυση Log (συνεχίζει να φαίνεται παντού) */}
      <View style={[styles.hminiAnalysis, isMobile && { marginTop: 6 }]}>
        <Text style={styles.hminiAnalysisTitle}>Ανάλυση Log</Text>
        {rows.map((r) => (
          <View key={r.key} style={styles.hminiStatRow}>
            <View style={[styles.hminiStatBadge, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name={r.icon as any} size={14} color={r.color} />
            </View>
            <Text style={styles.hminiStatLabel}>{r.label}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.hminiStatValue}>{r.value}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <Pressable style={styles.hminiCTA} onPress={onPressOpenLog}>
        <Text style={styles.hminiCTAText}>Άνοιγμα Log Δραστηριοτήτων</Text>
      </Pressable>
    </View>
  );
}


function ActiveOrdersMiniCard({
  onPressOpenOrders,
  ordersPreview,
}: {
  onPressOpenOrders?: () => void;
  ordersPreview: any[];
}) {
  const isMobile = Platform.OS !== 'web'; // true σε iOS/Android, false σε web

  const statusCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    ordersPreview.forEach((o: any) => {
      const status = o.status || 'Νέα';
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [ordersPreview]);

  return (
    <View style={styles.wminiWrap}>
      {/* Header με badge */}
      <View style={styles.wminiHeader}>
        <View style={{ flex: 1 }} />
        <View style={styles.wminiBadge}>
          <Text style={styles.wminiBadgeText}>{ordersPreview.length} παραγγελίες</Text>
        </View>
      </View>

      {/* Search bar — ΜΟΝΟ στο web */}
      {!isMobile && (
        <Pressable style={styles.hminiSearch} onPress={onPressOpenOrders}>
          <Ionicons name="search-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
          <Text style={styles.hminiSearchText} numberOfLines={1}>
            Αναζήτηση παραγγελιών...
          </Text>
        </Pressable>
      )}

      {/* Status breakdown */}
      <View style={[styles.hminiAnalysis, isMobile && { marginTop: 6 }]}>
        <Text style={styles.hminiAnalysisTitle}>Κατάσταση</Text>
        {Object.entries(statusCounts).map(([status, count]) => (
          <View key={status} style={styles.hminiStatRow}>
            <View style={styles.hminiStatBadge}>
              <Ionicons name="cart-outline" size={14} color="#1F2A44" />
            </View>
            <Text style={styles.hminiStatLabel}>{status}</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.hminiStatValue}>{count}</Text>
          </View>
        ))}
        {Object.keys(statusCounts).length === 0 && (
          <Text style={styles.hminiStatLabel}>Δεν υπάρχουν ενεργές παραγγελίες</Text>
        )}
      </View>

      {/* CTA */}
      <Pressable style={styles.hminiCTA} onPress={onPressOpenOrders}>
        <Text style={styles.hminiCTAText}>Κλικ για διαχείριση παραγγελιών</Text>
      </Pressable>
    </View>
  );
}


function WarehouseMiniCard({
  onPressOpenWarehouse,
  preview,
}: {
  onPressOpenWarehouse?: () => void;
  preview: WarehousePreview | null;
}) {
  const total = preview?.totalShelves ?? 0;
  const shelves = preview?.shelves ?? [];

  return (
    <View style={styles.wminiWrap}>
      {/* Header με badge "X ράφια" */}
      <View style={styles.wminiHeader}>
        <View style={{ flex: 1 }} />
        <View style={styles.wminiBadge}>
          <Text style={styles.wminiBadgeText}>{total} ράφια</Text>
        </View>
      </View>

      {/* Search bar (ψευδο-input) */}
      <Pressable style={styles.hminiSearch} onPress={onPressOpenWarehouse}>
        <Ionicons name="search-outline" size={16} color="#6B7280" style={{ marginRight: 6 }} />
        <Text style={styles.hminiSearchText} numberOfLines={1}>
         {Platform.OS === 'web' ? 'Αναζήτηση ραφιού, κωδικού ή τεμαχίου...' : 'Αναζήτηση ραφιού'}
        </Text>
      </Pressable>

      {/* Grid ραφιών */}
      <View style={styles.wminiGrid}>
        {shelves.map((s) => {
          const empty = s.count === 0;
          return (
            <Pressable
              key={s.code}
              style={[styles.wminiShelf, empty && styles.wminiShelfEmpty]}
              onPress={onPressOpenWarehouse}
            >
              <View style={styles.wminiShelfHeader}>
                <Text style={styles.wminiShelfCode}>{s.code}</Text>
                <Ionicons name="cube-outline" size={16} color="#1F2A44" />
              </View>
              <Text style={[styles.wminiShelfCount, empty && styles.wminiShelfEmptyText]}>
                {empty ? 'Άδειο' : `${s.count} τεμάχ${s.count === 1 ? 'ιο' : 'ια'}`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* CTA */}
      <Pressable style={styles.hminiCTA} onPress={onPressOpenWarehouse}>
        <Text style={styles.hminiCTAText}>Κλικ για διαχείριση αποθήκης</Text>
      </Pressable>
    </View>
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

const getShadow = (c = 'rgba(0,0,0,0.1)') =>
  Platform.select({
    ios:     {},
    android: {}, 
    web:   { boxShadow: `0 10px 24px ${c}, 0 2px 8px rgba(0,0,0,0.06)` } as any,
  });


const NO_SHADOW_MOBILE = Platform.select({
  ios:     { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
  android: { elevation: 0 },
  web:     {},
}) as object;

const SOFT_BORDER_MOBILE = Platform.OS === 'web' ? {} : {
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(31,42,68,0.08)',
};

const styles = StyleSheet.create({
  content: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'flex-start' },
  itemsManagementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F97316',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 3 },
      web: { boxShadow: '0 4px 6px rgba(0,0,0,0.1)' } as any,
    }) as object),
  },
  itemsManagementButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    width: '100%',
    marginTop: 10,
  },
  gridWide: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'nowrap' },
  card: {
  borderRadius: 18, // λίγο πιο μεγάλο για smooth καμπύλη
  minHeight: 340,
  padding: 0, // επειδή έχουμε cardInner για padding
  alignItems: 'stretch',
  justifyContent: 'flex-start',
  overflow: 'hidden',

  // περίγραμμα
  borderWidth: Platform.OS === 'web' ? 1 : StyleSheet.hairlineWidth,
  borderColor: 'rgba(31,42,68,0.06)',

  // εφέ σκιάς
  ...(Platform.select({
    ios: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
    android: { elevation: 0 },
    web: { boxShadow: '0 10px 24px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)' } as any,
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
    flexShrink: 1,
    minHeight: 0,
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
      android: { elevation: 2, minWidth: 0, },
      web: { boxShadow: '0 3px 8px rgba(0,0,0,0.08)' } as any,
    }) as object),

    ...NO_SHADOW_MOBILE,
    ...(Platform.OS !== 'web' ? SOFT_BORDER_MOBILE : {}),

  },

  previewChipText: { fontSize: 14, color: '#1F2A44', flexShrink: 1,  minWidth: 0, },

  /** Κάτω mini cards */
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    width: '100%',
    marginTop: Platform.OS !== 'web' ? 16 : 30,
    paddingHorizontal: Platform.OS !== 'web' ? 16 : 20,
    gap: Platform.OS !== 'web' ? 10 : 12,
    flexWrap: Platform.OS !== 'web' ? 'wrap' : 'nowrap',

    ...(Platform.OS !== 'web'
      ? {
          rowGap: 10,
        }
      : {}),
  },

  statCard: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    ...getShadow(),
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',

    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 4 },
      web: {}, 
    }) as object),
    ...NO_SHADOW_MOBILE,
    ...(Platform.OS !== 'web' ? SOFT_BORDER_MOBILE : {}),
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
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 8px 18px rgba(0,0,0,0.18)', cursor: 'pointer' } as any,
    }) as object),
  },

  /** Ιστορικό (mini) */
histWrap: { marginTop: 16, alignSelf: 'stretch' },
histHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
histCounters: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },

histListClip: { position: 'relative', maxHeight: 170, overflow: 'hidden', alignSelf: 'stretch', gap: 8 },
histMiniRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderWidth: 1.5,
  borderColor: '#F1F1F3',
  backgroundColor: '#fff',
  borderRadius: 12,
  paddingVertical: 8,
  paddingHorizontal: 10,
},
histMiniLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
histSquareIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
histMiniTitle: { fontSize: 13, fontWeight: '400', color: '#111827' },
histMiniSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
histMiniDate: { fontSize: 12, color: '#6B7280' },

histBottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 36 },

/** Mini chips */
chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999, backgroundColor: '#EEF2FF' },
chipText: { fontWeight: '800', color: '#1F2937', fontSize: 12 },
chipGreen: { backgroundColor: '#DCFCE7' }, chipGreenText: { color: '#166534' },
chipOrange: { backgroundColor: '#FFEDD5' }, chipOrangeText: { color: '#9A3412' },
chipPurple: { backgroundColor: '#EDE9FE' }, chipPurpleText: { color: '#6D28D9' },
chipRed: { backgroundColor: '#FEE2E2' }, chipRedText: { color: '#991B1B' },

  /* ——— Utils για HistoryPreview ——— */
  emptyState: { 
    padding: 18, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  emptyTitle: { 
    fontSize: 15, 
    color: '#111827', 
    fontWeight: '400' 
  },

  pill: { 
    backgroundColor: '#DBEAFE', 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 9999 
  },
  pillText: { 
    color: '#1D4ED8', 
    fontWeight: '800' 
  },

  /** ---- History mini card ---- */
hminiWrap: {

  marginTop: 0,
  alignSelf: 'stretch',
},

hminiHeaderRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  backgroundColor: 'rgba(255, 255, 255, 0.25)',
  borderRadius: 8,
  paddingVertical: 8,
  paddingHorizontal: 14,
  marginBottom: 14,
  alignSelf: 'flex-start'
},
hminiTitle: {
  fontSize: 14,
  fontWeight: '400',
  color: '#111827',
},

/* search */
hminiSearch: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: 'rgba(255,255,255,0.25)',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  marginBottom: 8,
  ...(Platform.select({
    web: { boxShadow: '0 3px 8px rgba(0,0,0,0.08)' } as any,
    ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    android: { elevation: 2 },
  }) as object),
  ...NO_SHADOW_MOBILE,
  ...(Platform.OS !== 'web' ? SOFT_BORDER_MOBILE : {}),
  ...(Platform.OS !== 'web' ? { backgroundColor: 'rgba(255,255,255,0.65)' } : {}),
},




hminiSearchText: {
  color: '#6B7280',
  fontSize: 13,
},

/* δύο-δύο μικρά dropdown κουμπιά */
hminiGrid2: {
  flexDirection: 'row',
  gap: 6,
  marginBottom: 8,
},
hminiDrop: {
  flex: 1,
  backgroundColor: 'rgba(255,255,255,0.25)',
  borderRadius: 12,
  paddingVertical: 10,
  paddingHorizontal: 12,
  alignItems: 'center', 
  justifyContent: 'center',
  minWidth: 0,
  ...(Platform.select({
    web: { boxShadow: '0 3px 8px rgba(0,0,0,0.08)' } as any,
    ios: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
    android: { elevation: 0 }, // 👈 χωρίς σκιά στο mobile
  }) as object),
  ...(Platform.OS !== 'web' ? { 
    backgroundColor: 'rgba(255,255,255,0.65)', 
    flexBasis: '30%',
    maxWidth: '32%',
  } : {}),
},




hminiDropText: { fontSize: 13, color: '#1F2A44' },

/* CTA */
hminiCTA: {
  marginTop: 6,
  backgroundColor: '#EEF2FF',
  borderRadius: 12,
  paddingVertical: 8,
  alignItems: 'center',
  justifyContent: 'center',
  ...(Platform.select({
    web: { cursor: 'pointer' } as any,
    ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 2 },
  }) as object),
},
hminiCTAText: {
  color: '#1F3A8A',
  fontWeight: '400',
  fontSize: 14,
},

/* Ανάλυση Ιστορικού */
hminiAnalysis: {
  marginTop: 12,
  backgroundColor: 'rgba(255,255,255,0.6)',
  borderWidth: 1.5,
  borderColor: '#E5E7EB',
  borderRadius: 12,
  padding: 8,
},
hminiAnalysisTitle: {
  fontSize: 13,
  color: '#111827',
  fontWeight: '400',
  marginBottom: 8,
},
hminiStatRow: {
  flexDirection: 'row',
  alignItems: 'center',
},
hminiStatBadge: {
  width: 24,
  height: 24,
  borderRadius: 8,
  backgroundColor: '#EEF2FF',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 8,
},
hminiStatLabel: {
  fontSize: 13,
  color: '#111827',
},
hminiStatValue: {
  fontSize: 13,
  color: '#111827',
  fontWeight: '400',
},
hminiDivider: {
  height: 1,
  backgroundColor: '#F1F5F9',
  marginVertical: 8,
},

hminiClip: {
  alignSelf: 'stretch',
  width: '100%',
  marginTop: 20,
  ...(Platform.OS !== 'web'
    ? { maxHeight: undefined, overflow: 'visible' } // mobile
    : { maxHeight: 240, overflow: 'hidden' }        // web
  ),
},

/* ---- Activity mini card ---- */
alogWrap: {
  alignSelf: 'stretch',
},

/* 3 στη σειρά */
alogGrid3: {
  flexDirection: 'row',
  gap: 6, 
  marginBottom: 6,
  flexWrap: 'wrap',        
  rowGap: 6, 
},


alogListClip: {
  alignSelf: 'stretch',
  width: '100%',
  marginTop: 6,
  maxHeight: 150,   
  overflow: 'hidden',
},


cardInner: {
  padding: 14,
},
glossRim: {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  borderRadius: 18,
  pointerEvents: 'none',
  borderWidth: 0,
  
},

wminiWrap: {
  alignSelf: 'stretch',
},

wminiHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
},
wminiHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
wminiTitle: { fontSize: 14, color: '#1F2A44' },

wminiBadge: {
  backgroundColor: '#E9F9EF', // απαλό πράσινο όπως στο screenshot
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 999,
},
wminiBadgeText: { color: '#0F5132', fontSize: 13 },

wminiGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  rowGap: 10,
  marginTop: 6,
},

wminiShelf: {
  flexBasis: '48%',     
  backgroundColor: 'rgba(255,255,255,0.75)',
  borderRadius: 14,
  borderWidth: 1.5,
  borderColor: '#DDE7D9',
  paddingVertical: 10,  
  paddingHorizontal: 10,
  ...(Platform.select({
    web: { boxShadow: '0 3px 8px rgba(0,0,0,0.06)' } as any,
    ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    android: { elevation: 2 },
  }) as object),
    ...NO_SHADOW_MOBILE,
  ...(Platform.OS !== 'web' ? SOFT_BORDER_MOBILE : {}),
},

wminiShelfEmpty: {
  backgroundColor: '#F7FBF8',
  borderColor: '#E7F2EA',
},
wminiShelfHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 8,
},
wminiShelfCode: { fontSize: 15, color: '#1F2A44' },
wminiShelfCount: { fontSize: 13, color: '#1F2A44' },
wminiShelfEmptyText: { color: '#6B7280' },

  /* Calendar Section */
  calendarSection: {
    width: '100%',
    marginTop: 30,
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2A44',
    flex: 1,
  },
  calendarBadge: {
    backgroundColor: '#E9F2FF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  calendarBadgeText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  calendar: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 10,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 3px 8px rgba(0,0,0,0.08)' } as any,
    }) as object),
  },
  /* Events List */
  eventsContainer: {
    marginTop: 20,
    width: '100%',
  },
  eventsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eventsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2A44',
    flex: 1,
  },
  eventsList: {
    maxHeight: 300,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 1 },
      web: { boxShadow: '0 2px 4px rgba(0,0,0,0.05)' } as any,
    }) as object),
  },
  eventTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    paddingRight: 16,
    borderRightWidth: 2,
    borderRightColor: '#E5E7EB',
    minWidth: 60,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  eventTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
    marginLeft: 6,
  },
  eventContent: {
    flex: 1,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventOrderId: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2A44',
    marginRight: 8,
    ...(Platform.OS !== 'web' && {
    fontSize: 13,
    fontWeight: '600', 
  }),
  },
  debtBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  debtBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#DC2626',
  },
  eventCustomerName: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
  },
  eventCustomerInfo: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  eventFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eventAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#10B981',
  },
  noEventsText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
    flex: 1,
  },
  createPickupButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 2px 4px rgba(0,0,0,0.1)' } as any,
    }) as object),
  },
  createPickupButtonTextSmall: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...(Platform.OS !== 'web' && {
    justifyContent: 'flex-end', 
    alignItems: 'center',
    padding: 0,     
    transform: [{ translateY: -30 }],           
  }),
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    ...(Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
    android: { elevation: 10 },
    web: { boxShadow: '0 10px 25px rgba(0,0,0,0.2)' } as any,
  }) as object),

  ...(Platform.OS !== 'web' && {
    maxHeight: '90%',      
    flex: 1,               
    width: '94%',
    borderRadius: 16,
    marginBottom: 30,
   
  }),
  },
  datePickerModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    padding: 20,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 10 },
      web: { boxShadow: '0 10px 25px rgba(0,0,0,0.2)' } as any,
    }) as object),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2A44',
  },
  modalBody: {
    padding: 20,
    maxHeight: 500,
    ...(Platform.OS !== 'web' && {
    maxHeight: undefined, 
    flex: 1,             
    paddingBottom: 12,
  }),
  },
  modalField: {
    marginBottom: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  modalInputError: {
    borderColor: '#DC2626',
  },
  modalErrorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 4,
    marginLeft: 4,
  },
  dropdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  dropdownText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  dropdownList: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    marginTop: 4,
    backgroundColor: '#FFFFFF',
  },
  dropdownOption: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#111827',
  },
  dropdownOptionTextSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  newCustomerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 8,
    ...(Platform.OS !== 'web' && {
    marginTop: 2,      
    marginBottom: 2,   
    paddingVertical: 4, 
  }),
  },
  newCustomerButtonText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelNewCustomerButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelNewCustomerButtonText: {
    color: '#6B7280',
    fontSize: 14,
    fontWeight: '500',
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
  },
  dateTimeButtonText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 3 },
      web: { boxShadow: '0 4px 6px rgba(0,0,0,0.1)' } as any,
    }) as object),
    ...(Platform.OS !== 'web' && {
    marginBottom: 70, 
  }),
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
    padding: 0,
  },
  customerList: {
    maxHeight: 300,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    marginTop: 8,
    backgroundColor: '#FFFFFF',
  },
  customerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  customerOptionSelected: {
    backgroundColor: '#EFF6FF',
  },
  customerOptionContent: {
    flex: 1,
  },
  customerOptionName: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
    marginBottom: 4,
  },
  customerOptionNameSelected: {
    color: '#3B82F6',
  },
  customerOptionDetail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  noResultsContainer: {
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  noResultsText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  selectedCustomerContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  selectedCustomerLabel: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '600',
    marginBottom: 4,
  },
  selectedCustomerName: {
    fontSize: 15,
    color: '#0C4A6E',
    fontWeight: '700',
    marginBottom: 8,
  },
  clearSelectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  clearSelectionText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 4,
  },

});
