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
  const [dateFromInput, setDateFromInput] = React.useState('') 
const [dateToInput, setDateToInput] = React.useState('') 
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

  const [dateRange, setDateRange] = React.useState<{ start: string | null; end: string | null }>({
    start: null,
    end: null,
  })
  const [dateModalOpen, setDateModalOpen] = React.useState(false)

  // calendar 
  const [leftCursor, setLeftCursor] = React.useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
  })

  const normalizeCode = (s?: string) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/^#/, '')         
    .replace(/[^a-z0-9]/g, '') 
    .trim()

  const getOrderSearchTokens = (o: HistoryOrder) => {
  const tokens = new Set<string>()

  if (o.id) {
    tokens.add(o.id)
    if (o.id.length >= 6) tokens.add(o.id.slice(0, 6))
  }

  const maybe = [
    (o as any).orderCode,
    (o as any).order_code,
    (o as any).code,
    (o as any).number,
    (o as any).orderNumber,
  ]
  for (const v of maybe) if (v) tokens.add(String(v))

  // 🔑 Κρίσιμο: κανονικοποίηση με normalizeCode
  return Array.from(tokens).map(normalizeCode)
}

const getItemSearchTokens = (it: HistoryItem) => {
  const tokens = new Set<string>()
  if (it.item_code) tokens.add(String(it.item_code))
  if (it.id) {
    tokens.add(it.id)
    if (it.id.length >= 6) tokens.add(it.id.slice(0, 6))
  }
  return Array.from(tokens).map(normalizeCode) // ίδια κανονικοποίηση με orders
}

const matchesAnyItemCodeToken = (it: HistoryItem, tokens: string[]) => {
  const toks = getItemSearchTokens(it)
  return tokens.some(qt => toks.some(t => t.includes(qt)))
}


// === Date helpers ===
// parser που πιάνει ISO, dd/MM/yyyy, dd-MM-yyyy, timestamps, Date
const parseDateFlexible = (v?: any): number => {
  if (v == null) return NaN
  if (v instanceof Date) return v.getTime()
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN
  const s = String(v).trim()
  if (!s) return NaN
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.replace(' ', 'T')
    const t = Date.parse(iso)
    return Number.isNaN(t) ? NaN : t
  }
  const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    const [, dStr, mStr, yStr, hhStr, mmStr, ssStr] = m
    const d  = parseInt(dStr, 10)
    const mo = parseInt(mStr, 10) - 1
    const y  = parseInt(yStr, 10)
    const hh = hhStr ? parseInt(hhStr, 10) : 0
    const mm = mmStr ? parseInt(mmStr, 10) : 0
    const ss = ssStr ? parseInt(ssStr, 10) : 0
    const dt = new Date(y, mo, d, hh, mm, ss).getTime()
    return Number.isNaN(dt) ? NaN : dt
  }
  const t = Date.parse(s)
  return Number.isNaN(t) ? NaN : t
}

// παίρνει σειρά πιθανών πεδίων ημερομηνίας και επιστρέφει όποιο κάνει parse
const coalesceDate = (obj: any, fields: string[]): number => {
  for (const f of fields) {
    const t = parseDateFlexible(obj?.[f])
    if (!Number.isNaN(t)) return t
  }
  return NaN
}

// έλεγχος αν ts ∈ [from, to)
const inRangeTs = (ts: number, from?: string | null, to?: string | null) => {
  if (Number.isNaN(ts)) return false
  const f = from ? Date.parse(from) : -Infinity
  const t = to   ? Date.parse(to)   : +Infinity
  return ts >= f && ts < t
}

