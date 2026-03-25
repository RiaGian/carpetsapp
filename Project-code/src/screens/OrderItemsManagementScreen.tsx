// src/screens/OrderItemsManagementScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import { database } from '../database/initializeDatabase';
import { listOrderItems, listOrderItemsByOrder, updateOrderItem } from '../services/orderItems';
import { getOrderById, updateOrder } from '../services/orders';
import { useAuth } from '../state/AuthProvider';
import { colors } from '../theme/colors';

// Category options
const CATEGORY_OPTIONS = ['Χαλί', 'Μοκέτα', 'Πάπλωμα', 'Κουβέρτα', 'Διαδρομάκι', 'Φλοκάτι'];

// Color options
const COLOR_OPTIONS = ['Κόκκινο', 'Μπλε', 'Πράσινο', 'Κίτρινο', 'Μαύρο', 'Άσπρο', 'Γκρι', 'Καφέ', 'Μπεζ', 'Ροζ'];

// Status options
const STATUS_OPTIONS = ['άπλυτο', 'πλυμένο'];

// Storage status options
const STORAGE_STATUS_OPTIONS = ['Επιστροφή', 'Φύλαξη'];

// Simple Dropdown Component - Inline dropdown positioned below button
function SimpleDropdown({
  value,
  placeholder,
  options,
  onChange,
  width = '100%',
  showSearch = true,
}: {
  value: string;
  placeholder?: string;
  options: string[];
  onChange: (v: string) => void;
  width?: number | `${number}%` | 'auto';
  showSearch?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const anchorRef = React.useRef<View>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [query, options]);

  // When opening, measure the anchor position
  const toggleOpen = React.useCallback(() => {
    if (!open) {
      // open -> measure first
      requestAnimationFrame(() => {
        anchorRef.current?.measureInWindow((x, y, w, h) => {
          setAnchor({ x, y, w, h });
          setOpen(true);
        });
      });
    } else {
      setOpen(false);
    }
  }, [open]);

  return (
    <>
      {/* Anchor (button) */}
      <View ref={anchorRef} style={{ width }}>
        <Pressable onPress={toggleOpen} style={[styles.dropdownWrap, { width }]}>
          <Text style={[styles.filledInputText, { paddingRight: 28, opacity: value ? 1 : 0.6 }]} numberOfLines={1}>
            {value?.trim() || (placeholder || 'Επιλέξτε…')}
          </Text>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" style={styles.dropdownIcon} />
        </Pressable>
      </View>

      {/* Modal with absolutely positioned dropdown list */}
      <Modal
        visible={open}
        animationType="fade"
        transparent
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        {/* Backdrop for click-outside */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />

        {/* Dropdown list, absolutely positioned below anchor */}
        {anchor && (
          <View
            style={[
              styles.dropdownList,
              {
                position: 'absolute',
                left: Math.max(8, anchor.x),
                top: anchor.y + anchor.h,
                width: anchor.w,
                maxHeight: 260,
              },
            ]}
          >
            {/* Search box - only show if showSearch is true */}
            {showSearch && (
              <View style={styles.ddSearchBox}>
                <Ionicons name="search-outline" size={18} color="#6B7280" />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Αναζήτηση…"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.ddSearchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                  autoFocus
                />
                {query ? (
                  <Pressable onPress={() => setQuery('')}>
                    <Ionicons name="close" size={16} color="#9CA3AF" />
                  </Pressable>
                ) : null}
              </View>
            )}

            {/* Options */}
            <ScrollView>
              {filtered.length === 0 ? (
                <View style={styles.ddEmpty}>
                  <Text style={styles.ddEmptyText}>Δεν βρέθηκαν επιλογές</Text>
                </View>
              ) : (
                filtered.map((opt, idx) => {
                  const selected = value?.trim().toLowerCase() === opt.toLowerCase();
                  return (
                    <Pressable
                      key={`${opt}-${idx}`}
                      onPress={() => {
                        onChange(opt);
                        setOpen(false);
                        setQuery('');
                      }}
                      style={[styles.ddOption, idx % 2 === 1 && styles.ddOptionAlt]}
                    >
                      <Text
                        style={[styles.ddOptionText, selected && styles.ddOptionTextSelected]}
                        numberOfLines={1}
                      >
                        {opt}
                      </Text>
                      {selected && <Ionicons name="checkmark" size={18} color="#3B82F6" />}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  );
}

export default function OrderItemsManagementScreen() {
  const { user } = useAuth();
  const userId = String(user?.id || 'system');

  const [allOrderItems, setAllOrderItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemsFilter, setItemsFilter] = useState<'all' | 'unwashed' | 'washed'>('all');
  const [itemsSearchQuery, setItemsSearchQuery] = useState('');
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  // Load all order items
  const loadAllOrderItems = React.useCallback(async () => {
    try {
      setLoadingItems(true);
      const items = await listOrderItems(5000);
      
      // Load customer prices from AsyncStorage
      let pricePerSqmByCustomer: Record<string, string> = {};
      try {
        const raw = await AsyncStorage.getItem('pricePerSqmByCustomer');
        if (raw) {
          pricePerSqmByCustomer = JSON.parse(raw);
        }
      } catch (err) {
        console.warn('Failed to load pricePerSqmByCustomer from AsyncStorage:', err);
      }
      
      // Fetch customer names and prices for each item
      const itemsWithCustomer = await Promise.all(items.map(async (item: any) => {
        let customerName = '—';
        let pricePerM2 = item.price_per_m2 || '';
        
        try {
          const orderId = item.order_id || item._raw?.order_id || item.order?.id;
          if (orderId) {
            const orders = database.get('orders');
            const order: any = await orders.find(orderId);
            const customerId = order.customer_id || order._raw?.customer_id || order.customer?.id;
            if (customerId) {
              const customers = database.get('customers');
              const customer: any = await customers.find(customerId);
              const firstName = customer.firstName || customer._raw?.first_name || '';
              const lastName = customer.lastName || customer._raw?.last_name || '';
              customerName = `${firstName} ${lastName}`.trim() || '—';
              
              // If price_per_m2 is not set on the item, try to get it from customer's AsyncStorage price
              if (!pricePerM2 && pricePerSqmByCustomer[customerId]) {
                pricePerM2 = pricePerSqmByCustomer[customerId];
              }
            }
          }
        } catch (err) {
          console.warn('Failed to fetch customer for item:', err);
        }
        
        return {
          id: item.id,
          item_code: item.item_code || `#${String(item.id).slice(0, 6).toUpperCase()}`,
          category: item.category || '',
          color: item.color || '',
          price: item.price || 0,
          status: item.status || '',
          storage_status: item.storage_status || '',
          order_date: item.order_date || '',
          length_m: item.length_m || '',
          width_m: item.width_m || '',
          area_m2: item.area_m2 || '',
          price_per_m2: pricePerM2,
          customer_name: customerName,
          order_id: item.order_id || item._raw?.order_id || '',
        };
      }));
      
      setAllOrderItems(itemsWithCustomer);
    } catch (err) {
      console.error('Failed to load order items:', err);
      Alert.alert('Σφάλμα', 'Αποτυχία φόρτωσης τεμαχίων.');
    } finally {
      setLoadingItems(false);
    }
  }, []);

  // Load items on mount
  React.useEffect(() => {
    loadAllOrderItems();
  }, [loadAllOrderItems]);

  // Update item status
  const updateItemStatus = React.useCallback(async (itemId: string, newStatus: string) => {
    try {
      setUpdatingItemId(itemId);
      await updateOrderItem(itemId, { status: newStatus }, userId);
      
      // Update local state
      setAllOrderItems(prev => prev.map(item => 
        item.id === itemId ? { ...item, status: newStatus } : item
      ));
    } catch (err) {
      console.error('Failed to update item status:', err);
      Alert.alert('Σφάλμα', 'Αποτυχία ενημέρωσης κατάστασης τεμαχίου.');
    } finally {
      setUpdatingItemId(null);
    }
  }, [userId]);

  // Filter items
  const filteredOrderItems = React.useMemo(() => {
    let filtered = allOrderItems;
    
    // Filter by status
    if (itemsFilter === 'unwashed') {
      filtered = filtered.filter(item => {
        const status = String(item.status || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
        return status === 'απλυτο';
      });
    } else if (itemsFilter === 'washed') {
      filtered = filtered.filter(item => {
        const status = String(item.status || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
        return status === 'πλυμενο';
      });
    }
    
    // Filter by search query
    if (itemsSearchQuery.trim()) {
      const query = itemsSearchQuery.toLowerCase();
      filtered = filtered.filter(item => {
        const hay = [
          item.item_code,
          item.category,
          item.color,
          item.customer_name,
          item.order_id,
        ].map(x => String(x || '').toLowerCase()).join(' | ');
        return hay.includes(query);
      });
    }
    
    return filtered;
  }, [allOrderItems, itemsFilter, itemsSearchQuery]);

  return (
    <Page>
      <AppHeader showBack />
      
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="layers-outline" size={24} color={colors.primary} />
            <Text style={styles.title}>Διαχείριση Τεμαχίων</Text>
          </View>
        </View>

        {/* Filters and Search */}
        <View style={styles.filtersSection}>
          {/* Status Filter Buttons */}
          <View style={styles.filterButtons}>
            <Pressable
              style={[styles.filterBtn, itemsFilter === 'all' && styles.filterBtnActive]}
              onPress={() => setItemsFilter('all')}
            >
              <Text style={[styles.filterBtnText, itemsFilter === 'all' && styles.filterBtnTextActive]}>
                Όλα
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterBtn, itemsFilter === 'unwashed' && styles.filterBtnActive]}
              onPress={() => setItemsFilter('unwashed')}
            >
              <Text style={[styles.filterBtnText, itemsFilter === 'unwashed' && styles.filterBtnTextActive]}>
                Άπλυτα
              </Text>
            </Pressable>
            <Pressable
              style={[styles.filterBtn, itemsFilter === 'washed' && styles.filterBtnActive]}
              onPress={() => setItemsFilter('washed')}
            >
              <Text style={[styles.filterBtnText, itemsFilter === 'washed' && styles.filterBtnTextActive]}>
                Πλυμένα
              </Text>
            </Pressable>
          </View>

          {/* Search */}
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Αναζήτηση κωδικού/περιγραφής/πελάτη..."
              placeholderTextColor="#9CA3AF"
              value={itemsSearchQuery}
              onChangeText={setItemsSearchQuery}
            />
          </View>
        </View>

        {/* Items List */}
        <ScrollView 
          style={styles.list}
          contentContainerStyle={{ paddingBottom: 20 }}
          showsVerticalScrollIndicator
        >
          {loadingItems ? (
            <View style={styles.emptyBox}>
              <Ionicons name="sync" size={36} color="#9CA3AF" />
              <Text style={styles.emptyText}>Φόρτωση…</Text>
            </View>
          ) : filteredOrderItems.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={36} color="#9CA3AF" />
              <Text style={styles.emptyText}>
                {itemsSearchQuery || itemsFilter !== 'all' 
                  ? 'Δεν βρέθηκαν τεμάχια με τα φίλτρα που επιλέξατε.'
                  : 'Δεν βρέθηκαν τεμάχια.'}
              </Text>
            </View>
          ) : (
            filteredOrderItems.map((item: any) => {
              const normStatus = String(item.status || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim();
              const isWashed = normStatus === 'πλυμενο';
              const isUnwashed = normStatus === 'απλυτο';
              const isUpdating = updatingItemId === item.id;

              return (
                <View key={item.id} style={styles.itemCard}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={styles.itemCode}>{item.item_code}</Text>
                      {isWashed && (
                        <View style={[styles.statusChip, styles.statusChipGreen]}>
                          <Text style={styles.statusChipText}>Πλυμένο</Text>
                        </View>
                      )}
                      {isUnwashed && (
                        <View style={[styles.statusChip, styles.statusChipOrange]}>
                          <Text style={styles.statusChipText}>Άπλυτο</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.itemDetails}>
                      {item.category || '—'} · {item.color || '—'}
                    </Text>
                    {item.customer_name && item.customer_name !== '—' && (
                      <Text style={styles.itemCustomer}>
                        Πελάτης: {item.customer_name}
                      </Text>
                    )}
                    <Text style={styles.itemPrice}>
                      {item.price.toFixed(2)} €
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <Pressable
                      style={styles.editBtn}
                      onPress={() => setEditingItem(item)}
                    >
                      <Ionicons name="create-outline" size={16} color={colors.primary} />
                      <Text style={styles.editBtnText}>Επεξεργασία</Text>
                    </Pressable>
                    {isUnwashed && (
                      <Pressable
                        style={[styles.updateStatusBtn, isUpdating && styles.updateStatusBtnDisabled]}
                        disabled={isUpdating}
                        onPress={() => updateItemStatus(item.id, 'πλυμένο')}
                      >
                        {isUpdating ? (
                          <Ionicons name="sync" size={16} color="#FFFFFF" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
                            <Text style={styles.updateStatusBtnText}>Πλυμένο</Text>
                          </>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Footer Info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {filteredOrderItems.length} {filteredOrderItems.length === 1 ? 'τεμάχιο' : 'τεμάχια'}
            {itemsFilter !== 'all' && ` (${itemsFilter === 'unwashed' ? 'Άπλυτα' : 'Πλυμένα'})`}
          </Text>
        </View>
      </View>

      {/* Edit Item Modal */}
      <EditItemModal
        visible={editingItem !== null}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSaved={(updated) => {
          setAllOrderItems(prev => prev.map(item => 
            item.id === updated.id ? updated : item
          ));
          setEditingItem(null);
        }}
        userId={userId}
      />
    </Page>
  );
}

// Edit Item Modal Component
function EditItemModal({
  visible,
  item,
  onClose,
  onSaved,
  userId = 'system',
}: {
  visible: boolean;
  item: any | null;
  onClose: () => void;
  onSaved: (updated: any) => void;
  userId?: string;
}) {
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [item_code, setItemCode] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState('');
  const [price, setPrice] = useState('');
  const [status, setStatus] = useState('');
  const [storage_status, setStorageStatus] = useState('');
  const [order_date, setOrderDate] = useState('');
  const [length_m, setLengthM] = useState('');
  const [width_m, setWidthM] = useState('');
  const [area_m2, setAreaM2] = useState('');
  const [price_per_m2, setPricePerM2] = useState('');

  // Load item data when modal opens
  React.useEffect(() => {
    if (!item) return;
    setItemCode(item.item_code ?? '');
    setCategory(item.category ?? '');
    setColor(item.color ?? '');
    setStatus(item.status ?? '');
    setStorageStatus(item.storage_status ?? '');
    setOrderDate(item.order_date ?? '');
    setLengthM(item.length_m ?? '');
    setWidthM(item.width_m ?? '');
    setAreaM2(item.area_m2 ?? '');
    setPricePerM2(item.price_per_m2 ?? '');
    // Don't set price here - let the calculation useEffect handle it after dimensions are loaded
  }, [item]);

  // Calculate area_m2 automatically from length × width
  React.useEffect(() => {
    if (!item) return;
    
    // If both length and width are provided, calculate area
    if (length_m && width_m) {
      const length = parseFloat(length_m.replace(',', '.')) || 0;
      const width = parseFloat(width_m.replace(',', '.')) || 0;
      if (length > 0 && width > 0) {
        const calculatedArea = (length * width).toFixed(2);
        // Only update if different to avoid infinite loops
        const currentArea = parseFloat(area_m2.replace(',', '.')) || 0;
        const newArea = parseFloat(calculatedArea);
        if (Math.abs(currentArea - newArea) > 0.01) {
          setAreaM2(calculatedArea);
        }
      } else if (length === 0 || width === 0) {
        // If one is cleared, clear area too
        if (area_m2 && parseFloat(area_m2.replace(',', '.')) > 0) {
          setAreaM2('');
        }
      }
    } else if (!length_m && !width_m && area_m2) {
      // If both length and width are cleared, clear area
      setAreaM2('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [length_m, width_m, item]);

  // Calculate price automatically from dimensions - runs on every change
  React.useEffect(() => {
    // Skip calculation if item hasn't loaded yet
    if (!item) return;

    let calculatedPrice = 0;

    // Priority 1: If area_m2 and price_per_m2 are provided, use them directly
    if (area_m2 && price_per_m2) {
      const area = parseFloat(area_m2.replace(',', '.')) || 0;
      const pricePerM2 = parseFloat(price_per_m2.replace(',', '.')) || 0;
      if (area > 0 && pricePerM2 > 0) {
        calculatedPrice = area * pricePerM2;
      }
    }
    // Priority 2: If length_m, width_m, and price_per_m2 are provided, calculate area first
    else if (length_m && width_m && price_per_m2) {
      const length = parseFloat(length_m.replace(',', '.')) || 0;
      const width = parseFloat(width_m.replace(',', '.')) || 0;
      const pricePerM2 = parseFloat(price_per_m2.replace(',', '.')) || 0;
      if (length > 0 && width > 0 && pricePerM2 > 0) {
        const area = length * width;
        calculatedPrice = area * pricePerM2;
      }
    }

    // Always update price when dimensions change
    if (calculatedPrice > 0) {
      setPrice(calculatedPrice.toFixed(2));
    } else {
      // If no dimensions are available, use the stored price; otherwise show 0.00
      const hasDimensions = length_m || width_m || area_m2 || price_per_m2;
      if (!hasDimensions) {
        setPrice(String(item.price ?? 0));
      } else {
        setPrice('0.00');
      }
    }
  }, [length_m, width_m, area_m2, price_per_m2, item]);

  const onSubmit = async () => {
    if (!item) return;
    setSaving(true);
    try {
      const priceNum = parseFloat(price.replace(',', '.')) || 0;
      
      await updateOrderItem(item.id, {
        item_code: item_code.trim(),
        category: category.trim(),
        color: color.trim(),
        price: priceNum,
        status: status.trim(),
        storage_status: storage_status.trim(),
        order_date: order_date.trim() || undefined,
        length_m: length_m.trim() || '',
        width_m: width_m.trim() || '',
        area_m2: area_m2.trim() || '',
        price_per_m2: price_per_m2.trim() || '',
      }, userId);

      // Recalculate order totalAmount after updating item
      const orderId = item.order_id;
      if (orderId) {
        try {
          // Fetch all items for this order
          const allItems = await listOrderItemsByOrder(orderId);
          
          // Calculate total from all items
          const totalAmount = allItems.reduce((sum: number, it: any) => {
            const itemPrice = parseFloat(String(it.price || 0));
            return sum + (isNaN(itemPrice) ? 0 : itemPrice);
          }, 0);
          
          // Get order to check deposit
          const order = await getOrderById(orderId);
          const deposit = order.deposit || 0;
          
          // Calculate final total (items total - deposit)
          const finalTotal = totalAmount === 0 ? 0 : Math.max(0, totalAmount - deposit);
          
          // Update order's totalAmount
          await updateOrder(orderId, { totalAmount: finalTotal }, userId);
        } catch (orderErr) {
          console.warn('Failed to update order totalAmount:', orderErr);
          // Don't fail the whole operation if order update fails
        }
      }

      onSaved({
        ...item,
        item_code: item_code.trim(),
        category: category.trim(),
        color: color.trim(),
        price: priceNum,
        status: status.trim(),
        storage_status: storage_status.trim(),
        order_date: order_date.trim(),
        length_m: length_m.trim(),
        width_m: width_m.trim(),
        area_m2: area_m2.trim(),
        price_per_m2: price_per_m2.trim(),
      });
      
      Alert.alert('Επιτυχία', 'Το τεμάχιο ενημερώθηκε επιτυχώς.');
    } catch (err) {
      console.error('Failed to update item:', err);
      Alert.alert('Σφάλμα', 'Αποτυχία ενημέρωσης τεμαχίου.');
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={styles.modalBackdropInner}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalContent}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="create-outline" size={24} color={colors.primary} />
                    <Text style={styles.modalTitle}>Επεξεργασία Τεμαχίου</Text>
                  </View>
                  <TouchableOpacity onPress={onClose}>
                    <Ionicons name="close" size={24} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                {/* Form */}
                <ScrollView 
                  style={styles.modalForm}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  showsVerticalScrollIndicator
                >
                  {/* Row 1: Item Code & Category */}
                  <View style={styles.formRow}>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Κωδικός Τεμαχίου</Text>
                      <TextInput
                        style={[styles.formInput, styles.formInputReadOnly]}
                        value={item_code}
                        editable={false}
                        placeholder="π.χ. A12345"
                      />
                    </View>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Κατηγορία</Text>
                      <SimpleDropdown
                        value={category}
                        options={CATEGORY_OPTIONS}
                        onChange={setCategory}
                        placeholder="Επιλέξτε κατηγορία"
                        showSearch={false}
                      />
                    </View>
                  </View>

                  {/* Row 2: Color */}
                  <View style={styles.formRow}>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Χρώμα</Text>
                      <SimpleDropdown
                        value={color}
                        options={COLOR_OPTIONS}
                        onChange={setColor}
                        placeholder="Επιλέξτε χρώμα"
                        showSearch={false}
                      />
                    </View>
                    <View style={styles.formCol} />
                  </View>

                  {/* Row 3: Status & Storage Status */}
                  <View style={styles.formRow}>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Κατάσταση</Text>
                      <SimpleDropdown
                        value={status}
                        options={STATUS_OPTIONS}
                        onChange={setStatus}
                        placeholder="Επιλέξτε κατάσταση"
                        showSearch={false}
                      />
                    </View>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Κατάσταση Αποθήκης</Text>
                      <SimpleDropdown
                        value={storage_status}
                        options={STORAGE_STATUS_OPTIONS}
                        onChange={setStorageStatus}
                        placeholder="Επιλέξτε κατάσταση αποθήκης"
                        showSearch={false}
                      />
                    </View>
                  </View>

                  {/* Row 4: Order Date */}
                  <View style={styles.formRow}>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Ημερομηνία Παραγγελίας</Text>
                      <TextInput
                        style={styles.formInput}
                        value={order_date}
                        onChangeText={setOrderDate}
                        placeholder="YYYY-MM-DD"
                      />
                    </View>
                    <View style={styles.formCol} />
                  </View>

                  {/* Dimensions Section */}
                  <View style={styles.sectionDivider}>
                    <Text style={styles.sectionTitle}>Διαστάσεις</Text>
                  </View>

                  {/* Row 5: Length & Width */}
                  <View style={styles.formRow}>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Μήκος (m)</Text>
                      <TextInput
                        style={styles.formInput}
                        value={length_m}
                        onChangeText={setLengthM}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Πλάτος (m)</Text>
                      <TextInput
                        style={styles.formInput}
                        value={width_m}
                        onChangeText={setWidthM}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  {/* Row 6: Area & Price per m² */}
                  <View style={styles.formRow}>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Εμβαδόν (m²)</Text>
                      <TextInput
                        style={[styles.formInput, styles.formInputReadOnly]}
                        value={area_m2}
                        editable={false}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Τιμή ανά m² (€)</Text>
                      <TextInput
                        style={[styles.formInput, styles.formInputReadOnly]}
                        value={price_per_m2}
                        editable={false}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  {/* Price (calculated automatically) */}
                  <View style={styles.formRow}>
                    <View style={styles.formCol}>
                      <Text style={styles.formLabel}>Τιμή (€)</Text>
                      <TextInput
                        style={[styles.formInput, styles.formInputReadOnly]}
                        value={price}
                        editable={false}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                      />
                    </View>
                    <View style={styles.formCol} />
                  </View>
                </ScrollView>

                {/* Actions */}
                <View style={styles.modalActions}>
                  <Pressable onPress={onClose} style={styles.cancelBtn}>
                    <Text style={styles.cancelBtnText}>Ακύρωση</Text>
                  </Pressable>
                  <Pressable
                    disabled={saving}
                    onPress={onSubmit}
                    style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  >
                    <Text style={styles.saveBtnText}>
                      {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Platform.OS === 'web' ? 24 : 16,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
  },
  filtersSection: {
    marginBottom: 20,
  },
  filterButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterBtnTextActive: {
    color: '#FFFFFF',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  list: {
    flex: 1,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemCode: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  itemDetails: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  itemCustomer: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
    marginTop: 6,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusChipGreen: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  statusChipOrange: {
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FB923C',
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  updateStatusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#22C55E',
    borderRadius: 8,
  },
  updateStatusBtnDisabled: {
    opacity: 0.6,
  },
  updateStatusBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  footerText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  editBtnText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  // Edit Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdropInner: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 800,
    maxHeight: '90%',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
      android: { elevation: 10 },
      web: { boxShadow: '0 10px 25px rgba(0,0,0,0.2)' } as any,
    }) as object),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  modalForm: {
    flex: 1,
    padding: 20,
  },
  formRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  formCol: {
    flex: 1,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FFFFFF',
  },
  formInputReadOnly: {
    backgroundColor: '#F3F4F6',
    color: '#6B7280',
  },
  sectionDivider: {
    marginTop: 8,
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Dropdown styles
  dropdownWrap: {
    backgroundColor: '#F6F7F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  filledInputText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  dropdownIcon: {
    position: 'absolute',
    right: 12,
  },
  dropdownList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1000,
  },
  ddSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  ddSearchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  ddEmpty: {
    padding: 16,
    alignItems: 'center',
  },
  ddEmptyText: {
    fontSize: 14,
    color: '#6B7280',
  },
  ddOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  ddOptionAlt: {
    backgroundColor: '#F9FAFB',
  },
  ddOptionText: {
    color: '#111827',
    fontSize: 14,
  },
  ddOptionTextSelected: {
    fontWeight: '800',
    color: '#3B82F6',
  },
});

