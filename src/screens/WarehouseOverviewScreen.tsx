import { Ionicons } from '@expo/vector-icons'
import React, { useState } from 'react'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import AppHeader from '../components/AppHeader'
import { listAllActiveWarehouseItems, WarehouseListItem } from '../services/warehouseItems'


export default function WarehouseOverviewScreen() {
  const [loading, setLoading] = useState(true)
  const [φυλαξη, setΦυλαξη] = useState<any[]>([])
  const [επιστροφη, setΕπιστροφη] = useState<any[]>([])
  const [πλυμενα, setΠλυμενα] = useState<any[]>([])

    // helper
    const norm = (s?: string) =>
    (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove accents
        .trim();

    React.useEffect(() => {
    async function fetchItems() {
        try {
        const all = await listAllActiveWarehouseItems();

        const norm = (s?: string) =>
            (s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();

        setΦυλαξη(all.filter(x => norm(x.storage_status).includes('φυλαξ')));
        setΕπιστροφη(all.filter(x => norm(x.storage_status).includes('επιστροφ')));
        setΠλυμενα(all.filter(x => norm(x.status).includes('πλυμ')));
        } catch (e) {
        console.error('Failed to load warehouse items', e);
        } finally {
        setLoading(false);
        }
    }
    fetchItems();
    }, []);
  

    const renderItem = (it: WarehouseListItem) => (
        <View key={it.id} style={styles.itemCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <Text style={styles.itemCode}>{it.item_code}</Text>
            {it.category ? (
            <View style={styles.badge}>
                <Text style={styles.badgeText}>{it.category}</Text>
            </View>
            ) : null}
        </View>

        {it.customer_name ? (
            <Text style={styles.customer}>👤 {it.customer_name}</Text>
        ) : null}

        {it.order_date ? (
            <Text style={styles.info}>📅 {it.order_date}</Text>
        ) : null}

        {it.shelf_code ? (
            <Text style={styles.info}>📦 Ράφι: {it.shelf_code}</Text>
        ) : null}

        {it.color ? (
            <Text style={styles.info}>🎨 {it.color}</Text>
        ) : null}
        </View>
    )

  const renderPanel = (title: string, color: string, itemsArr: WarehouseListItem[]) => (
    <View style={[styles.panel, { backgroundColor: color }]}>
        <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>{title}</Text>
        <View style={styles.countBadge}>
            <Text style={styles.countText}>{itemsArr.length}</Text>
        </View>
        </View>

        <View style={styles.panelBody}>
        {loading ? (
            <Text style={styles.placeholderText}>Φόρτωση...</Text>
        ) : itemsArr.length === 0 ? (
            <Text style={styles.placeholderText}>Δεν υπάρχουν τεμάχια.</Text>
        ) : (
            <ScrollView
            style={{ maxHeight: 260 }}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled
            >
            {itemsArr.map(it => (
            <View key={it.id} style={styles.itemCard}>
                {/* Κωδικός */}
                <Text style={styles.itemCode}>{it.item_code}</Text>

                {/* Πελάτης */}
                {it.customer_name ? (
                <Text style={styles.customer}>
                    <Ionicons name="person-outline" size={14} color="#374151" /> {it.customer_name}
                </Text>
                ) : null}

                {/* Ημερομηνία */}
                {it.order_date ? (
                <Text style={styles.info}>
                    <Ionicons name="calendar-outline" size={14} color="#374151" /> {it.order_date}
                </Text>
                ) : null}

                {/* Ράφι */}
                {it.shelf_code ? (
                <Text style={styles.info}>
                    <Ionicons name="cube-outline" size={14} color="#374151" /> Ράφι: {it.shelf_code}
                </Text>
                ) : null}

                {/* Χρώμα */}
                {it.color ? (
                <Text style={styles.info}>
                    <Ionicons name="color-palette-outline" size={14} color="#374151" /> {it.color}
                </Text>
                ) : null}
            </View>
            ))}
            </ScrollView>
        )}
        </View>
    </View>
  )


  return (
  <View style={{ flex: 1, backgroundColor: '#ffffffff' }}>
    <ScrollView
      style={styles.scroller}
      contentContainerStyle={styles.containerScroll}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      {/*  Header */}
      <View style={styles.headerWrapper}>
        <AppHeader showBack />
      </View>

      <Text style={styles.title}>Προεπισκόπηση Αποθήκης</Text>
      <Text style={styles.subtitle}>Σύνοψη όλων των τεμαχίων</Text>

      {/* Panels */}
      <View style={styles.row}>
        {renderPanel('ΦΥΛΑΞΗ', '#ECFDF5', φυλαξη)}
        {renderPanel('ΕΠΙΣΤΡΟΦΗ', '#EFF6FF', επιστροφη)}
      </View>

      <View style={styles.row}>
        {renderPanel('ΠΛΥΜΕΝΑ', '#EDE9FE', πλυμενα)}
      </View>
    </ScrollView>
  </View>
)




}

const styles = StyleSheet.create({

scroller: { flex: 1, width: '100%' },
containerScroll: {
  alignItems: 'stretch',  
  justifyContent: 'flex-start',
  paddingHorizontal: 40,  
  paddingTop: 12,
  paddingBottom: 40,
  width: '100%',
  maxWidth: 4300,         
  alignSelf: 'center',  
  ...(Platform.OS !== 'web' && {
      paddingHorizontal: 8,
      paddingTop: 14,
      paddingBottom: 20,
    }),   
},
headerWrapper: {
  width: '100%',
  maxWidth: 3200,   
  paddingHorizontal: 16,
  ...(Platform.OS !== 'web' && {
      marginTop: 40, 
    }),
},

  container: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    gap: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#3B82F6',
    textAlign: 'center',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
  flexWrap: 'wrap',          
  justifyContent: 'space-between',
    gap: 16,
    fontWeight: '400'
  },
  panel: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  panelTitle: {
    fontWeight: '700',
    color: '#111827',
  },
  countBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countBadgeBlue: {
    backgroundColor: '#DBEAFE',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countBadgeGreen: {
    backgroundColor: '#DCFCE7',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countBadgePink: {
    backgroundColor: '#FECDD3',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    },
  countBadgeOrange: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },
  panelBody: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
  },
  placeholderText: {
    color: '#6B7280',
    textAlign: 'center',
    fontSize: 13,
  },

  itemCard: {
  backgroundColor: '#F9FAFB',
  borderWidth: 1,
  borderColor: '#E5E7EB',
  borderRadius: 12,
  padding: 10,
  marginBottom: 10,
},
itemCode: {
  fontWeight: '700',
  fontSize: 15,
  color: '#111827',
},
badge: {
  alignSelf: 'flex-start',
  backgroundColor: '#F3F4F6',
  borderRadius: 6,
  paddingHorizontal: 6,
  paddingVertical: 2,
  marginTop: 2,
  marginBottom: 4,
},
badgeText: { fontSize: 12, color: '#374151' },
customer: { fontSize: 13, color: '#4B5563' },
info: { fontSize: 12, color: '#6B7280' },

})