// 'YYYY-MM-DDTHH:mm:ss' σε ΤΟΠΙΚΗ ώρα (όχι UTC)
const formatLocalISO = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${y}-${m}-${day}T${hh}:${mm}:${ss}`
}

// inclusive αρχή μέρας (local)
const toStartOfDayLocal = (t: number) => {
  const d = new Date(t); d.setHours(0,0,0,0)
  return formatLocalISO(d)
}

// exclusive τέλος (επόμενη μέρα @ 00:00 local)
const toExclusiveEndLocal = (t: number) => {
  const d = new Date(t); d.setHours(0,0,0,0); d.setDate(d.getDate() + 1)
  return formatLocalISO(d)
}



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

  const filters = React.useMemo<HistoryFilters>(() => {
  const tsFrom = parseDateFlexible(dateFromInput)
  const tsTo   = parseDateFlexible(dateToInput)

  // Χρησιμοποιούμε τα ΤΟΠΙΚΑ helpers για inclusive start & exclusive end
  const effFrom = Number.isFinite(tsFrom) ? toStartOfDayLocal(tsFrom)   : undefined
  const effTo   = Number.isFinite(tsTo)   ? toExclusiveEndLocal(tsTo)   : undefined

  // Αν το εύρος είναι ανάποδο, άσε μόνο το from
  const badRange = effFrom && effTo && new Date(effTo) <= new Date(effFrom)

  return {
    search: (search || undefined),
    category: category !== 'Όλες' ? category : null,
    status: status !== 'Όλα' ? status : null,
    customerId,
    storageStatus: storageStatus !== 'Όλες' ? storageStatus : null,
    dateFrom: effFrom,
    dateTo: badRange ? undefined : effTo,
    limit: 1000,
  } as HistoryFilters
}, [search, category, status, storageStatus, customerId, dateFromInput, dateToInput])



    // Σπάει το query σε “code-like” tokens (#, γράμματα/αριθμοί)
  const extractOrderCodeTokens = (q: string) =>
    q
      .split(/[,\s]+/)
      .map(t => t.replace(/^#/, ''))
      .map(t =>
        (t || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .replace(/[^a-z0-9]/g, '')
          .trim()
      )
      .filter(t => t.length >= 2) // μικρό threshold για prefix/contains

  const matchesAnyOrderCodeToken = (order: HistoryOrder, tokens: string[]) => {
    const toks = getOrderSearchTokens(order) // ήδη φτιάχνεις id/number/code tokens
    return tokens.some(qt => toks.some(t => t.includes(qt)))
  }
  
  const includesGreekInsensitive = (hay: string | undefined, needle: string) => {
    const n = (needle || '').trim()
    if (!hay || !n) return false
    const norm = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    return norm(hay).includes(norm(n))
  }

  const uniq = <T,>(arr: T[]) => Array.from(new Set(arr))



  // map: orderId -> order
  const ordersById = React.useMemo(() => {
    const m = new Map<string, HistoryOrder>()
    for (const o of rowsOrders) m.set(o.id, o)
    return m
  }, [rowsOrders])

  // map: orderId -> items[]
  const itemsByOrderId = React.useMemo(() => {
    const m = new Map<string, HistoryItem[]>()
    for (const it of rowsItems) {
      if (!it.orderId) continue
      if (!m.has(it.orderId)) m.set(it.orderId, [])
      m.get(it.orderId)!.push(it)
    }
    return m
  }, [rowsItems])

  // map: customerId -> { orders[], items[] }  (μέσω orders + items)
  const byCustomerId = React.useMemo(() => {
    const res = new Map<string, { orders: HistoryOrder[]; items: HistoryItem[] }>()
    const pushOrder = (cid: string, o: HistoryOrder) => {
      if (!res.has(cid)) res.set(cid, { orders: [], items: [] })
      res.get(cid)!.orders.push(o)
    }
    const pushItem = (cid: string, it: HistoryItem) => {
      if (!res.has(cid)) res.set(cid, { orders: [], items: [] })
      res.get(cid)!.items.push(it)
    }
    for (const o of rowsOrders) {
      const cid = (o as any).customerId || (o as any).customer_id
      if (cid) pushOrder(cid, o)
    }
    for (const it of rowsItems) {
      const oid = it.orderId
      const cid = oid ? ((ordersById.get(oid) as any)?.customerId || (ordersById.get(oid) as any)?.customer_id) : null
      if (cid) pushItem(cid, it)
    }
    return res
  }, [rowsOrders, rowsItems, ordersById])


  const [expandedCustomerId, setExpandedCustomerId] = React.useState<string | null>(null)
  const [expandedLoading, setExpandedLoading] = React.useState(false)
  const [expandedOrders, setExpandedOrders] = React.useState<HistoryOrder[]>([])
  const [expandedItems, setExpandedItems] = React.useState<HistoryItem[]>([])



  // year
  const yearOptions = React.useMemo(() => {
    const now = new Date().getFullYear()
    const from = now - 12
    const years: string[] = ['Όλα']
    for (let y = now; y >= from; y--) years.push(String(y))
    return years
  }, [])




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



  React.useEffect(() => {
    let cancelled = false

    async function loadCombined() {
      setLoading(true)
      try {

        const rawQ = (search || '').trim()
        const codeTokens = extractOrderCodeTokens(rawQ)
        const { search: _search, ...rest } = filters
        const apiFilters = rawQ ? rest : filters

        // 1) Φόρτωσε πάντα τους πελάτες (πλήρες σύνολο, για closure)
        const allCustomers = await listHistoryCustomers({ limit: 2000 })
        if (cancelled) return

        let orders: HistoryOrder[] = []
        let items: HistoryItem[] = []

        const itemsScoped = isItemScopedFiltersActive(filters)

        if (itemsScoped) {
          // Item-driven: Items → Orders
          const fetchedItems = await listHistoryItems({ ...apiFilters, customerId })
          if (cancelled) return
          items = fetchedItems

          const orderIds = uniq(items.map(i => i.orderId!).filter(Boolean))
          if (orderIds.length) {
            orders = await listHistoryOrders({ ...apiFilters, customerId, orderIds })
            if (cancelled) return
          } else {
            orders = []
          }
        } else {
          // Order-driven: Orders → Items
          orders = await listHistoryOrders({ ...apiFilters, customerId })
          if (cancelled) return

          // Τοπικό φιλτράρισμα κωδικών (prefix/contains)
          if (codeTokens.length > 0) {
            orders = orders.filter(o => matchesAnyOrderCodeToken(o, codeTokens))
          }

          const orderIds = orders.map(o => o.id)
          items = orderIds.length ? await listHistoryItems({ ...apiFilters, orderIds }) : []
          if (cancelled) return
        }

        // Πελάτες που προκύπτουν από τις orders
        const orderCustomerIds = new Set(
          orders.map(o => (o as any).customerId || (o as any).customer_id).filter(Boolean) as string[]
        )
        let customers = allCustomers.filter(c => orderCustomerIds.has(c.id))


        let ordersUniverse: HistoryOrder[] = orders
        if (itemsScoped && rawQ && codeTokens.length === 0) {
          try {
            // Φέρε extra orders με τα ίδια filters (ΧΩΡΙΣ να περιοριστούν από items)
            const extraOrders = await listHistoryOrders({ ...apiFilters, customerId })
            if (!cancelled) {
              const seen = new Set(orders.map(o => o.id))
              ordersUniverse = orders.concat(extraOrders.filter(o => !seen.has(o.id)))
            }
          } catch (e) {
            console.warn('extraOrders fetch failed (fallback to current orders)', e)
          }
        }

        let itemsUniverse: HistoryItem[] = items
        if (!itemsScoped && rawQ && codeTokens.length === 0) {
          try {
            // Φέρε items με τα ΦΙΛΤΡΑ (όχι περιορισμένα από orderIds)
            const extraItems = await listHistoryItems({ ...apiFilters, customerId })
            if (!cancelled) {
              const seen = new Set(items.map(i => i.id))
              itemsUniverse = items.concat(extraItems.filter(i => !seen.has(i.id)))
            }
          } catch (e) {
            console.warn('extraItems fetch failed (fallback to current items)', e)
          }
        }

        if (rawQ && codeTokens.length > 0) {
          try {
            // 1) Φέρε επιπλέον items με τα ίδια filters (ΟΧΙ περιορισμένα από orderIds)
            const extraItems = await listHistoryItems({ ...apiFilters, customerId })
            const seenItemIds = new Set(itemsUniverse.map(i => i.id))
            const mergedItems = itemsUniverse.concat(extraItems.filter(i => !seenItemIds.has(i.id)))

            // 2) Βρες τις παραγγελίες στις οποίες ανήκουν αυτά τα items και φέρε τυχόν ελλείπουσες
            const candidateOrderIds = uniq(mergedItems.map(i => i.orderId!).filter(Boolean))
            const haveOrder = new Set(ordersUniverse.map(o => o.id))
            const missingOrderIds = candidateOrderIds.filter(id => !haveOrder.has(id))

            let mergedOrders = ordersUniverse
            if (missingOrderIds.length) {
              const extraOrders = await listHistoryOrders({ ...apiFilters, customerId, orderIds: missingOrderIds })
              const seenOrderIds = new Set(mergedOrders.map(o => o.id))
              mergedOrders = mergedOrders.concat(extraOrders.filter(o => !seenOrderIds.has(o.id)))
            }

            itemsUniverse = mergedItems
            ordersUniverse = mergedOrders
          } catch (e) {
            console.warn('code-like expansion failed', e)
          }
        }

        const effFrom = (filters as any).dateFrom
        const effTo   = (filters as any).dateTo

        if (effFrom || effTo) {
          ordersUniverse = ordersUniverse.filter(o => {
            const ts = coalesceDate(o, ['orderDate', 'createdAt', 'order_date', 'date'])
            return inRangeTs(ts, effFrom, effTo)
          })

          itemsUniverse = itemsUniverse.filter(i => {
            const ts = coalesceDate(i, ['order_date', 'createdAt', 'date'])
            return inRangeTs(ts, effFrom, effTo)
          })
        }

        if (!rawQ) {
          orders = ordersUniverse
          items  = itemsUniverse

          const orderCustomerIdsAfterDate = new Set(
            orders
              .map(o => (o as any).customerId || (o as any).customer_id)
              .filter(Boolean) as string[]
          )
          customers = allCustomers.filter(c => orderCustomerIdsAfterDate.has(c.id))
        }




       // ---- Συνδυαστικό SEARCH (closure) ----
      if (rawQ) {
        if (codeTokens.length > 0) {
          // CODE-LIKE: ψάχνουμε ΚΑΙ σε orders ΚΑΙ σε items
          const hitOrderIds = new Set(
            ordersUniverse
              .filter(o => matchesAnyOrderCodeToken(o, codeTokens))
              .map(o => o.id)
          )

          const hitItemIds = new Set(
            itemsUniverse
              .filter(it => matchesAnyItemCodeToken(it, codeTokens))
              .map(it => it.id)
          )

          // Orders που ταιριάζουν άμεσα ή περιέχουν matching items
          const itemOrderIds = new Set(
            itemsUniverse
              .filter(it => hitItemIds.has(it.id) && it.orderId)
              .map(it => it.orderId as string)
          )

          const keepOrders = ordersUniverse.filter(o =>
            hitOrderIds.has(o.id) || itemOrderIds.has(o.id)
          )
          const keepOrderIds = new Set(keepOrders.map(o => o.id))

          const keepItems = itemsUniverse.filter(it =>
            hitItemIds.has(it.id) || (it.orderId && keepOrderIds.has(it.orderId))
          )

          const custOf = (o: HistoryOrder) => (o as any).customerId || (o as any).customer_id
          const keepCustomerIds = new Set(
            keepOrders.map(o => custOf(o)).filter(Boolean) as string[]
          )
          const keepCustomers = allCustomers.filter(c => keepCustomerIds.has(c.id))

          orders = keepOrders
          items  = keepItems
          customers = keepCustomers
        } else {
          // TEXT search: match σε 3 οντότητες + closure
          const hitC = new Set(
            allCustomers
              .filter(c =>
                includesGreekInsensitive(`${c.firstName || ''} ${c.lastName || ''}`, rawQ) ||
                includesGreekInsensitive(c.phone || '', rawQ)
              )
              .map(c => c.id)
          )

          const hitO = new Set(
            ordersUniverse
              .filter(o =>
                includesGreekInsensitive(o.customerName || '', rawQ) ||
                includesGreekInsensitive(o.paymentMethod || '', rawQ)
              )
              .map(o => o.id)
          )

          const hitI = new Set(
            itemsUniverse
              .filter(i =>
                includesGreekInsensitive(i.item_code || `#${i.id.slice(0,6)}`, rawQ) ||
                includesGreekInsensitive(i.category || '', rawQ) ||
                includesGreekInsensitive(i.color || '', rawQ)
              )
              .map(i => i.id)
          )

          const custOf = (o: HistoryOrder) => (o as any).customerId || (o as any).customer_id
          
          const itemOrderIds = new Set(
            itemsUniverse.filter(i => hitI.has(i.id) && i.orderId).map(i => i.orderId as string)
          )

          const keepOrders = ordersUniverse.filter(o =>
            hitO.has(o.id) ||
            (custOf(o) && hitC.has(custOf(o))) ||
            itemOrderIds.has(o.id)
          )
          const keepOrderIds = new Set(keepOrders.map(o => o.id))

          const keepItems = itemsUniverse.filter(
            i => hitI.has(i.id) || (i.orderId && keepOrderIds.has(i.orderId))
          )
          const keepCustomerIds = new Set(
            keepOrders.map(o => custOf(o)).filter(Boolean) as string[]
          )
          for (const id of hitC) keepCustomerIds.add(id)

          const keepCustomers = allCustomers.filter(c => keepCustomerIds.has(c.id))
          orders = keepOrders
          items = keepItems
          customers = keepCustomers
        }
      }




        // Περιορισμός σε συγκεκριμένο πελάτη (ΤΕΛΕΥΤΑΙΟ)
        if (customerId) {
          customers = customers.filter(c => c.id === customerId)
          const allowedOrderIds = new Set(
            orders
              .filter(o => ((o as any).customerId || (o as any).customer_id) === customerId)
              .map(o => o.id)
          )
          orders = orders.filter(o => allowedOrderIds.has(o.id))
          items = items.filter(i => i.orderId && allowedOrderIds.has(i.orderId))
        }

        if (!cancelled) {
          setRowsCustomers(customers)
          setRowsOrders(orders)
          setRowsItems(items)
        }
      } catch (e) {
        console.error('loadCombined failed', e)
        if (!cancelled) {
          setRowsCustomers([])
          setRowsOrders([])
          setRowsItems([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadCombined()
    return () => { cancelled = true }
    }, [filters, customerId, search])

  React.useEffect(() => {
    if (!expandedCustomerId) return
    setExpandedLoading(true)
    try {
      const custOrders = rowsOrders.filter(
        o => ((o as any).customerId || (o as any).customer_id) === expandedCustomerId
      )
      const orderIdSet = new Set(custOrders.map(o => o.id))
      const custItems = rowsItems.filter(i => i.orderId && orderIdSet.has(i.orderId))

      setExpandedOrders(custOrders)
      setExpandedItems(custItems)
    } catch (e) {
      console.error('expand failed', e)
      setExpandedOrders([])
      setExpandedItems([])
    } finally {
      setExpandedLoading(false)
    }
  }, [expandedCustomerId, rowsOrders, rowsItems])


  React.useEffect(() => {
    const opts = rowsCustomers.map(c => {
      const name = `${(c.firstName || '').trim()} ${(c.lastName || '').trim()}`.trim() || 'Χωρίς όνομα'
      const label = c.phone ? `${name} • ${c.phone}` : name
      return { id: c.id, label }
    })
    setCustomerOpts(opts)
  }, [rowsCustomers])





  
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

        {/* Row: Από Ημερομηνία / Μέχρι Ημερομηνία */}
        <View style={styles.row2}>
          <View style={[styles.inputWrap, styles.flex1]}>
            <Text style={styles.labelRowTitle}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} /> {'  '}
              Από Ημερομηνία
            </Text>
            <View style={styles.dropdownWrap}>
              <TextInput
                value={dateFromInput}
                onChangeText={setDateFromInput}
                placeholder=" dd/mm/yyyy"
                placeholderTextColor={colors.muted}
                style={[styles.filledInputText, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                returnKeyType="done"
              />
            </View>
          </View>

          <View style={[styles.inputWrap, styles.flex1]}>
            <Text style={styles.labelRowTitle}>
              <Ionicons name="calendar-outline" size={16} color={colors.primary} /> {'  '}
              Μέχρι Ημερομηνία
            </Text>
            <View style={styles.dropdownWrap}>
              <TextInput
                value={dateToInput}
                onChangeText={setDateToInput}
                placeholder="dd/mm/yyyy"
                placeholderTextColor={colors.muted}
                style={[styles.filledInputText, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                returnKeyType="done"
              />
            </View>
          </View>
        </View>

        {/* Optional μικρό hint/validation */}
        {(() => {
          const f = parseDateFlexible(dateFromInput)
          const t = parseDateFlexible(dateToInput)
          const bad = (dateFromInput && Number.isNaN(f)) || (dateToInput && Number.isNaN(t))
          if (!bad) return null
          return (
            <Text style={{ color: '#B91C1C', marginTop: 6,fontSize: 12 }}>
              Δώσε ημερομηνίες μορφής dd/MM/yyyy (π.χ. 02/03/2024)
            </Text>
          )
        })()}

        

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
                          {(() => {
                            const summary = byCustomerId.get(item.id)
                            const ordersCount = summary?.orders.length ?? 0
                            const itemsCount  = summary?.items.length ?? 0
                            return (
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <View style={[styles.pill, { marginRight: 6 }]}>
                                  <Text style={styles.pillText}>Παραγγελίες {ordersCount}</Text>
                                </View>
                                <View style={[styles.pill, { marginRight: 10 }]}>
                                  <Text style={styles.pillText}>Τεμάχια {itemsCount}</Text>
                                </View>
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
                            )
                          })()}

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
