import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React from 'react'
import type { ColorValue } from 'react-native'
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'

import AppHeader from '../components/AppHeader'
import Page from '../components/Page'
import { logFilterHistoryApplied } from '../services/activitylog'
import { useAuth } from '../state/AuthProvider'
import { colors } from '../theme/colors'

// <- services/history (load from DB)
import {
  listHistoryCustomers,
  listHistoryItems,
  listHistoryOrders,
  type HistoryCustomer,
  type HistoryFilters,
  type HistoryItem,
  type HistoryOrder,
} from '../services/history'

function StatusChip({ status }: { status?: string }) {
  const s = (status || '').toLowerCase()
  if (s === 'πλυμένο') {
    return (
      <View style={[styles.chip, styles.chipGreen]}>
        <Text style={[styles.chipText, styles.chipGreenText]}>Πλυμένο</Text>
      </View>
    )
  }
  if (s === 'άπλυτο') {
    return (
      <View style={[styles.chip, styles.chipOrange]}>
        <Text style={[styles.chipText, styles.chipOrangeText]}>Άπλυτο</Text>
      </View>
    )
  }
  return null
}

function StorageChip({ storage }: { storage?: string }) {
  const raw = (storage || '').toLowerCase().trim()
  // normalize:
  const s = raw
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') 
    .replace(/λ{2,}/g, 'λ') 
  if (s === 'φυλαξη') {
    return (
      <View style={[styles.chip, styles.chipPurple]}>
        <Text style={[styles.chipText, styles.chipPurpleText]}>Φύλαξη</Text>
      </View>
    )
  }
  if (s === 'επιστροφη') {
    return (
      <View style={[styles.chip, styles.chipRed]}>
        <Text style={[styles.chipText, styles.chipRedText]}>Επιστροφή</Text>
      </View>
    )
  }
  return null
}

function OrderStatusChip({ status }: { status?: string }) {
  if (!status) return null

  const s = status
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // αφαιρεί τόνους
    .trim()

  // Χάρτης status → χρώματα + ετικέτα
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    'νεα':              { bg: '#DBEAFE', fg: '#1E40AF', label: 'Νέα' },
    'σε επεξεργασια':   { bg: '#FEF3C7', fg: '#92400E', label: 'Σε επεξεργασία' },
    'ετοιμη':           { bg: '#E0F2FE', fg: '#075985', label: 'Έτοιμη' },
    'παραδοθηκε':       { bg: '#DCFCE7', fg: '#166534', label: 'Παραδόθηκε' },
  }

  const palette = map[s]
  if (!palette) return null

  return (
    <View style={[styles.chip, { backgroundColor: palette.bg, marginLeft: 8 }]}>
      <Text style={[styles.chipText, { color: palette.fg }]}>{palette.label}</Text>
    </View>
  )
}


/*  Dropdown (Modal)  */
function SimpleDropdown({
  value,
  placeholder,
  options,
  onChange,
  width = '100%',
}: {
  value: string
  placeholder?: string
  options: string[]
  onChange: (v: string) => void
  width?: number | `${number}%` | 'auto'
}) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [anchor, setAnchor] = React.useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const anchorRef = React.useRef<View>(null)

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [query, options])

  // Όταν ανοίγει, μετράμε τη θέση του anchor σε οθόνη
  const toggleOpen = React.useCallback(() => {
    if (!open) {
      // open -> measure first
      requestAnimationFrame(() => {
        anchorRef.current?.measureInWindow((x, y, w, h) => {
          setAnchor({ x, y, w, h })
          setOpen(true)
        })
      })
    } else {
      setOpen(false)
    }
  }, [open])

  return (
    <>
      {/* Anchor (input) */}
      <View ref={anchorRef} style={{ width }}>
        <Pressable onPress={toggleOpen} style={styles.dropdownWrap}>
          <Text
            style={[styles.filledInputText, { paddingRight: 28, opacity: value ? 1 : 0.6 }]}
            numberOfLines={1}
          >
            {value?.trim() || placeholder || 'Επιλέξτε…'}
          </Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#9CA3AF"
            style={styles.dropdownIcon}
          />
        </Pressable>
      </View>

      {/* Portal / Modal: βγαίνει πάνω απ’ όλα */}
      <Modal
        visible={open}
        animationType="fade"
        transparent
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        {/* Backdrop για click-outside */}
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />

        {/* Λίστα, απολύτως τοποθετημένη κάτω από το anchor */}
        {anchor && (
          <View
            style={[
              styles.dropdownList,
              {
                position: 'absolute',
                left: Math.max(8, anchor.x),            // μικρό padding από άκρες
                top: anchor.y + anchor.h,
                width: anchor.w,
                maxHeight: 260,
              },
            ]}
          >
            {/* Search box */}
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

            {/* Options */}
            <ScrollView>
              {filtered.length === 0 ? (
                <View style={styles.ddEmpty}>
                  <Text style={styles.ddEmptyText}>Δεν βρέθηκαν επιλογές</Text>
                </View>
              ) : (
                filtered.map((opt, idx) => {
                  const selected = value?.trim().toLowerCase() === opt.toLowerCase()
                  return (
                    <Pressable
                      key={`${opt}-${idx}`}
                      onPress={() => {
                        onChange(opt)
                        setOpen(false)
                        setQuery('')
                      }}
                      style={[styles.ddOption, idx % 2 === 1 && styles.ddOptionAlt]}
                    >
                      <Text
                        style={[styles.ddOptionText, selected && styles.ddOptionTextSelected]}
                        numberOfLines={1}
                      >
                        {opt}
                      </Text>
                      {selected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
                    </Pressable>
                  )
                })
              )}
            </ScrollView>
          </View>
        )}
      </Modal>
    </>
  )
}

