import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import { database } from '../database/initializeDatabase';
import OrderItem from '../database/models/OrderItem';
import WarehouseItem from '../database/models/WarehouseItem';
import { colors } from '../theme/colors';
const PURPLE = '#8B5CF6';
const PURPLE_LIGHT = '#EDE9FE';
const PURPLE_BG = 'rgba(139,92,246,0.06)'; 
const BORDER = '#E5E7EB';


export default function AddItemsScreen() {
  const params = useLocalSearchParams<{ shelfId?: string; shelfCode?: string; itemCount?: string }>();
  const shelfId = String(params.shelfId ?? '');
  const shelfCode = String((params.shelfCode ?? shelfId) ?? '');
  const itemCount = useMemo(() => {
    const n = Number(params.itemCount ?? '');
    return Number.isFinite(n) ? n : undefined;
  }, [params.itemCount]);

  const [activeTab, setActiveTab] = useState<'free' | 'onshelf'>('free');
  const [selectOpen, setSelectOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const canSubmit = !!selectedItemId && activeTab === 'free';

  const [freeItems, setFreeItems] = useState<OrderItem[]>([]);
const [loadingFree, setLoadingFree] = useState(false);

React.useEffect(() => {
  const loadFreeItems = async () => {
    try {
      setLoadingFree(true);

      const orderItemsCollection = database.get<OrderItem>('order_items');
      const warehouseItemsCollection = database.get<WarehouseItem>('warehouse_items');

      const activeWarehouseItems = await warehouseItemsCollection
        .query(Q.where('is_active', true))
        .fetch();

      // IDs: order_items not in warehouse
      const usedItemIds = activeWarehouseItems.map((w: any) => w._raw.item_id);

      // order_items =/ usedItemIds
      const allOrderItems = await orderItemsCollection.query().fetch();
      const freeItemsList = allOrderItems.filter(
        (item: any) => !usedItemIds.includes(item.id)
      );

      setFreeItems(freeItemsList);
    } catch (error) {
      console.error('Σφάλμα φόρτωσης ελεύθερων τεμαχίων:', error);
    } finally {
      setLoadingFree(false);
    }
  };

  loadFreeItems();
}, []);



  const onSubmit = async () => {
   
    router.back();
  };

  return (
    <Page>
      <AppHeader showBack />

      {/* Τίτλος/Υπότιτλος */}
      <View style={{ alignItems: 'center', paddingVertical: 12 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>
          Προσθήκη/Μετακίνηση Τεμαχίου
        </Text>
        {!!shelfCode && (
          <Text style={{ marginTop: 4, fontSize: 12, color: '#6B7280' }}>
            Ράφι {shelfCode}{typeof itemCount === 'number' ? ` · ${itemCount} τεμάχια` : ''}
          </Text>
        )}
      </View>

      <View style={styles.screenWrap}>
        {/* Tabs με “pill” ενεργό */}
        <View style={styles.tabsWrap}>
          <Pressable
            style={[styles.tabBtn, activeTab === 'free' && styles.tabBtnActive]}
            onPress={() => setActiveTab('free')}
          >
            <Ionicons
              name="cube"
              size={16}
              color={activeTab === 'free' ? '#FFFFFF' : PURPLE}
            />
            <Text style={[styles.tabText, activeTab === 'free' && styles.tabTextActive]}>
              Ελεύθερα Τεμάχια
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tabBtn, activeTab === 'onshelf' && styles.tabBtnActive]}
            onPress={() => setActiveTab('onshelf')}
          >
            <Ionicons
              name="layers-outline"
              size={16}
              color={activeTab === 'onshelf' ? '#FFFFFF' : '#6B7280'}
            />
            <Text style={[styles.tabText, activeTab === 'onshelf' && styles.tabTextActive]}>
              Τεμάχια σε Ράφι
            </Text>
          </Pressable>
        </View>

        {/* Section container με απαλό μωβ background (όπως στο screenshot) */}
        <View style={styles.sectionCard}>
          {/* Μπάρα τίτλου ενότητας */}
          <View style={styles.sectionBar}>
            <Ionicons name="checkbox-outline" size={18} color={PURPLE} />
            <Text style={styles.sectionBarText}>Επιλογή Ελεύθερου Τεμαχίου</Text>
          </View>

          {/* Πεδίο: Διαθέσιμα Ελεύθερα Τεμάχια */}
          <View style={styles.fieldGroup}>
            <View style={styles.fieldLabelRow}>
              <View style={styles.dot} />
              <Text style={styles.fieldLabel}>Διαθέσιμα Ελεύθερα Τεμάχια</Text>
              <Text style={styles.required}>*</Text>
            </View>

            <Pressable style={styles.select} onPress={() => setSelectOpen(true)}>
              <Ionicons name="search-outline" size={18} color="#9CA3AF" />
              <Text
                style={[
                  styles.selectText,
                  { color: selectedItemId ? '#111827' : '#9CA3AF' },
                ]}
              >
                {selectedItemId ? selectedItemId : 'Επιλέξτε τεμάχιο για προσθήκη στο ράφι...'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
            </Pressable>
          </View>

          {/* Κάρτα Προορισμού */}
          <View style={styles.destinationCard}>
            <View style={styles.destLeft}>
              <View style={styles.destIcon}>
                <Ionicons name="cube" size={16} color={PURPLE} />
              </View>
              <View>
                <Text style={styles.destTitle}>Προορισμός</Text>
                <Text style={styles.destSubtitle}>Ράφι {shelfCode || '—'}</Text>
              </View>
            </View>

            {typeof itemCount === 'number' && (
              <Pressable onPress={() => {}} hitSlop={8}>
                <Text style={styles.destCountLink}>{itemCount} τεμάχια</Text>
              </Pressable>
            )}
          </View>

          {/* Footer actions */}
          <View style={styles.footer}>
            <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={16} color="#374151" />
              <Text style={styles.cancelText}>Ακύρωση</Text>
            </Pressable>

            <Pressable
              style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
              disabled={!canSubmit}
              onPress={onSubmit}
            >
              <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryText}>Προσθήκη Τεμαχίου</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Select Modal (χωρίς δεδομένα προς το παρόν) */}
      <Modal visible={selectOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setSelectOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.selectModal}>
            <View style={styles.selectHeader}>
              <Ionicons name="checkbox-outline" size={18} color={PURPLE} />
              <Text style={styles.selectHeaderText}>Επιλέξτε Τεμάχιο</Text>
            </View>

            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color="#6B7280" />
              <TextInput
                style={[
                  styles.searchInput,
                  Platform.OS === 'web' && ({ outlineStyle: 'none', outlineWidth: 0 } as any),
                ]}
                placeholder="Αναζήτηση κωδικού/περιγραφής/πελάτη..."
                placeholderTextColor="#9CA3AF"
                value={query}
                onChangeText={setQuery}
              />
            </View>

            {/* Μέχρι να συνδέσεις DB, δείξε empty state */}
            <View style={styles.emptyBox}>
              <Ionicons name="file-tray-outline" size={36} color="#9CA3AF" />
              <Text style={styles.emptyText}>Δεν υπάρχουν διαθέσιμα τεμάχια.</Text>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setSelectOpen(false)}>
                <Text style={styles.modalCancelText}>Κλείσιμο</Text>
              </Pressable>
              <Pressable
                style={styles.modalPick}
                onPress={() => {
                  // Όταν έχεις λίστα, κάνε setSelectedItemId(id) και κλείσε.
                  setSelectedItemId('ITEM_ID_HERE');
                  setSelectOpen(false);
                }}
              >
                <Text style={styles.modalPickText}>Χρήση επιλεγμένου</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },

  /* Tabs container */
  tabsWrap: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E9E7FF',
  },
  tabBtnActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  tabText: { color: '#6B7280', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#FFFFFF' },

  /* Section container με απαλό μωβ */
  sectionCard: {
    backgroundColor: PURPLE_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3E8FF',
    padding: 14,
  },

  sectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PURPLE_LIGHT,
    borderColor: '#DDD6FE',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  sectionBarText: { color: '#6B21A8', fontWeight: '800' },

  fieldGroup: { marginBottom: 14 },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#7C3AED' },
  fieldLabel: { fontSize: 13, color: '#111827', fontWeight: '700' },
  required: { color: '#EF4444', marginLeft: 2 },

  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
  },
  selectText: { flex: 1, fontSize: 14 },

  destinationCard: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  destLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  destIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: PURPLE_LIGHT, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  destTitle: { fontSize: 12, color: '#6B7280' },
  destSubtitle: { fontSize: 14, color: '#111827', fontWeight: '700' },
  destCountLink: { fontSize: 12, color: colors.primary, fontWeight: '800' },

  footer: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
  },
  cancelText: { color: '#374151', fontSize: 14, fontWeight: '600' },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C4B5FD',
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },

  /* Modal επιλογής */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  selectModal: {
    backgroundColor: '#FFFFFF',
    width: '98%',
    maxWidth: 760,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  selectHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  selectHeaderText: { fontWeight: '800', color: '#111827' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },

  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
  },
  emptyText: { color: '#6B7280', marginTop: 8 },

  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    justifyContent: 'flex-end',
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalCancelText: { color: '#374151', fontWeight: '600' },
  modalPick: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: PURPLE,
    borderRadius: 10,
  },
  modalPickText: { color: '#FFFFFF', fontWeight: '900' },
});