// item's filter
function isItemScopedFiltersActive(f: HistoryFilters) {

  const touchesItems =
    (f.category != null) ||
    (f.status != null) ||
    (f.storageStatus != null)

  return touchesItems
}

/* ----  dropdowns ---- */
const CATEGORY_OPTIONS = ['Μοκέτα','Πάπλωμα', 'Κουβέρτα', 'Φλοκάτι', 'Κουρτίνα', 'Διαδρομάκι', 'Χαλί']
const STATUS_OPTIONS = ['Όλα', 'άπλυτο', 'πλυμένο']
const STORAGE_STATUS_OPTIONS = ['Όλες', 'Φύλαξη', 'Επιστροφή']

type TwoOrMoreColors = [ColorValue, ColorValue, ...ColorValue[]]

/*  Metric Tile (card style with gradient) */
function MetricTile({
  icon,
  title,
  value,
  bgGradient,
}: {
  icon: React.ReactNode
  title: string
  value: string | number
  bgGradient: TwoOrMoreColors
}) {
  return (
    <LinearGradient colors={bgGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tileCard}>
      <View style={styles.tileContent}>
        <View style={styles.tileIcon}>{icon}</View>
        <View>
          <Text style={styles.tileValue}>{value}</Text>
          <Text style={styles.tileTitle}>{title}</Text>
        </View>
      </View>
    </LinearGradient>
  )
}

type TabKey = 'customers' | 'items' | 'orders'

export default function HistoryScreen() {
  // active tab
  const [activeTab, setActiveTab] = React.useState<TabKey>('customers')
  

  // filter UI
  const [search, setSearch] = React.useState('')
  const [yearFrom, setYearFrom] = React.useState('Όλα')
  const [yearTo, setYearTo] = React.useState('Όλα')
  const [status, setStatus] = React.useState('Όλα')
  const [category, setCategory] = React.useState('Όλες')
  const [storageStatus, setStorageStatus] = React.useState('Όλες')

  // states for dropdown (customer;s
  const [customerId, setCustomerId] = React.useState<string | null>(null)
  const [customerLabel, setCustomerLabel] = React.useState<string>('Όλοι')
  const [customerOpts, setCustomerOpts] = React.useState<Array<{ id: string; label: string }>>([])

  // data states
  const [loading, setLoading] = React.useState(false)
  const [rowsCustomers, setRowsCustomers] = React.useState<HistoryCustomer[]>([])
  const [rowsItems, setRowsItems] = React.useState<HistoryItem[]>([])
  const [rowsOrders, setRowsOrders] = React.useState<HistoryOrder[]>([])

  // delivered + no dept
  const deliveredRevenue = React.useMemo(() => {
  const norm = (s?: string) =>
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()

  const sum = rowsOrders.reduce((acc, o) => {
    if (norm(o.order_status) === 'παραδοθηκε' && o.hasDebt === false) {
      acc += Number(o.totalAmount || 0)
    }
    return acc
  }, 0)

  return new Intl.NumberFormat('el-GR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(sum)
}, [rowsOrders])



  // 🔹 Expanded ανά πελάτη (inline)
  const [expandedCustomerId, setExpandedCustomerId] = React.useState<string | null>(null)
  const [expandedLoading, setExpandedLoading] = React.useState(false)
  const [expandedOrders, setExpandedOrders] = React.useState<HistoryOrder[]>([])
  const [expandedItems, setExpandedItems] = React.useState<HistoryItem[]>([])

  const loadExpandedForCustomer = React.useCallback(async (custId: string) => {
    setExpandedLoading(true)
    try {
      const [rOrders, rItems] = await Promise.all([
        listHistoryOrders({ ...filters, customerId: custId }),
        listHistoryItems({ ...filters, customerId: custId }),
      ])
      setExpandedOrders(rOrders)
      setExpandedItems(rItems)
    } catch (e) {
      console.error('load expanded customer failed', e)
      setExpandedOrders([])
      setExpandedItems([])
    } finally {
      setExpandedLoading(false)
    }
  }, []) 

  // year
  const yearOptions = React.useMemo(() => {
    const now = new Date().getFullYear()
    const from = now - 12
    const years: string[] = ['Όλα']
    for (let y = now; y >= from; y--) years.push(String(y))
    return years
  }, [])


    // helpers: build filters object
  const filters = React.useMemo<HistoryFilters>(() => {
    const yf = yearFrom !== 'Όλα' ? Number(yearFrom) : null
    const yt = yearTo !== 'Όλα' ? Number(yearTo) : null
    return {
      search: search.trim() || undefined,
      yearFrom: yf,
      yearTo: yt,
      category: category !== 'Όλες' ? category : null,
      status: status !== 'Όλα' ? status : null,
      customerId: customerId, // <- ID από το dropdown
      storageStatus: storageStatus !== 'Όλες' ? storageStatus : null,
      limit: 200,
    }
  }, [search, yearFrom, yearTo, category, status, storageStatus, customerId])

  //  user from AuthProvider
  const { user: authUser, loading: authContextLoading } = useAuth()

  const lastLoggedRef = React.useRef<string>('')
  const didMountRef = React.useRef(false)

  // Logging --> filters 
  React.useEffect(() => {
    if (authContextLoading) return
    const userId = authUser?.id
    if (!userId) return

    if (!didMountRef.current) {
      didMountRef.current = true
      return
    }

    const payload = JSON.stringify(filters)
    if (payload === lastLoggedRef.current) return
    lastLoggedRef.current = payload

    const t = setTimeout(() => {
      logFilterHistoryApplied(userId, filters).catch((e) => {
        console.error('logFilterHistoryApplied failed', e)
      })
    }, 300)

    return () => clearTimeout(t)
  }, [filters, authUser, authContextLoading])

  // choose customers -> orders -> order_items of these orders
  React.useEffect(() => {
  let cancelled = false

  async function loadAll() {
    try {
      // 1️⃣ Φόρτωση πελατών για dropdown (μένει ως έχει)
      const all = await listHistoryCustomers({ limit: 1000 })
      const opts = all.map(c => {
        const name = `${(c.firstName || '').trim()} ${(c.lastName || '').trim()}`.trim() || 'Χωρίς όνομα'
        const label = c.phone ? `${name} • ${c.phone}` : name
        return { id: c.id, label }
      })
      if (!cancelled) setCustomerOpts(opts)

      // 2️⃣ Όταν έχει επιλεγεί πελάτης, ΦΟΡΤΩΝΟΥΜΕ με ΟΛΑ τα φίλτρα
      if (customerId) {
        setLoading(true)

        // ΠΕΡΝΑΜΕ τα τρέχοντα φίλτρα μαζί με το customerId
        const orders = await listHistoryOrders({ ...filters, customerId })
        if (cancelled) return

        const orderIds = orders.map(o => o.id)
        const items = await listHistoryItems({ ...filters, customerId, orderIds })
        if (cancelled) return

        if (!cancelled) {
          setRowsOrders(orders)
          setRowsItems(items)
        }
      }
    } catch (e) {
      console.error('load customers/orders/items failed', e)
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  loadAll()
  return () => { cancelled = true }
  // 👉 Πολύ σημαντικό: εξαρτώμαστε και από τα filters,
  // ώστε να ξανα-φορτώνει σωστά όταν αλλάζουν (ό,τι σειρά και να τα βάλεις).
  }, [customerId, filters])

  // update callback --> filters
  React.useEffect(() => {
    
    loadExpandedForCustomer
  }, [filters])

  // PREFETCH 
React.useEffect(() => {
  let cancelled = false
  async function run() {
    setLoading(true)
    try {
      const itemsScoped = isItemScopedFiltersActive(filters)

      // load customers
      const rCustomers = await listHistoryCustomers(filters)
      if (cancelled) return
      setRowsCustomers(rCustomers)

      if (!itemsScoped) {
        // only item-scoped filter --> generic items+orders
        const [rItems, rOrders] = await Promise.all([
          listHistoryItems(filters),
          listHistoryOrders(filters),
        ])
        if (cancelled) return
        setRowsItems(rItems)
        setRowsOrders(rOrders)
      } else {
        //  item-scoped --> runItemsFirst() 
      }
    } catch (e) {
      console.error('history load failed', e)
    } finally {
      if (!cancelled) setLoading(false)
    }
  }
  run()
  return () => { cancelled = true }
}, [filters])


  React.useEffect(() => {
  let cancelled = false

  async function runItemsFirst() {
    try {
      //ONLY item-scoped filters (category, ..)
      if (!isItemScopedFiltersActive(filters)) return

      setLoading(true)

      // load items
      const items = await listHistoryItems(filters)
      if (cancelled) return

      
      setRowsItems(items)

      // clean orders if NOT items
      if (items.length === 0) {
        setRowsOrders([])      
        return                 
      }

      // find orderIds of items
      const orderIdSet = new Set<string>()
      for (const it of items) {
        if (it.orderId) orderIdSet.add(it.orderId)
      }
      const orderIds = Array.from(orderIdSet)

      // if NOT orderIds --> CLEAN orders
      if (orderIds.length === 0) {
        setRowsOrders([])
        return
      }

      // load these orders
      const orders = await listHistoryOrders({ ...filters, orderIds })
      if (cancelled) return

      setRowsOrders(orders)
    } catch (e) {
      console.error('items→orders load failed', e)
      if (!cancelled) {
        setRowsItems([])
        setRowsOrders([])
      }
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  runItemsFirst()
  return () => {
    cancelled = true
  }
}, [filters])



  
  return (
    <Page>
      {/* header */}
      <AppHeader showBack />

      {/* Περιεχόμενο */}
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Τίτλος "Φίλτρα Αναζήτησης" */}
        <View style={styles.filtersHeaderRow}>
          <Ionicons name="filter-outline" size={22} color={colors.primary} style={{ marginRight: 8 }} />
          <Text style={styles.filtersHeaderText}>Φίλτρα Αναζήτησης</Text>
        </View>

        {/* Γραμμή αναζήτησης */}
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color={colors.primary} style={{ marginRight: 6 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Αναζήτηση σε πελάτες, τεμάχια, παραγγελίες..."
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
            returnKeyType="search"
          />
        </View>

        {/* Row: Από Χρονιά / Μέχρι Χρονιά */}
        <View style={styles.row2}>
          <View style={[styles.inputWrap, styles.flex1]}>
            <Text style={styles.labelRowTitle}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} /> {'  '}
              Από Χρονιά
            </Text>
            <SimpleDropdown value={yearFrom} options={yearOptions} onChange={setYearFrom} placeholder="Όλα" />
          </View>

          <View style={[styles.inputWrap, styles.flex1]}>
            <Text style={styles.labelRowTitle}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} /> {'  '}
              Μέχρι Χρονιά
            </Text>
            <SimpleDropdown value={yearTo} options={yearOptions} onChange={setYearTo} placeholder="Όλα" />
          </View>
        </View>

        {/* Row: Κατάσταση Τεμαχίων / Κατάσταση Αποθήκης */}
        <View style={styles.row2}>
          <View style={[styles.inputWrap, styles.flex1]}>
            <Text style={styles.groupLabel}>Κατάσταση Τεμαχίων</Text>
            <SimpleDropdown
              value={status}
              options={STATUS_OPTIONS}
              onChange={setStatus}
              placeholder="Όλα"
            />
          </View>

          <View style={[styles.inputWrap, styles.flex1]}>
            <Text style={styles.groupLabel}>Κατάσταση Αποθήκης</Text>
            <SimpleDropdown
              value={storageStatus}
              options={STORAGE_STATUS_OPTIONS}
              onChange={setStorageStatus}
              placeholder="Όλες"
            />
          </View>
        </View>

        {/* Row: Κατηγορία / Πελάτης */}
        <View style={styles.row2}>
          <View style={[styles.inputWrap, styles.flex1]}>
            <Text style={styles.groupLabel}>Κατηγορία</Text>
            <SimpleDropdown
              value={category}
              options={['Όλες', ...CATEGORY_OPTIONS]}
              onChange={setCategory}
              placeholder="Όλες"
            />
          </View>

          <View style={[styles.inputWrap, styles.flex1]}>
            <Text style={styles.groupLabel}>Πελάτης</Text>
            <SimpleDropdown
              value={customerLabel}
              options={['Όλοι', ...customerOpts.map(o => o.label)]}
              onChange={(label) => {
                setCustomerLabel(label)
                if (label === 'Όλοι') {
                  setCustomerId(null)
                } else {
                  const found = customerOpts.find(o => o.label === label)
                  setCustomerId(found?.id ?? null)
                }
              }}
              placeholder="Όλοι"
            />
          </View>
        </View>

        {/* ==== Metric tiles (πάνω) ==== */}
        <View style={styles.tilesRow}>
          <MetricTile
            bgGradient={['#3B82F6', '#2563EB']}
            icon={<Ionicons name="people-outline" size={22} color="#fff" />}
            title="Πελάτες"
            value={rowsCustomers.length || 0}
          />
          <MetricTile
            bgGradient={['#10B981', '#059669']}
            icon={<Ionicons name="cube-outline" size={22} color="#fff" />}
            title="Τεμάχια"
            value={rowsItems.length || 0}
          />
          <MetricTile
            bgGradient={['#A855F7', '#7C3AED']}
            icon={<Ionicons name="cart-outline" size={22} color="#fff" />}
            title="Παραγγελίες"
            value={rowsOrders.length || 0}
          />
          <MetricTile
            bgGradient={['#F59E0B', '#D97706']}
            icon={<Ionicons name="cash-outline" size={22} color="#fff" />}
            title="Συνολικός Τζίρος"
            value={deliveredRevenue}
          />
        </View>

        {/* ==== Segmented Tabs: Πελάτες | Τεμάχια | Παραγγελίες ==== */}
        <View style={styles.tabsRow}>
          <Pressable
            onPress={() => setActiveTab('customers')}
            style={[styles.tabBtn, activeTab === 'customers' && styles.tabBtnActive]}
          >
            <Ionicons
              name="people-outline"
              size={16}
              color={activeTab === 'customers' ? colors.primary : '#6B7280'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, activeTab === 'customers' && styles.tabTextActive]}>Πελάτες</Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('items')}
            style={[styles.tabBtn, activeTab === 'items' && styles.tabBtnActive]}
          >
            <Ionicons
              name="cube-outline"
              size={16}
              color={activeTab === 'items' ? colors.primary : '#6B7280'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, activeTab === 'items' && styles.tabTextActive]}>Τεμάχια</Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('orders')}
            style={[styles.tabBtn, activeTab === 'orders' && styles.tabBtnActive]}
          >
            <Ionicons
              name="cart-outline"
              size={16}
              color={activeTab === 'orders' ? colors.primary : '#6B7280'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.tabText, activeTab === 'orders' && styles.tabTextActive]}>Παραγγελίες</Text>
          </Pressable>
        </View>

        {/* ==== Λίστες ανά tab ==== */}
        <View style={styles.listPanel}>
          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Φόρτωση…</Text>
            </View>
          ) : activeTab === 'customers' ? (
            <>
              {/* Λίστα Πελατών */}
              {(customerId ? rowsCustomers.filter(c => c.id === customerId) : rowsCustomers).length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Δεν βρέθηκαν πελάτες</Text>
                </View>
              ) : (
                <FlatList
                  data={customerId ? rowsCustomers.filter(c => c.id === customerId) : rowsCustomers}
                  keyExtractor={(it) => it.id}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  renderItem={({ item }) => {
                    const isExpanded = expandedCustomerId === item.id
                    return (
                      <View>
                        <Pressable
                          onPress={async () => {
                            if (isExpanded) {
                              // collapse
                              setExpandedCustomerId(null)
                              setExpandedOrders([])
                              setExpandedItems([])
                            } else {
                              // open new
                              setExpandedCustomerId(item.id)
                              await loadExpandedForCustomer(item.id)
                            }
                          }}
                          style={styles.cardRow}
                        >
                          <View style={styles.avatarBox}>
                            <Text style={{ color: colors.primary, fontWeight: '800' }}>
                              {(item.firstName?.[0] || item.lastName?.[0] || 'Π').toUpperCase()}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.rowTitle}>
                              {(item.firstName + ' ' + item.lastName).trim() || '—'}
                            </Text>
                            <Text style={styles.rowSub} numberOfLines={1}>
                              {item.phone || '—'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Text style={styles.rowRight}>
                              {new Date(item.createdAt).toLocaleDateString('el-GR')}
                            </Text>
                            <Ionicons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color="#9CA3AF"
                              style={{ marginLeft: 6 }}
                            />
                          </View>
                        </Pressable>

                        {/* Inline expanded panel */}
                        {isExpanded && (
                          <View style={styles.expandedPanel}>
                            {expandedLoading ? (
                              <View style={styles.emptyState}>
                                <Text style={styles.emptyTitle}>Φόρτωση…</Text>
                              </View>
                            ) : (
                              <>
                                {/* Παραγγελίες πελάτη */}
                                <View style={styles.expandedSectionHeader}>
                                  <Ionicons name="cart-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                                  <Text style={[styles.groupLabel, { marginBottom: 0 }]}>
                                    Παραγγελίες πελάτη ({expandedOrders.length})
                                  </Text>
                                  <View style={{ flex: 1 }} />
                                  <Pressable onPress={() => setActiveTab('orders')} style={[styles.pill, { paddingHorizontal: 10 }]}>
                                    <Text style={styles.pillText}>Προβολή όλων</Text>
                                  </Pressable>
                                </View>

                                {expandedOrders.length === 0 ? (
                                  <View style={styles.emptyState}>
                                    <Text style={styles.emptyTitle}>Δεν βρέθηκαν παραγγελίες για τον πελάτη</Text>
                                  </View>
                                ) : (
                                  <View style={{ gap: 8 }}>
                                    {expandedOrders.map((order) => (
                                      <View key={order.id} style={styles.orderRow}>
                                        <View style={styles.orderHeader}>
                                          <View style={styles.pill}>
                                            <Text style={styles.pillText}>#{order.id.slice(0, 6).toUpperCase()}</Text>
                                          </View>
                                           <OrderStatusChip status={order.order_status} />

                                          <View style={{ flex: 1 }} />
                                          <Text style={styles.moneyText}>
                                            {new Intl.NumberFormat('el-GR', {
                                              style: 'currency',
                                              currency: 'EUR',
                                              maximumFractionDigits: 2,
                                            }).format(order.totalAmount ?? 0)}
                                          </Text>
                                        </View>

                                        <View style={{ marginTop: 6 }}>
                                          <Text style={styles.rowSub}>
                                            {`${(item.firstName || '').trim()} ${(item.lastName || '').trim()}`.trim() || '—'} • {order.paymentMethod || '—'}
                                          </Text>
                                          <Text style={styles.rowSub}>{order.orderDate || '—'}</Text>
                                        </View>

                                      </View>
                                    ))}
                                  </View>
                                )}

                                {/* Τεμάχια πελάτη */}
                                <View style={[styles.expandedSectionHeader, { marginTop: 14 }]}>
                                  <Ionicons name="cube-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                                  <Text style={[styles.groupLabel, { marginBottom: 0 }]}>
                                    Τεμάχια πελάτη ({expandedItems.length})
                                  </Text>
                                  <View style={{ flex: 1 }} />
                                  <Pressable onPress={() => setActiveTab('items')} style={[styles.pill, { paddingHorizontal: 10 }]}>
                                    <Text style={styles.pillText}>Προβολή όλων</Text>
                                  </Pressable>
                                </View>

                                {expandedItems.length === 0 ? (
                                  <View style={styles.emptyState}>
                                    <Text style={styles.emptyTitle}>
                                      Δεν βρέθηκαν τεμάχια
                                      {category !== 'Όλες' ? ` στην κατηγορία “${category}”` : ''}
                                      {status !== 'Όλα' ? ` με κατάσταση “${status}”` : ''}
                                      {storageStatus !== 'Όλες' ? ` και κατάσταση αποθήκης “${storageStatus}”` : ''}
                                    </Text>
                                  </View>
                                ) : (
                                  <View style={{ gap: 8 }}>
                                    {expandedItems.map((it) => {
                                        const order = expandedOrders.find(o => o.id === it.orderId)
                                        

                                        return (
                                        <View key={it.id} style={styles.orderRow}>
                                            {/* Header: code + chips + category δεξιά */}
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                <View style={styles.pillCode}>
                                                    <Text style={styles.pillCodeText}>{it.item_code || `#${it.id.slice(0,6)}`}</Text>
                                                </View>
                                                <StatusChip status={it.status} />
                                                <StorageChip storage={it.storage_status} />
                                                <View style={{ flex: 1 }} />
                                                <Text style={styles.rowTitle}>{it.category || '—'}</Text>
                                            </View>

                                            {/* Details */}
                                            <View style={styles.metaRow}>
                                            <Text style={styles.metaLabel}>Κατηγορία:</Text>
                                            <Text style={styles.metaValue}>{it.category || '—'}</Text>
                                            </View>
                                            <View style={styles.metaRow}>
                                            <Text style={styles.metaLabel}>Χρώμα:</Text>
                                            <Text style={styles.metaValue}>{it.color || '—'}</Text>
                                            </View>
                                           

                                            <View style={styles.divider} />

                                            {/* Footer: ημερομηνία */}
                                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                <View style={{ flex: 1 }} />
                                                <View style={[styles.chip, { backgroundColor: '#F3F4F6' }]}>
                                                    <Text style={[styles.chipText, { color: '#111827' }]}>
                                                    {it.order_date || '—'}
                                                    </Text>
                                                </View>
                                            </View>

                                        </View>
                                        )
                                    })}
                                    </View>

                                )}
                              </>
                            )}
                          </View>
                        )}
                      </View>
                    )
                  }}
                />
              )}
            </>
          ) : activeTab === 'items' ? (
            rowsItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Δεν βρέθηκαν τεμάχια</Text>
              </View>
            ) : (
              <FlatList
                data={rowsItems}
                keyExtractor={(it) => it.id}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item }) => (
                  <View style={styles.cardRow}>
                    <View style={styles.squareIcon}>
                      <Ionicons name="cube-outline" size={18} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{item.item_code || `#${item.id.slice(0, 6)}`}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {item.category || '—'} {item.color ? `• ${item.color}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.rowRight}>{item.order_date || '—'}</Text>
                  </View>
                )}
              />
            )
          ) : rowsOrders.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Δεν βρέθηκαν παραγγελίες</Text>
            </View>
          ) : (
            <FlatList
              data={rowsOrders}
              keyExtractor={(it) => it.id}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              renderItem={({ item }) => (
                <View style={styles.orderRow}>
                  <View style={styles.orderHeader}>
                    <View style={styles.pill}>
                      <Text style={styles.pillText}>#{item.id.slice(0, 6).toUpperCase()}</Text>
                    </View>
                        
                    <OrderStatusChip status={item.order_status} />

                    <View style={{ flex: 1 }} />
                    <Text style={styles.moneyText}>
                      {new Intl.NumberFormat('el-GR', {
                        style: 'currency',
                        currency: 'EUR',
                        maximumFractionDigits: 2,
                      }).format(item.totalAmount ?? 0)}
                    </Text>
                  </View>

                  <View style={{ marginTop: 6 }}>
                    <Text style={styles.rowSub}>
                      {item.customerName || '—'} • {item.paymentMethod || '—'}
                    </Text>
                    <Text style={styles.rowSub}>{item.orderDate || '—'}</Text>
                  </View>
                </View>
              )}
            />
          )}
        </View>
      </ScrollView>
    </Page>
  )
}

const styles = StyleSheet.create({



    chip: {
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 9999,
  backgroundColor: '#EEF2FF',
},
chipText: { fontWeight: '800', color: '#1F2937' },

chipGreen: { backgroundColor: '#DCFCE7' },
chipGreenText: { color: '#166534' },

chipOrange: { backgroundColor: '#FFEDD5' },
chipOrangeText: { color: '#9A3412' },

chipPurple: { backgroundColor: '#EDE9FE' },
chipPurpleText: { color: '#6D28D9' },

chipRed: { backgroundColor: '#FEE2E2' },
chipRedText: { color: '#991B1B' },

divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 10 },

metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
metaLabel: { width: 88, color: '#6B7280', fontSize: 13 },
metaValue: { flex: 1, color: '#111827', fontSize: 13, fontWeight: '700' },

pillCode: {
  backgroundColor: '#1D4ED8',
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 9999,
},
pillCodeText: { color: '#fff', fontWeight: '800' },

  container: { padding: 16, paddingBottom: 40, overflow: 'visible' },
  /* Header  */
  filtersHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  filtersHeaderText: { fontSize: 20, fontWeight: '400', color: (colors as any)?.textPrimary ?? '#1F2A44' },

  /* Search */
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#BFDBFE',
    backgroundColor: '#F8FAFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 14,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },

  /* Rows */
  row2: { flexDirection: 'row', gap: 12, marginBottom: 12, overflow: 'visible' },
  row3: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  inputWrap: { minWidth: 0 },
  flex1: { flex: 1 },

  labelRowTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: (colors as any)?.textPrimary ?? '#1F2A44',
    marginBottom: 6,
  },
  groupLabel: { fontSize: 14, fontWeight: '400', color: '#374151', marginBottom: 6 },

  /* Dropdown anchor */
  dropdownWrap: {
    position: 'relative',
    borderWidth: 2,
    borderColor: '#D1D5DB',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
  },
  filledInputText: { fontSize: 14, color: '#111827' },
  dropdownIcon: { position: 'absolute', right: 10, top: 12 },

  /* Dropdown modal */
  ddBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.18)', padding: 18, justifyContent: 'center' },
  ddCard: { backgroundColor: '#fff', borderRadius: 14, padding: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },

  /* Tiles */
  tilesRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 6,
    marginBottom: 14,
  },
  tileCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 16,
    padding: 14,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    minHeight: 110,
  },
  tileContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileValue: { color: '#fff', fontSize: 22, fontWeight: '400' },
  tileTitle: { color: '#fff', fontSize: 14, fontWeight: '400', opacity: 0.9 },

  /* Segmented tabs */
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    gap: 6,
    marginBottom: 10,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { color: '#6B7280', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#111827' },

  /* List panel & rows */
  listPanel: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 10,
    overflow: 'visible',
  },

  emptyState: { padding: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, color: '#111827', fontWeight: '700' },

  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F1F1F3',
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#fff',
  },
  avatarBox: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  squareIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rowTitle: { fontSize: 14, color: '#111827', fontWeight: '700' },
  rowSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  rowRight: { color: '#6B7280', fontSize: 12, marginLeft: 10 },

  /* Order row */
  orderRow: {
    borderWidth: 1.5,
    borderColor: '#F1F1F3',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fff',
  },
  orderHeader: { flexDirection: 'row', alignItems: 'center' },
  pill: { backgroundColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9999 },
  pillText: { color: '#1D4ED8', fontWeight: '800' },
  moneyText: { fontWeight: '800', color: '#111827' },

  //  inline dropdown box (absolute)
  dropdownList: {
    position: 'absolute',
    top: 46,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    zIndex: 1000,
    elevation: 100,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    overflow: 'hidden',
  },

  ddSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  ddSearchInput: { flex: 1, fontSize: 14, color: '#111827' },
  ddEmpty: { paddingVertical: 20, alignItems: 'center' },
  ddEmptyText: { color: '#6B7280' },

  ddOption: { paddingVertical: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ddOptionAlt: { backgroundColor: '#FAFAFA' },
  ddOptionText: { fontSize: 14, color: '#111827' },
  ddOptionTextSelected: { fontWeight: '800', color: colors.primary },

  /* Expanded inline panel */
  expandedPanel: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
  },
  expandedSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
})
