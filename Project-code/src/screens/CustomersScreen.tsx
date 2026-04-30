import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useFocusEffect } from '@react-navigation/native'
import * as Print from 'expo-print'
import { router } from 'expo-router'
import * as Sharing from 'expo-sharing'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Circle, Svg } from 'react-native-svg'
import AppHeader from '../components/AppHeader'
import ConfirmModal from '../components/ConfirmModal'
import Page from '../components/Page'
import { logExportHistoryPDF, logViewCustomerHistory } from '../services/activitylog'
import { createCustomer, deleteCustomer, observeCustomers, updateCustomer } from '../services/customer'
import { listOrderItemsByCustomer, normId, updateOrderItem } from '../services/orderItems'
import { deleteOrderCascade, observeOrdersByCustomer, updateOrder } from '../services/orders'
import { useAuth } from '../state/AuthProvider'
import { usePreview } from '../state/PreviewProvider'
import { colors } from '../theme/colors'


//  Helpers
const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
const isAFM = (q: string) => /^\d{9}$/.test(q)
const isPhone = (q: string) => /^\d{7,}$/.test(q)


// Parse/Compose helpers : notes (desc | Receipt: X | €/m²: Y)
function parseNotes(notes: string | null | undefined) {
  const raw = (notes || '').trim()
  let desc = raw
  let receiptNo = ''
  let pricePerSqm = ''

  // Receipt
  const recMatch = raw.match(/Receipt:\s*([^\|]+)\b/i)
  if (recMatch) {
    receiptNo = recMatch[1].trim()
    desc = desc.replace(recMatch[0], '').replace(/\s*\|\s*\|\s*/g, ' | ').trim()
  }

  //  €/m²
  const priceMatch = raw.match(/€\/m²:\s*([^\|]+)\b/i)
  if (priceMatch) {
    pricePerSqm = priceMatch[1].trim()
    desc = desc.replace(priceMatch[0], '').replace(/\s*\|\\s*\|\s*/g, ' | ').trim()
  }

  // clean
  desc = desc.replace(/^\|\s*|\s*\|$/g, '').trim()
 
  desc = desc.replace(/\|\s*\|/g, '|').trim()
  
  desc = desc.replace(/\s*\|\s*$/,'').trim()

  return { desc, receiptNo, pricePerSqm }
}

function composeNotes(desc: string, receiptNo: string, pricePerSqm: string) {
  const parts: string[] = []
  if (desc?.trim()) parts.push(desc.trim())
  if (receiptNo?.trim()) parts.push(`Receipt: ${receiptNo.trim()}`)
  if (pricePerSqm?.trim()) parts.push(`€/m²: ${pricePerSqm.trim()}`)
  return parts.join(' | ')
}

function hasDebtNote(notes?: string | null) {
  const { desc } = parseNotes(notes)
  return /\bχρέος\b/i.test(desc || '')
}


/*  Helpers (ημερομηνίες ανθεκτικές σε dd/MM/yyyy, YYYY-MM-DD, ms) */
function parseDateFlexible(input?: string | number | null) {
  if (input == null) return null

  // numeric (ms) ή numeric string
  if (typeof input === 'number') {
    const d = new Date(input)
    return isNaN(d.getTime()) ? null : d
  }
  const s = String(input).trim()

  if (/^\d+$/.test(s)) {
    const d = new Date(Number(s))
    return isNaN(d.getTime()) ? null : d
  }

  // ISO date-only
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00`)
    return isNaN(d.getTime()) ? null : d
  }

  // Ελληνικό dd/MM/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/').map(Number)
    const d = new Date(yyyy, mm - 1, dd)
    return isNaN(d.getTime()) ? null : d
  }

  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

const fmtDate = (v: string | number | null | undefined) => {
  const d = parseDateFlexible(v as any)
  return d ? d.toLocaleString('el-GR') : '—'
}

function yearOf(v?: string | number | null) {
  const d = parseDateFlexible(v)
  return d ? d.getFullYear() : null
}


const fmtMoney = (n: number | string | null | undefined) => {
  const num = typeof n === 'string' ? Number(n) : (n ?? 0)
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(num)
}

type DBCustomer = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  address: string | null
  city?: string
  afm: string | null
  notes: string | null
  createdAt: number
  lastModifiedAt: number
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <Text>{text}</Text>
  const nq = normalize(query)
  const nt = normalize(text)
  const idx = nt.indexOf(nq)
  if (idx === -1) return <Text>{text}</Text>
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + query.length)
  const after = text.slice(idx + query.length)
  return (
    <Text>
      {before}
      <Text style={{ fontWeight: '800' }}>{match}</Text>
      {after}
    </Text>
  )
}

/* helper: FieldRow */
function FieldRow({
  label,
  value,
  editable,
  onChangeText,
  keyboardType,
  onBlur,
  error,         
  errorMessage, 
  maxLength,
  inputMode,  
}: {
  label: string
  value: string
  editable: boolean
  onChangeText?: (v: string) => void
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'decimal-pad'
  onBlur?: () => void
  error?: boolean          
  errorMessage?: string    
  maxLength?: number 
  inputMode?: 'numeric' | 'text'
}) {
  const [isFocused, setIsFocused] = React.useState(false)
  const inputRef = React.useRef<TextInput | null>(null)

  return (
    <View style={{ marginBottom: 6 }}>
      <Text
        style={{
          fontSize: 10,
          color: '#9CA3AF',
          fontWeight: '600',
          marginBottom: 2,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>

      {editable ? (
        <>
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            keyboardType={keyboardType || 'default'}
            underlineColorAndroid="transparent"
            placeholderTextColor="#9CA3AF"
            onFocus={() => setIsFocused(true)}
            onBlur={() => {
              setIsFocused(false)
              onBlur?.()
            }}
            maxLength={maxLength}
            {...(Platform.OS === 'web' ? { inputMode } : {})}
            style={[
              {
                backgroundColor: '#FFFFFF',
                borderWidth: 1.5,
                borderColor: error ? '#DC2626' : (isFocused ? '#3B82F6' : '#E5E7EB'),
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 6,
                fontSize: 14,
                color: '#111827',
                height: 34,
                ...(Platform.select({
                  ios: {
                    shadowColor: error ? '#DC2626' : '#3B82F6',
                    shadowOpacity: isFocused ? 0.25 : 0.08,
                    shadowRadius: isFocused ? 6 : 3,
                    shadowOffset: { width: 0, height: isFocused ? 3 : 1 },
                  },
                  android: {
                    elevation: isFocused ? 5 : 2,
                  },
                  web: {
                    transition: 'all 0.15s ease-in-out',
                    boxShadow: isFocused
                      ? '0 0 6px rgba(59,130,246,0.4)'
                      : '0 1px 3px rgba(0,0,0,0.06)',
                  } as any,
                }) as object),
              },
              styles.noFocusRingWeb,
            ]}
          />
          {!!error && !!errorMessage && (
            <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 3, marginLeft: 4 }}>
              {errorMessage}
            </Text>
          )}
        </>
      ) : (
        <View
          style={{
            borderWidth: 1.5,
            borderColor: '#E5E7EB',
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 6,
            backgroundColor: '#FFFFFF',
          }}
        >
          <Text style={{ fontSize: 14, color: '#111827' }}>
            {(value || '').trim() || '—'}
          </Text>
        </View>
      )}
    </View>
  )
}


/* helper: Badge  */
function Badge({ label }: { label: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  )
}

/*  key/value line  */
function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  )
}

/*  OrderCard  */
function OrderCard({
  code, date, total, deposit, paymentMethod, notes, itemsCount,
  expanded, onToggle, onViewItems, onEdit, onClose, status, onChangeStatus, hasDebt, onDeletePress, receiptNumber,
}: {
  code: string
  date: string
  total: string
  deposit: string
  paymentMethod: string
  notes: string | null
  itemsCount: number | null
  expanded: boolean
  onToggle: () => void
  onViewItems: () => void
  onEdit: () => void
  onClose: () => void
  status: string
  onChangeStatus: (v: string) => void
  hasDebt?: boolean
  onDeletePress: () => void
   receiptNumber?: string | null
  
}) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onToggle} style={styles.orderCard}>
      {/* Header γραμμή */}
      <View style={styles.orderHeaderRow}>
        <View style={styles.pill}>
          <Text style={styles.pillText}>{code}</Text>
        </View>
        <Text style={styles.orderDateText}>{date}</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.orderTotalText}>{total}</Text>
         <Pressable
          onPress={(e: any) => {
            if (Platform.OS === 'web' && e?.stopPropagation) e.stopPropagation()
            onDeletePress()
          }}
          style={{ paddingHorizontal: 6, marginLeft: 6 }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={18} color="#9CA3AF" />
        </Pressable>
      </View>

      {/* badges */}
      <View style={styles.badgeRow}>
        <Badge label={`Πληρωμή: ${paymentMethod}`} />
        {deposit !== '—' && <Badge label={`Προκαταβολή: ${deposit}`} />}
        {typeof itemsCount === 'number' && <Badge label={`Τεμάχια: ${itemsCount}`} />}
      </View>

      {/* expanded details */}
      {expanded && (
        <View style={styles.orderDetailsBox}>
          <KV label="Ημερομηνία παραγγελίας" value={date} />
          <KV label="Αρ. Δελτίου Παραλαβής" value={(receiptNumber || '').trim() || '—'} />
          <KV label="Αριθμός τεμαχίων" value={typeof itemsCount === 'number' ? String(itemsCount) : '—'} />
          <KV label="Συνολικό κόστος" value={total} />
          <KV label="Προκαταβολή" value={deposit} />
          <KV label="Τρόπος πληρωμής" value={paymentMethod} />

          {notes ? <View style={{ height: 6 }} /> : null}
          {notes ? <Text style={styles.orderNotes}>{notes}</Text> : null}

          {/* action bar */}
          <View style={styles.orderActionsRow}>
            <View style={{ flex: 1 }} />

             {/* dropdown */}
            <View style={{ marginRight: 8 }}>
              <SimpleDropdown
                value={status}
                placeholder="Κατάσταση"
                options={ORDER_STATUS_OPTIONS}
                onChange={onChangeStatus}
                width={160}
              />
            </View>

            <TouchableOpacity onPress={onEdit} style={[styles.actionBtn, styles.actionBtnPrimary]}>
              <Text style={styles.actionBtnPrimaryText}>Επεξεργασία</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={[styles.actionBtn, styles.actionBtnDanger]}>
              <Text style={styles.actionBtnDangerText}>Κλείσιμο</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  )
}

// dropdown values
const COLOR_OPTIONS = [
  'Μπλε', 'Κόκκινο', 'Πράσινο', 'Κίτρινο', 'Μαύρο', 'Λευκό', 'Γκρι', 'Μπεζ',
  'Ροζ', 'Καφέ', 'Μωβ'
]
const CATEGORY_OPTIONS = [
  'Πάπλωμα', 'Κουβέρτα', 'Φλοκάτη', 'Κουρτίνα', 'Διαδρομάκι', 'Χαλί'
]
const STATUS = [
  'Άπλυτο', 'Πλυμένο'
]
const STORAGE_STATUS = [
  'Φύλλαξη', 'Επιστροφή'
]

const ORDER_STATUS_OPTIONS = ['Νέα', 'Σε επεξεργασία', 'Έτοιμη', 'Παραδόθηκε']


// dropdown
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

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.toLowerCase().includes(q))
  }, [query, options])

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.dropdownWrap, { width }]}>
        <Text style={[styles.filledInputText, { paddingRight: 28, opacity: value ? 1 : 0.6 }]} numberOfLines={1}>
          {value?.trim() || (placeholder || 'Επιλέξτε…')}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#9CA3AF" style={styles.dropdownIcon} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.ddBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.ddCard} onPress={() => {}}>
            <View style={styles.ddSearchBox}>
              <Ionicons name="search-outline" size={18} color="#6B7280" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Αναζήτηση…"
                placeholderTextColor="#9CA3AF"
                style={[styles.ddSearchInput, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
              />
              {query ? (
                <Pressable onPress={() => setQuery('')}>
                  <Ionicons name="close" size={16} color="#9CA3AF" />
                </Pressable>
              ) : null}
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {filtered.length === 0 ? (
                <View style={styles.ddEmpty}>
                  <Text style={styles.ddEmptyText}>Δεν βρέθηκαν επιλογές</Text>
                </View>
              ) : (
                filtered.map((opt, idx) => (
                  <Pressable
                    key={`${opt}-${idx}`}
                    onPress={() => { onChange(opt); setOpen(false) }}
                    style={[styles.ddOption, idx % 2 === 1 && styles.ddOptionAlt]}
                  >
                    <Text
                      style={[
                        styles.ddOptionText,
                        value?.trim().toLowerCase() === opt.toLowerCase() && styles.ddOptionTextSelected,
                      ]}
                    >
                      {opt}
                    </Text>
                    {value?.trim().toLowerCase() === opt.toLowerCase() && (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    )}
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

// === Helpers for history ===
export const CATEGORY_COLORS: Record<string, string> = {
  'Μόκετα': '#2563EB',
  'Διαδρομάκι': '#EF4444',
  'Κουβέρτα': '#10B981',
  'Πάπλωμα': '#F59E0B',
  'Φλοκάτη': '#7C3AED',
  'Χαλί': '#111827',
};

export const CATEGORY_LABELS = new Map<string, string>([
  ['μοκετα','Μόκετα'], ['μοκέτα','Μόκετα'],
  ['διαδρομακι','Διαδρομάκι'], ['διαδρομάκι','Διαδρομάκι'],
  ['κουβερτα','Κουβέρτα'], ['κουβέρτα','Κουβέρτα'],
  ['παπλωμα','Πάπλωμα'], ['πάπλωμα','Πάπλωμα'],
  ['φλοκατη','Φλοκάτη'], ['φλοκάτη','Φλοκάτη'],
  ['χαλι','Χαλί'], ['χαλί','Χαλί'],
]);

const COLOR_SWATCH: Record<string, string> = {
  'Μπλε': '#2563EB',
  'Κόκκινο': '#EF4444',
  'Πράσινο': '#10B981',
  'Κίτρινο': '#F59E0B',
  'Μαύρο': '#111827',
  'Λευκό': '#E5E7EB',
  'Γκρι': '#6B7280',
  'Μπεζ': '#D6CCC2',
  'Ροζ': '#F472B6',
  'Καφέ': '#92400E',
  'Μωβ': '#7C3AED',
};

const getColorHex = (name?: string) => {
  const key = (name || '—').trim();
  return COLOR_SWATCH[key] || '#9CA3AF';
};

export const normCat = (s: string) => {
  const k = (s || '').trim().toLowerCase();
  return CATEGORY_LABELS.get(k) || s || '—';
};

export const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

export const fmtPercent = (num: number) => `${(num * 100).toFixed(1)}%`;

function categoriesLabelForItems(items: any[]) {
  const cats = Array.from(
    new Set(
      items
        .map(x => normCat(x.category || '').trim())
        .filter(Boolean)
    )
  )
  return cats.length ? cats.join(', ') : '—'
}

function DonutChart({
  data, // [{label, value, color}]
  size = 180,
  strokeWidth = 22,
}: {
  data: { label: string; value: number; color: string }[]
  size?: number
  strokeWidth?: number
}) {
  const total = sum(data.map(d => d.value))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  // ξεκινάμε από -90° ώστε το πρώτο segment να ξεκινάει "πάνω"
  let accumulated = 0

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size/2}
          cy={size/2}
          r={radius}
          stroke="#E5E7EB"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {data.map((d, idx) => {
          const fraction = total === 0 ? 0 : d.value / total
          const dash = circumference * fraction
          const gap  = circumference - dash
          const rotation = (accumulated / total) * 360 - 90
          accumulated += d.value
          return (
             <Circle
              key={idx}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={d.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${dash} ${gap}`}
              strokeLinecap="butt"
              fill="none"
              transform={`rotate(${rotation} ${size / 2} ${size / 2})`}
            />
          )
        })}
      </Svg>
    </View>
  )
}

/* for history */
function YearRow({ year, subtitle, onPress }: { year: number; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={styles.yearRowCard}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={styles.yearBadge}>
          <Text style={styles.yearBadgeText}>{String(year).slice(-2)}</Text>
        </View>
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={styles.yearRowTitle}>{year}</Text>
          <Text style={styles.yearRowSub}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#6B7280" />
      </View>
    </TouchableOpacity>
  )
}

const normalizeAddrPairs = (v: string) => {
  const pairs = v
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(seg => {
      const [addr, ...rest] = seg.split(',').map(x => x.trim()).filter(Boolean)
      const city = (rest.join(', ') || '').trim()
      return city ? `${addr}, ${city}` : addr
    })
  return pairs.join(' | ')
}

// πάρε την ΠΟΛΗ από το πρώτο ζεύγος ("Οδός, Πόλη | ...")
const extractFirstCity = (v: string): string => {
  const first = (v || '').split('|')[0] || ''
  const parts = first.split(',').map(s => s.trim()).filter(Boolean)
  return parts.length >= 2 ? parts.slice(1).join(', ') : ''
}


export default function CustomersScreen() {

  const { user } = useAuth();                         
  const userId = (user?.id ? String(user.id) : 'system');

  const { setCustomersPreview } = usePreview()


  // DB state (reactive)
  const [customers, setCustomers] = useState<DBCustomer[]>([])
  const [loading, setLoading] = useState(true)

  // Search
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  // Create form state
  const [openForm, setOpenForm] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [addresses, setAddresses] = useState<string[]>([''])
  const [phones, setPhones] = useState<string[]>([''])
  const [afm, setAfm] = useState('')
  const [pricePerSqm, setPricePerSqm] = useState('')
  const [priceByCustomer, setPriceByCustomer] = useState<Record<string, string>>({})
  const [description, setDescription] = useState('') 

  // Delete confirm modal
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const pendingCustomer = useMemo(
    () => customers.find(c => c.id === pendingDeleteId) || null,
    [pendingDeleteId, customers]
  )
  const pendingName = pendingCustomer
    ? `${pendingCustomer.firstName || ''} ${pendingCustomer.lastName || ''}`.trim() || 'πελάτη'
    : 'πελάτη'

  //  Modal cuustomer card
  const [selectedCustomer, setSelectedCustomer] = useState<DBCustomer | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'orders' | 'history'>('details')
  const [editMode, setEditMode] = useState(false)
  const [orders, setOrders] = React.useState<any[]>([])
  const [ordersLoading, setOrdersLoading] = React.useState(false)
  const [expandedOrderId, setExpandedOrderId] = React.useState<string | null>(null)
  const [editErr, setEditErr] = useState({
    firstName: false,
    lastName:  false,
    phone:     false,
    pairs:     false, 
    afm:       false, 
  })
  const [edit, setEdit] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    address: '',
    city: '',     
    afm: '',
    notesBase: '',     
    receiptNo: '',
    pricePerSqm: '',
  })

  const [errors, setErrors] = useState({
    firstName: false,
    lastName: false,
    addresses: false,
    phones: false,
  })

  // ADD: Items modal & edit state 
const [itemsOpen, setItemsOpen] = useState(false)
const [itemsLoading, setItemsLoading] = useState(false)
const [items, setItems] = useState<any[]>([])

// History
const [histLoading, setHistLoading] = useState(false)
const [histOrders, setHistOrders] = useState<any[]>([])   
const [histItems, setHistItems]   = useState<any[]>([])  
const [filtersOpen, setFiltersOpen] = useState(false)    


const [yearOpen, setYearOpen] = useState<number | null>(null)
const [showYearReport, setShowYearReport] = useState(false)

const [afmError, setAfmError] = useState('')
const [afmEditError, setAfmEditError] = useState('')

const [confirmDeleteOrder, setConfirmDeleteOrder] = useState<{ orderId: string; code: string } | null>(null)

const handleAfmChange = (text: string) => {
  setAfm(text)
  setAfmError('')  
}

// Filters state 
type HistoryFilters = {
  category: string | null
  color: string | null
  yearFrom: number | null
  yearTo: number | null
}

const [filtersDraft, setFiltersDraft] = useState<HistoryFilters>({
  category: null,
  color: null,
  yearFrom: null,
  yearTo: null,
})


const [appliedFilters, setAppliedFilters] = useState<HistoryFilters | null>(null)
const [modalResultsFilters, setModalResultsFilters] = useState<HistoryFilters | null>(null)


const hasActiveFilters = !!appliedFilters &&
  (!!appliedFilters.category || !!appliedFilters.color || !!appliedFilters.yearFrom || !!appliedFilters.yearTo)


const fullName = React.useMemo(() => {
    if (!selectedCustomer) return '—'
    const first = (selectedCustomer.firstName || '').trim()
    const last  = (selectedCustomer.lastName  || '').trim()
    const name  = `${first} ${last}`.trim()
    return name || '—'
  }, [selectedCustomer])

const ordersByYear = React.useMemo(() => {
  const map = new Map<number, any[]>();

  for (const o of histOrders) {
    const y = yearOf(o.orderDate || o.createdAt);
    if (y == null) continue;
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(o);
  }

  // ταξινόμηση παραγγελιών ανά έτος (πιο πρόσφατες πρώτες)
  for (const [, arr] of map.entries()) {
    arr.sort(
      (a, b) =>
        (parseDateFlexible(b.orderDate || b.createdAt)?.getTime() ?? 0) -
        (parseDateFlexible(a.orderDate || a.createdAt)?.getTime() ?? 0)
    );
  }

  // επιστροφή φθίνουσα κατά έτος
  return new Map([...map.entries()].sort((a, b) => b[0] - a[0]));
}, [histOrders]);

const years = React.useMemo(() => [...ordersByYear.keys()], [ordersByYear]);


const itemsByYear = React.useMemo(() => {
  const map = new Map<number, any[]>();

  for (const it of histItems) {
    const y = yearOf(it.order_date || it.created_at);
    if (y == null) continue;
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(it);
  }

  // σταθερή σειρά ανά created_at
  for (const [, arr] of map.entries()) {
    arr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }

  return map;
}, [histItems]);

const yearsToShow = React.useMemo(() => {
  const all = [...ordersByYear.keys()] 
  if (!hasActiveFilters) return all

  return all.filter((y) => {
    if (appliedFilters?.yearFrom != null && y < appliedFilters.yearFrom) return false
    if (appliedFilters?.yearTo   != null && y > appliedFilters.yearTo)   return false

    const its = itemsByYear.get(y) || []
    const okCategory = appliedFilters?.category ? its.some(it => normCat(it.category) === appliedFilters.category) : true
    const okColor    = appliedFilters?.color    ? its.some(it => (it.color || '—').trim() === appliedFilters.color) : true
    return okCategory && okColor
  })
}, [ordersByYear, itemsByYear, appliedFilters, hasActiveFilters])

// helper: year (item)
const yearOfItem = (it: any) => yearOf(it.order_date || it.created_at)

// filtered items
const modalPreviewItems = React.useMemo(() => {
  if (!modalResultsFilters) return [] 

  let arr = histItems
  const f = modalResultsFilters

  if (f.yearFrom != null) {
    arr = arr.filter(it => {
      const y = yearOfItem(it)
      return y == null ? false : y >= f.yearFrom!
    })
  }
  if (f.yearTo != null) {
    arr = arr.filter(it => {
      const y = yearOfItem(it)
      return y == null ? false : y <= f.yearTo!
    })
  }
  if (f.category) {
    arr = arr.filter(it => normCat(it.category) === f.category)
  }
  if (f.color) {
    arr = arr.filter(it => (it.color || '—').trim() === f.color)
  }

  return arr
}, [histItems, modalResultsFilters])

const modalPreviewCount  = modalPreviewItems.length
const modalPreviewAmount = sum(modalPreviewItems.map(it => Number(it.price || 0)))
const modalPreviewYears  = new Set(modalPreviewItems.map(yearOfItem).filter(Boolean)).size


//  items group by order
const itemsByOrderAll = React.useMemo(() => {
  return groupItemsByOrder(histItems); 
}, [histItems]);

// helper: group items by order once
function groupItemsByOrder(items: any[]) {
  const map = new Map<string, any[]>()
  for (const it of items) {
    const raw = it.order_id ?? it.orderId ?? it.orderID ?? it.order ?? ''
    const key = normId(raw)            // normalize
    if (!key) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(it)
  }
  return map
}

async function allItemsWashedForOrder(customerId: string, orderId: string) {
  try {
    const rows: any[] = await listOrderItemsByCustomer(customerId, { limit: 5000 })
    const oid = normId(orderId)

    const items = rows.map((r: any) => {
      const raw = r?._raw ?? {}
      const rid = normId(r.order_id ?? r.orderId ?? raw.order_id ?? raw.orderId ?? '')
      const status = (r.status ?? raw.status ?? '').toString().trim()
      return { rid, status }
    }).filter(it => it.rid === oid)

    if (items.length === 0) return true
    return items.every(it => it.status.toLowerCase() === 'πλυμένο')
  } catch (e) {
    console.error('allItemsWashedForOrder failed', e)
    return true
  }
}




React.useEffect(() => {
  if (!detailsOpen || !selectedCustomer) return;

  let cancelled = false;

  const sub = observeOrdersByCustomer(selectedCustomer.id, { limit: 1000 })
    .subscribe(async (rows: any[]) => {
      if (cancelled) return;

      // 1) map orders
      const ordersMapped = rows.map((r: any) => ({
        id: r.id,
        customerId: selectedCustomer.id,
        paymentMethod: r.paymentMethod ?? '',
        deposit: r.deposit ?? null,
        totalAmount: r.totalAmount ?? 0,
        notes: r.notes ?? null,
        orderDate: r.orderDate,
        createdAt: r.createdAt,
        lastModifiedAt: r.lastModifiedAt,
        status: r.orderStatus ?? 'Νέα',
        hasDebt: r.hasDebt ?? false,
        receiptNumber: r.receiptNumber ?? r?._raw?.receiptNumber ?? r?._raw?.receipt_number ?? null,
      }));

      //  fetch ALL items for this customer (once)
      const itemsRows: any[] = await listOrderItemsByCustomer(selectedCustomer.id, { limit: 5000 });

      const itemsMapped = itemsRows.map((r: any) => {
        const raw = r?._raw ?? {}
        const orderId =
          r.order_id ?? r.orderId ?? raw.order_id ?? raw.orderId ?? ''
           const receiptNumber =
            r.receiptNumber    ??
            raw.receiptNumber  ??
            raw.receipt_number ??
            null

        return {
          id: r.id,
          order_id: normId(orderId),                
          item_code: r.item_code ?? raw.item_code ?? '',
          category: r.category ?? raw.category ?? '',
          color: r.color ?? raw.color ?? '',
          price: (r.price ?? raw.price) ?? 0,
          status: r.status ?? raw.status ?? '',
          storage_status: r.storage_status ?? raw.storage_status ?? '',
          order_date: r.order_date ?? raw.order_date ?? '',
          created_at: r.created_at ?? raw.created_at,
          receiptNumber,
        }
      })

      // 3) enrich orders with itemsCount
      const byOrder = groupItemsByOrder(itemsMapped);
      const ordersWithCounts = ordersMapped.map(o => {
      const key = String(o.id).trim();
      return {
        ...o,
       itemsCount: byOrder.get(normId(o.id))?.length ?? 0,  // normalize
      };
    });

      // 4) set state for both tabs
      setOrders(ordersWithCounts); // Orders tab
      setHistOrders(ordersMapped); // History tab (year/group)
      setHistItems(itemsMapped);   // History tab (category/color pie)

      // debug
      console.log('[DEBUG] orders:', ordersWithCounts.length, 'items:', itemsMapped.length);
    });

  return () => { cancelled = true; sub?.unsubscribe?.(); };
}, [detailsOpen, selectedCustomer]);


function totalsForYear(y: number) {
  const ords = ordersByYear.get(y) || [];
  const totalAmount = sum(ords.map(o => Number(o.totalAmount || 0)));
  const count = ords.length;
  return { count, totalAmount };
}

function categoryBreakdownForYear(y: number) {
  const items = itemsByYear.get(y) || [];
  const counter = new Map<string, number>();
  for (const it of items) {
    const label = normCat(it.category || '');
    counter.set(label, (counter.get(label) || 0) + 1);
  }
  const entries = [...counter.entries()].sort((a, b) => b[1] - a[1]);
  const total = sum(entries.map(e => e[1]));
  return { total, entries };
}

function colorBreakdownForYear(y: number) {
  const items = itemsByYear.get(y) || [];
  const counter = new Map<string, number>();
  for (const it of items) {
    const c = (it.color || '—').trim() || '—';
    counter.set(c, (counter.get(c) || 0) + 1);
  }
  const entries = [...counter.entries()].sort((a, b) => b[1] - a[1]);
  const total = sum(entries.map(e => e[1]));
  return { total, entries };
}

const computeYearData = (y: number, f?: HistoryFilters | null) => {
  const allOrders = ordersByYear.get(y) || []
  const allItems  = itemsByYear.get(y) || []

  if (!f || (!f.category && !f.color && !f.yearFrom && !f.yearTo)) {
    const totals = totalsForYear(y)
    const cat = categoryBreakdownForYear(y)
    const color = colorBreakdownForYear(y)
    const ordersOfYear = allOrders
    const itemsOfYear = allItems
    return { totals, cat, color, ordersOfYear, itemsOfYear }
  }

  // filterd items
  const itemsFiltered = allItems.filter(it => {
    const byCat   = f.category ? normCat(it.category) === f.category : true
    const byColor = f.color ? (it.color || '—').trim() === f.color : true
    return byCat && byColor
  })

  // orders of these items 
  const orderIdsKeep = new Set(itemsFiltered.map(it => normId(it.order_id)))
  const ordersFiltered = (f.category || f.color)
    ? allOrders.filter(o => orderIdsKeep.has(normId(o.id)))
    : allOrders

  const totals = {
    count: ordersFiltered.length,
    totalAmount: sum(ordersFiltered.map(o => Number(o.totalAmount || 0))),
  }

  const catCounter = new Map<string, number>()
  for (const it of itemsFiltered) {
    const label = normCat(it.category || '')
    catCounter.set(label, (catCounter.get(label) || 0) + 1)
  }
  const catEntries = [...catCounter.entries()].sort((a, b) => b[1] - a[1])
  const catTotal = sum(catEntries.map(e => e[1]))
  const cat = { total: catTotal, entries: catEntries }

  const colorCounter = new Map<string, number>()
  for (const it of itemsFiltered) {
    const c = (it.color || '—').trim() || '—'
    colorCounter.set(c, (colorCounter.get(c) || 0) + 1)
  }
  const colorEntries = [...colorCounter.entries()].sort((a, b) => b[1] - a[1])
  const colorTotal = sum(colorEntries.map(e => e[1]))
  const color = { total: colorTotal, entries: colorEntries }

  return { totals, cat, color, ordersOfYear: ordersFiltered, itemsOfYear: itemsFiltered }
}

function itemsByOrderForYear(y: number) {
  const items = itemsByYear.get(y) || []
  const map = new Map<string, any[]>()
  for (const it of items) {
    const key = normId(it.order_id ?? it.orderId ?? it.orderID ?? it.order ?? '')
    if (!key) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(it)
  }
  return map
}

function renderYearDetail(year: number) {
  const { count, totalAmount } = totalsForYear(year)
  const cat = categoryBreakdownForYear(year)
  const byOrder = itemsByOrderForYear(year)
  const color = colorBreakdownForYear(year)

  const donutData = cat.entries.map(([label, value]) => ({
    label,
    value,
    color: CATEGORY_COLORS[label] || '#9CA3AF',
  }))

  return (
    <View key={year} style={styles.yearBlock}>
      <View style={styles.yearHeaderRow}>
        <Text style={styles.yearTitle}>{year}</Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Συνολικές παραγγελίες</Text>
          <Text style={styles.summaryValue}>{count}</Text>
        </View>
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Συνολικό ποσό</Text>
          <Text style={styles.summaryValue}>{fmtMoney(totalAmount)}</Text>
        </View>
       
      </View>

      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>Κατηγορίες</Text>
        {cat.total === 0 ? (
          <Text style={styles.muted}>Δεν υπάρχουν τεμάχια για το {year}.</Text>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <DonutChart data={donutData} />
            <View style={styles.legendWrap}>
              {donutData.map((d, idx) => {
                const pct = cat.total ? d.value / cat.total : 0
                return (
                  <View key={idx} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                    <Text style={styles.legendText}>
                      {d.label} — {d.value} ({fmtPercent(pct)})
                    </Text>
                  </View>
                )
              })}
            </View>
          </View>
        )}
      </View>

      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>Ανάλυση κατηγοριών</Text>
        {cat.entries.length === 0 ? (
          <Text style={styles.muted}>—</Text>
        ) : (
          cat.entries.map(([label, cnt], i) => (
            <View key={`${label}-${i}`} style={styles.kvRow}>
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: CATEGORY_COLORS[label] || '#9CA3AF' }]} />
                <Text style={styles.kvLabel}>{label}</Text>
              </View>
              <Text style={styles.kvValue}>
                {cnt} {cat.total ? `(${fmtPercent(cnt / cat.total)})` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>Ανάλυση χρωμάτων</Text>
        {color.entries.length === 0 ? (
          <Text style={styles.muted}>—</Text>
        ) : (
          color.entries.map(([c, cnt], i) => (
            <View key={`${c}-${i}`} style={styles.kvRow}>
              <Text style={styles.kvLabel}>{c}</Text>
              <Text style={styles.kvValue}>
                {cnt} {color.total ? `(${fmtPercent(cnt / color.total)})` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>Ανάλυση παραγγελιών</Text>
          {(ordersByYear.get(year) || []).map((o) => {
          // normalized key 
          const orderKey = normId(o.id)

          // items of order
          const its =
            itemsByOrderAll.get(orderKey) ??
            [] //  fallback

          const categoriesLabel = categoriesLabelForItems(its)
            return (
            <View key={o.id} style={styles.entryCard}>
              <View style={styles.entryAccent} />

              <View style={styles.entryBody}>
                <View style={styles.entryTopRow}>
                  <Text style={styles.entryTitle}>#{o.id.slice(0,6).toUpperCase()}</Text>
                  <Text style={styles.entryDate}>{fmtDate(o.orderDate || o.createdAt)}</Text>
                </View>

                <View style={styles.entryMetaRow}>
                 <Text style={styles.entryMeta}>Κατηγορία: {categoriesLabel}</Text>
                  <Text style={styles.entryMeta}>Order: {fmtMoney(o.totalAmount)}</Text>
                </View>
              </View>

            </View>
          )
        })}
      </View>


      

    </View>
  )
}

function printHtmlWeb(html: string) {
  const win = window.open('', '_blank');
  if (!win) {
    Alert.alert('Σφάλμα', 'Ο browser μπλόκαρε την εκτύπωση.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  // δώσε ένα μικρό delay για layout πριν το print
  setTimeout(() => {
    try { win.print(); } finally {
      setTimeout(() => { try { win.close(); } catch {} }, 300);
    }
  }, 150);
}


async function exportHistoryYearPDF(year: number) {
  try {
    const ords     = ordersByYear.get(year) || []
    const byOrd    = itemsByOrderForYear(year)
    const cat      = categoryBreakdownForYear(year)
    const colors   = colorBreakdownForYear(year)
    const itemsYear= itemsByYear.get(year) || []

    const fullName = selectedCustomer
      ? `${selectedCustomer.firstName || ''} ${selectedCustomer.lastName || ''}`.trim()
      : '—'

    const html = `
      <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>
          @page { size: A4 landscape; margin: 8mm; }

          html, body {
            margin: 0; padding: 0;
            height: auto !important;
            overflow: visible !important;
            font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif;
          }

          #page { box-sizing: border-box; padding: 4mm; }
          .content { width: 100%; }

          h1 { margin: 0 0 4px; font-size: 13px; font-weight: 800; }
          .sub { margin: 0 0 6px; font-size: 10px; color: #374151; }
          h2 { margin: 4px 0 2px; font-size: 10px; }
          .muted { color: #6b7280; }
          .tight { margin-top: 4px; }

          table { width:100%; border-collapse: collapse; table-layout: fixed; }
          th, td { border:1px solid #ddd; padding:1px; font-size:8px; vertical-align:top; }
          th { background:#f3f4f6; text-align:left; }
          .nowrap { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
          .notes { max-width:180px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

          /* Pagination-friendly κανόνες */
          section { break-inside: avoid; page-break-inside: avoid; }
          table   { break-inside: avoid; page-break-inside: avoid; }
          thead   { display: table-header-group; } /* header σε κάθε σελίδα */
          tfoot   { display: table-footer-group; }
          tr      { break-inside: avoid; page-break-inside: avoid; }

          /* Manual page breaks όπου θέλεις νέα σελίδα */
          .page-break { break-after: page; page-break-after: always; }

          .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:4px; align-items:start; }

          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          @media print {
            html, body { height: auto !important; overflow: visible !important; }
          }
        </style>
      </head>

      <body>
        <div id="page">
          <div class="content">
            <h1>${fullName}</h1>
            <div class="sub">Ιστορικό ${year}</div>

            <section class="tight">
              <h2>Σύνοψη</h2>
              <table class="kv">
                <tr><th>Συνολικές παραγγελίες</th><td>${ords.length}</td></tr>
                <tr><th>Συνολικό ποσό</th><td>${fmtMoney(sum(ords.map(o => Number(o.totalAmount || 0))))}</td></tr>
              </table>
            </section>

            <section class="tight">
              <div class="grid2">
                <div>
                  <h2>Κατηγορίες</h2>
                  ${cat.entries.length === 0 ? '<div class="muted">—</div>' : `
                  <table><thead><tr><th>Κατηγορία</th><th>Πλήθος</th></tr></thead><tbody>
                    ${cat.entries.map(([label, cnt]) => `
                      <tr><td>${label}</td><td>${cnt} (${fmtPercent(cnt / (cat.total || 1))})</td></tr>
                    `).join('')}
                  </tbody></table>`}
                </div>
                <div>
                  <h2>Χρώματα</h2>
                  ${colors.entries.length === 0 ? '<div class="muted">—</div>' : `
                  <table><thead><tr><th>Χρώμα</th><th>Πλήθος</th></tr></thead><tbody>
                    ${colors.entries.map(([c, cnt]) => `
                      <tr><td>${c}</td><td>${cnt} (${fmtPercent(cnt / (colors.total || 1))})</td></tr>
                    `).join('')}
                  </tbody></table>`}
                </div>
              </div>
            </section>

            <section class="tight">
              <h2>Παραγγελίες</h2>
              ${ords.length === 0 ? '<div class="muted">—</div>' : `
              <table>
                <thead>
                  <tr>
                    <th>Κωδικός</th>
                    <th class="nowrap">Ημερομηνία</th>
                    <th>Τεμάχια</th>
                    <th>Σύνολο</th>
                    <th class="notes">Σημειώσεις</th>
                  </tr>
                </thead>
                <tbody>
                  ${ords.map(o => {
                    const its = byOrd.get(normId(o.id)) || []
                    return `
                      <tr>
                        <td>#${o.id.slice(0,6).toUpperCase()}</td>
                        <td class="nowrap">${fmtDate(o.orderDate || o.createdAt)}</td>
                        <td>${its.length}</td>
                        <td>${fmtMoney(o.totalAmount)}</td>
                        <td class="notes">${(o.notes || '').replace(/</g,'&lt;')}</td>
                      </tr>`
                  }).join('')}
                </tbody>
              </table>`}
            </section>


            <section class="tight">
              <h2>Όλα τα τεμάχια</h2>
              ${itemsYear.length === 0 ? '<div class="muted">—</div>' : `
              <table>
                <thead>
                  <tr>
                    <th>Κωδικός</th>
                    <th>Κατηγορία</th>
                    <th>Χρώμα</th>
                    <th>Τιμή</th>
                    <th class="nowrap">Ημ/νία</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsYear.map((it:any) => `
                    <tr>
                      <td>${(it.item_code || ('#'+it.id.slice(0,6).toUpperCase()))}</td>
                      <td>${normCat(it.category)}</td>
                      <td>${it.color || '—'}</td>
                      <td>${fmtMoney(it.price)}</td>
                      <td class="nowrap">${fmtDate(it.order_date || it.created_at)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>`}
            </section>
          </div>
        </div>
      </body>
      </html>
    `

    // 🔁 WEB ΠΡΩΤΑ — χωρίς printToFileAsync
    if (Platform.OS === 'web') {
      printHtmlWeb(html); 
      return
    }

    // 📱 Native: φτιάχνουμε PDF αρχείο και το μοιραζόμαστε
    const file = await Print.printToFileAsync({ html })
    const uri = file?.uri
    if (!uri) {
      Alert.alert('Σφάλμα', 'Δεν δημιουργήθηκε αρχείο PDF.')
      return
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Ιστορικό ${year}.pdf`,
      })
    } else {
      Alert.alert('PDF έτοιμο', uri)
    }
  } catch (e) {
    console.error('exportHistoryYearPDF failed', e)
    Alert.alert('Σφάλμα', 'Αποτυχία εξαγωγής PDF.')
  }
}

const [selectedItem, setSelectedItem] = useState<any | null>(null)
const [itemEdit, setItemEdit] = useState({
  item_code: '',
  category: '',
  color: '',
  price: '',
  status: '',
  storage_status: '',
  order_date: '',
})

  // Load from DB
  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      const sub = observeCustomers(200).subscribe((rows: any[]) => {
        const mapped: DBCustomer[] = rows.map((r: any) => ({
          id: r.id,
          firstName: r.firstName || '',
          lastName: r.lastName || '',
          phone: r.phone || '',
          address: r.address || '',
          city: r.city || '',  
          afm: r.afm || '',
          notes: r.notes || '',
          createdAt: r.createdAt,
          lastModifiedAt: r.lastModifiedAt,
        }))
        setCustomers(mapped)
        setLoading(false)

        // dashboard preview
        const count = mapped.length
        const names = mapped.slice(0, 2).map(c => `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || '—')
        setCustomersPreview({ count, names })
      })

      return () => sub.unsubscribe()
    }, [setCustomersPreview])
  )

  // Debounce search
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebounced(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // load orders for each customer (relations)
  React.useEffect(() => {
    if (!detailsOpen || activeTab !== 'orders' || !selectedCustomer) return;

    let cancelled = false;
    setOrdersLoading(true);

    const sub = observeOrdersByCustomer(selectedCustomer.id, { limit: 200 })
      .subscribe(async (rows: any[]) => {
        try {
          if (cancelled) return;

          //  map orders 
          const mapped = rows.map((r: any) => ({
            id: r.id,
            customerId: selectedCustomer.id,
            paymentMethod: r.paymentMethod ?? '',
            deposit: r.deposit ?? null,
            totalAmount: r.totalAmount ?? 0,
            notes: r.notes ?? null,
            orderDate: r.orderDate,
            createdAt: r.createdAt,
            lastModifiedAt: r.lastModifiedAt,
            status: r.orderStatus ?? 'Νέα',
            hasDebt: r.hasDebt ?? false,
            receiptNumber:
              r.receiptNumber ??
              r?._raw?.receiptNumber ??
              r?._raw?.receipt_number ??
              null,
          }));

          // all items of the customer
          const itemsRows: any[] = await listOrderItemsByCustomer(selectedCustomer.id, { limit: 5000 });
          const itemsMapped = itemsRows.map((r: any) => {
            const raw = r?._raw ?? {};
            const orderId = r.order_id ?? r.orderId ?? raw.order_id ?? raw.orderId ?? '';
            return {
              id: r.id,
              order_id: normId(orderId),
              item_code: r.item_code ?? raw.item_code ?? '',
              category: r.category ?? raw.category ?? '',
              color: r.color ?? raw.color ?? '',
              price: (r.price ?? raw.price) ?? 0,
              status: r.status ?? raw.status ?? '',
              storage_status: r.storage_status ?? raw.storage_status ?? '',
              order_date: r.order_date ?? raw.order_date ?? '',
              created_at: r.created_at ?? raw.created_at,
            };
          });

          // itemsCount per order 
          const byOrder = groupItemsByOrder(itemsMapped);
          const withCounts = mapped.map(o => ({
            ...o,
            itemsCount: byOrder.get(normId(o.id))?.length ?? 0,
          }));

          if (!cancelled) setOrders(withCounts);
        } catch (e) {
          console.error('orders tab load failed', e);
          if (!cancelled) Alert.alert('Σφάλμα', 'Αποτυχία φόρτωσης παραγγελιών.');
        } finally {
          if (!cancelled) setOrdersLoading(false);
        }
      });

    return () => { cancelled = true; sub.unsubscribe(); };
  }, [detailsOpen, activeTab, selectedCustomer]);


  React.useEffect(() => {
    if (!itemsOpen || !selectedCustomer) return

    let cancelled = false
    const run = async () => {
      try {
        setItemsLoading(true)
        const rows: any[] = await listOrderItemsByCustomer(selectedCustomer.id, { limit: 1000 })
          if (cancelled) return

          const mapped = rows.map((r: any) => {
            const raw = r?._raw ?? {}
            const orderId = r.order_id ?? r.orderId ?? raw.order_id ?? raw.orderId ?? ''
            const receiptNumber =
              r.receiptNumber           ?? 
              raw.receiptNumber         ?? 
              raw.receipt_number        ?? 
              null
            return {
              id: r.id,
              order_id: normId(orderId),                      
              item_code: r.item_code ?? raw.item_code ?? '',
              category: r.category ?? raw.category ?? '',
              color: r.color ?? raw.color ?? '',
              price: (r.price ?? raw.price) ?? 0,
              status: r.status ?? raw.status ?? '',
              storage_status: r.storage_status ?? raw.storage_status ?? '',
              order_date: r.order_date ?? raw.order_date ?? '',
              created_at: r.created_at ?? raw.created_at,
              receiptNumber,
            }
          })
          console.log('[D] items mapped sample:', mapped[0])

          setItems(mapped)
        } catch (e) {
          console.error('load items failed', e)
          Alert.alert('Σφάλμα', 'Αποτυχία φόρτωσης τεμαχίων.')
        } finally {
          if (!cancelled) setItemsLoading(false)
        }
      }

    run()
    return () => { cancelled = true }
  }, [itemsOpen, selectedCustomer])

  // history
  React.useEffect(() => {
  if (!detailsOpen || activeTab !== 'history' || !selectedCustomer) return

  let unsub: any = null
  setHistLoading(true)

  // 1) Observe orders αυτού του πελάτη (όπως στο orders tab, αλλά εδώ ανεξάρτητα)
  const sub = observeOrdersByCustomer(selectedCustomer.id, { limit: 1000 })
    .subscribe(async (rows: any[]) => {
      const mapped = rows.map((r: any) => ({
        id: r.id,
        customerId: selectedCustomer.id,
        orderDate: r.orderDate,
        totalAmount: r.totalAmount ?? 0,
        deposit: r.deposit ?? null,
        notes: r.notes ?? null,
        createdAt: r.createdAt,
        lastModifiedAt: r.lastModifiedAt,
        hasDebt: r.hasDebt ?? false,
      }))
      setHistOrders(mapped)

      // 2) Φέρε ΟΛΑ τα items για τον πελάτη (θα τα φιλτράρουμε per-year client-side)
      try {
        const rowsItems: any[] = await listOrderItemsByCustomer(selectedCustomer.id, { limit: 5000 })
        const mappedItems = rowsItems.map((r: any) => {
          const raw = r?._raw ?? {}
          const orderId =
            r.order_id ?? r.orderId ?? raw.order_id ?? raw.orderId ?? r.order ?? raw.order ?? ''

          return {
            id: r.id,
            order_id: normId(String(orderId).trim()),
            item_code: r.item_code ?? raw.item_code ?? '',
            category: r.category ?? raw.category ?? '',
            color: r.color ?? raw.color ?? '',
            price: Number((r.price ?? raw.price) ?? 0),
            status: r.status ?? raw.status ?? '',
            storage_status: r.storage_status ?? raw.storage_status ?? '',
            order_date: r.order_date ?? raw.order_date ?? '',
            created_at: r.created_at ?? raw.created_at,
          }
        })
        setHistItems(mappedItems)
      } catch (e) {
        console.error('history: load items failed', e)
        Alert.alert('Σφάλμα', 'Αποτυχία φόρτωσης δεδομένων ιστορικού.')
      } finally {
        setHistLoading(false)
      }
    })

  return () => { sub?.unsubscribe?.() }
}, [detailsOpen, activeTab, selectedCustomer])

  const loggedYearRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    if (!showYearReport || yearOpen == null || !selectedCustomer) return

    if (loggedYearRef.current === yearOpen) return
    loggedYearRef.current = yearOpen

    const range =
      appliedFilters
        ? `${appliedFilters.yearFrom ?? yearOpen}-${appliedFilters.yearTo ?? yearOpen}`
        : `${yearOpen}`

    logViewCustomerHistory(userId, selectedCustomer.id, range)
      .catch((e) => console.warn('logViewCustomerHistory failed:', e))
  }, [showYearReport, yearOpen, selectedCustomer, appliedFilters])


  // Filter results
  const results = useMemo(() => {
    const q = debounced.trim()
    if (!q) return customers

    if (isAFM(q)) return customers.filter(c => (c.afm ?? '').includes(q))
    if (isPhone(q)) return customers.filter(c => (c.phone ?? '').includes(q))

    const nq = normalize(q)
    return customers.filter(c => {
      const fullName = `${c.firstName} ${c.lastName}`.trim()
      const hay = [fullName, c.address ?? '', c.city ?? '', c.afm ?? '', c.phone ?? '', c.notes ?? '']
        .map(x => normalize(x))
        .join(' | ')
      return hay.includes(nq) || hay.indexOf(nq) >= 0
    })
  }, [debounced, customers])

  // Open create modal
  const onCreateCustomer = () => {
    setFirstName(''); 
    setLastName('')
    setAddresses(['']); 
    setCities(['']);  
    setPhones([''])
    setAfm(''); 
    setAfmError(''); 
    setPricePerSqm('')
    setDescription('')
    setErrors({ firstName: false, lastName: false, addresses: false, phones: false })
    setOpenForm(true)
  }

  // when editing customer's info
  function validateEdit() {
    const next = {
      firstName: !edit.firstName.trim(),
      lastName:  !edit.lastName.trim(),
      phone:     !edit.phone.trim(),
      pairs:     !(pairsCombined.trim() || composePairs(edit.address, edit.city).trim()),
      afm:       false,
    }
    setEditErr(next)
    if (Object.values(next).some(Boolean)) {
      Alert.alert('Συμπλήρωσε τα υποχρεωτικά πεδία', 'Όσα πεδία είναι κενά έχουν επισημανθεί.')
      return false
    }
    return true
  }
  //Διεύθυνση, Πόλη | ...
  const extractPrimaryCity = (combined: string) => {
    const first = (combined ?? '').split('|')[0] ?? ''
    const parts = first.split(',').map(s => s.trim())
    // ό,τι υπάρχει μετά το πρώτο comma το θεωρούμε πόλη (υποστηρίζει και "Αθήνα, Κέντρο")
    return parts.slice(1).join(', ')
  }

  const [pairsCombined, setPairsCombined] = useState('') // "addr, city | addr, city"

  // open customer card
  function openCustomerCard(customer: DBCustomer) {
    const { desc, receiptNo, pricePerSqm } = parseNotes(customer.notes)
    setSelectedCustomer(customer)

    const addressPipe = customer.address || ''
    const cityPipe    = customer.city    || ''
    setPairsCombined(composePairs(addressPipe, cityPipe))   // <<— για το ενιαίο input

    setEdit({
      firstName: customer.firstName || '',
      lastName:  customer.lastName  || '',
      phone:     customer.phone     || '',
      address:   addressPipe,   // raw pipes
      city:      cityPipe,      // raw pipes
      afm:       customer.afm   || '',
      notesBase: desc || '',
      receiptNo: receiptNo || '',
      pricePerSqm: priceByCustomer[customer.id] || '',
    })
    setActiveTab('details')
    setEditMode(false)
    setExpandedOrderId(null)
    setDetailsOpen(true)
  }

  function startEdit() { setEditMode(true) }

  function cancelEdit() {
    if (!selectedCustomer) return
    const { desc, receiptNo, pricePerSqm } = parseNotes(selectedCustomer.notes)
    setEdit({
      firstName: selectedCustomer.firstName || '',
      lastName:  selectedCustomer.lastName  || '',
      phone:     selectedCustomer.phone     || '',
      address:   selectedCustomer.address   || '',
      city:      selectedCustomer.city      || '',
      afm:       selectedCustomer.afm       || '',
      notesBase: desc || '',
      receiptNo: receiptNo || '',
      pricePerSqm: pricePerSqm || '',
    })
    setPairsCombined(
      composePairs(selectedCustomer.address || '', selectedCustomer.city || '')
    )
    setEditMode(false)
  }

  function askDeleteOrder(o: any) {
    const code = `#${o.id.slice(0, 6).toUpperCase()}`
    setConfirmDeleteOrder({ orderId: o.id, code })
  }

async function doDeleteOrderNow(orderId: string) {
  try {
    const actorId = String(user?.id ?? (user as any)?.uid ?? (user as any)?._id ?? 'system')

    // 1) Διαγραφή (items → order → log) με μία κλήση
    await deleteOrderCascade(orderId, actorId)

    // 2) Optimistic UI updates
    setOrders(prev => prev.filter(o => o.id !== orderId))
    setHistOrders(prev => prev.filter(o => o.id !== orderId))
    setHistItems(prev => prev.filter(it => normId(it.order_id) !== normId(orderId)))
    setExpandedOrderId(prev => (prev === orderId ? null : prev))

    if (selectedCustomer) {
      setPendingReturnsByCustomer(prev => {
        const list = (prev[selectedCustomer.id] || []).filter(oid => oid !== orderId)
        return { ...prev, [selectedCustomer.id]: list }
      })
    }

    Alert.alert('OK', 'Η παραγγελία διαγράφηκε.')
  } catch (e) {
    console.error('Delete order failed:', e)
    Alert.alert('Σφάλμα', 'Η διαγραφή παραγγελίας απέτυχε.')
  } finally {
    setConfirmDeleteOrder(null)
  }
}

function setOrderStatusLocal(orderId: string, status: string, hasDebt?: boolean) {
  setOrders(prev => prev.map(o =>
    o.id === orderId ? { ...o, status, ...(hasDebt !== undefined ? { hasDebt } : {}) } : o
  ))
}

async function persistOrderStatus(orderId: string, status: string, hasDebt?: boolean) {
  try {
    await updateOrder(orderId, { orderStatus: status, ...(hasDebt !== undefined ? { hasDebt } : {}) }, userId)
  } catch (e) {
    console.error('updateOrder failed', e)
    Alert.alert('Σφάλμα', 'Η ενημέρωση κατάστασης απέτυχε.')
  }
}

async function handleChangeStatus(item: any, nextStatus: string) {
  const orderId = item.id

  // Η δική σου υπάρχουσα ροή για "Παραδόθηκε"
  if (nextStatus === 'Παραδόθηκε') {
    setConfirmDelivered({ orderId })
    return
  }

  // ΝΕΑ ροή για "Έτοιμη"
  if (nextStatus === 'Έτοιμη') {
    if (!selectedCustomer) {
      // fallback: απλά θέσε "Έτοιμη" τοπικά + persist (hasDebt false όπως πριν)
      setOrderStatusLocal(orderId, 'Έτοιμη', false)
      persistOrderStatus(orderId, 'Έτοιμη', false)
      return
    }

    const ok = await allItemsWashedForOrder(selectedCustomer.id, orderId)
    if (ok) {
      setOrderStatusLocal(orderId, 'Έτοιμη', false)
      persistOrderStatus(orderId, 'Έτοιμη', false)
    } else {
      setConfirmReadyForce({ orderId }) // δείξε modal «Ναι/Όχι»
    }
    return
  }

  // Ό,τι άλλο status → όπως πριν: αλλάζουμε και καθαρίζουμε hasDebt
  setOrderStatusLocal(orderId, nextStatus, false)
  persistOrderStatus(orderId, nextStatus, false)
}

  // update customer
  async function saveEdit() {
    if (!selectedCustomer) return

    if (!validateEdit()) return

    const actorId = String(user?.id ?? (user as any)?.uid ?? (user as any)?._id ?? 'system')

    try {
      setAfmEditError('')
      const newNotes = composeNotes(edit.notesBase, edit.receiptNo, edit.pricePerSqm)
      const combinedSource = (pairsCombined && pairsCombined.trim())
        ? pairsCombined
        : composePairs(edit.address, edit.city)

      const parsed = parsePairs(combinedSource)
      const addressPipe = parsed.addressPipe.trim()  
      const cityPipe    = parsed.cityPipe.trim()     

      await updateCustomer(
        selectedCustomer.id,
        {
          firstName: edit.firstName.trim(),
          lastName:  edit.lastName.trim(),
          phone:     edit.phone.trim(),
          address:   addressPipe,
          city:      cityPipe,
          afm:       edit.afm.trim(),
          notes:     newNotes,
        },
        actorId
      )

      setPriceByCustomer(prev => {
        const next = { ...prev }
        const v = (edit.pricePerSqm || '').trim()
        if (v) next[selectedCustomer!.id] = Number(v).toFixed(2)
        else delete next[selectedCustomer!.id]
        return next
      })

      setSelectedCustomer(prev => prev ? {
        ...prev,
        firstName: edit.firstName.trim(),
        lastName:  edit.lastName.trim(),
        phone:     edit.phone.trim(),
        address:   addressPipe,
        city:      cityPipe,
        afm:       edit.afm.trim(),
        notes:     newNotes,
        lastModifiedAt: Date.now(),
      } : prev)

      setPairsCombined(composePairs(addressPipe, cityPipe))

      setEditMode(false)

      setDetailsOpen(false)
      router.replace('/customers')
      Alert.alert('OK', 'Τα στοιχεία πελάτη ενημερώθηκαν.')
      } catch (err: any) {
        const msg = (err?.message ?? String(err)).toString()
        if (msg.toLowerCase().includes('αφμ')) {
          setAfmEditError(msg)   
          return
        }
        Alert.alert('Σφάλμα', 'Η αποθήκευση απέτυχε.')
      }
  }

  // edit customer's order
  function openOrderEdit(o: any) {
    setDetailsOpen(false);
    router.push({ pathname: '/editorder', params: { orderId: o.id } })
  }

  // Multi-input helpers
  const addAddress = () => {
    setAddresses([...addresses, ''])
    setCities([...cities, ''])
  }
  const addPhone = () => setPhones(prev => [...prev, ''])
  const updateAddress = (idx: number, val: string) =>
    setAddresses(prev => prev.map((a, i) => (i === idx ? val : a)))
  const updatePhone = (idx: number, val: string) =>
    setPhones(prev => prev.map((p, i) => (i === idx ? val : p)))
  const removeAddress = (index: number) => {
    const newAddresses = addresses.filter((_, i) => i !== index)
    const newCities = cities.filter((_, i) => i !== index)
    setAddresses(newAddresses)
    setCities(newCities)
  }
  const removePhone = (idx: number) => setPhones(prev => prev.filter((_, i) => i !== idx))

  // INSERT new customer (as-is)
  async function handleSaveCustomer() {
    const cleanPhones = phones.map(p => p.trim()).filter(Boolean)
    const cleanAddresses = addresses.map(a => a.trim()).filter(Boolean)
    const cleanCities    = cities.map(c => c.trim()) 

    const nextErrors = {
      firstName: !firstName.trim(),
      lastName: !lastName.trim(),
      addresses: cleanAddresses.length === 0,
      phones: cleanPhones.length === 0,
    }
    setErrors(nextErrors)

    // Αν υπάρχει έστω ένα σφάλμα, σταμάτα εδώ (δείχνουμε κόκκινα inputs + μηνύματα)
    if (Object.values(nextErrors).some(Boolean)) return

    const phone = cleanPhones.join(' | ')
    const address = cleanAddresses.join(' | ')
    const notesBlock = (description?.trim() || '')
    const city    = cleanCities.join(' | ')  

    try {
      const rec = await createCustomer({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone,
        address,
        city,
        afm: afm.trim() || undefined,
        notes: notesBlock || undefined,
      }, userId)

      if (rec?.id && pricePerSqm.trim()) {
        setPriceByCustomer(prev => ({
          ...prev,
          [rec.id]: Number(pricePerSqm.replace(',', '.')).toFixed(2)
        }))
      }

      setOpenForm(false)
      Alert.alert('OK', 'Ο πελάτης προστέθηκε.')
      } catch (err: any) {
        const msg = (err?.message ?? String(err)).toString()
        if (msg.toLowerCase().includes('αφμ')) {
          setAfmError(msg)   
          return
        }
        Alert.alert('Σφάλμα', 'Κάτι πήγε στραβά. Δοκίμασε ξανά.')
      }
    }



  // Open confirm modal for deletion
  function onDeleteCustomerPressed(id: string) {
    setPendingDeleteId(id)
    setConfirmOpen(true)
  }

  // Confirm deletion
  async function confirmDeleteNow() {
    if (!pendingDeleteId) return
    try {
      await deleteCustomer(pendingDeleteId, userId)
      console.log('🗑️ Customer deleted:', pendingDeleteId)
    } catch (e) {
      console.error('Delete failed:', e)
      Alert.alert('Σφάλμα', 'Η διαγραφή απέτυχε.')
    } finally {
      setConfirmOpen(false)
      setPendingDeleteId(null)
    }
  }



const [confirmDelivered, setConfirmDelivered] = useState<{ orderId: string } | null>(null)
const [confirmReadyForce, setConfirmReadyForce] = useState<{ orderId: string } | null>(null)

// if items not delivered
// 2ο popup: κρατάμε και ποια παραγγελία είναι
const [returnsPrompt, setReturnsPrompt] = useState<{ customerId: string; orderId: string } | null>(null)

// Λίστα από orderIds ανά πελάτη
const [pendingReturnsByCustomer, setPendingReturnsByCustomer] = useState<Record<string, string[]>>({})


const [cities, setCities] = useState([''])

const updateCity = (index: number, value: string) => {
  const newCities = [...cities]
  newCities[index] = value
  setCities(newCities)
}


// load on mount
useEffect(() => {
  const load = async () => {
    try {
      const saved = await AsyncStorage.getItem('pendingReturnsByCustomer')
      if (saved) setPendingReturnsByCustomer(JSON.parse(saved))
    } catch (e) {
      console.error('Failed to load pendingReturnsByCustomer', e)
    }
  }
  load()
}, [])


useEffect(() => {
  const load = async () => {
    try {
      const raw = await AsyncStorage.getItem('pricePerSqmByCustomer')
      if (raw) setPriceByCustomer(JSON.parse(raw))
    } catch (e) {
      console.error('Failed to load pricePerSqmByCustomer', e)
    }
  }
  load()
}, [])

// persist mapping
useEffect(() => {
  AsyncStorage.setItem('pricePerSqmByCustomer', JSON.stringify(priceByCustomer))
}, [priceByCustomer])

// persist on change
useEffect(() => {
  AsyncStorage.setItem('pendingReturnsByCustomer', JSON.stringify(pendingReturnsByCustomer))
}, [pendingReturnsByCustomer])

const addrList = React.useMemo(
  () => (edit.address || '').split('|').map(s => s.trim()).filter(Boolean),
  [edit.address]
)
const cityList = React.useMemo(
  () => (edit.city || '').split('|').map(s => s.trim()),
  [edit.city]
)


const splitPipe = (s: string) =>
  (s || '').split('|').map(x => x.trim()).filter(Boolean)

/** "addr1, city1 | addr2, city2" -> { addressPipe: "addr1 | addr2", cityPipe: "city1 | city2" } */
function parsePairs(pairs: string) {
  const segs = splitPipe(pairs)
  const addrs: string[] = []
  const cities: string[] = []
  for (const seg of segs) {
    const [addr, ...rest] = seg.split(',').map(x => x.trim()).filter(Boolean)
    const city = rest.join(', ')
    addrs.push(addr || '')
    cities.push(city || '')
  }
  return {
    addressPipe: addrs.filter(Boolean).join(' | '),
    cityPipe: cities.filter(Boolean).join(' | ')
  }
}

/** addressPipe + cityPipe -> "addr1, city1 | addr2, city2" */
function composePairs(addressPipe: string, cityPipe: string) {
  const A = splitPipe(addressPipe)
  const C = splitPipe(cityPipe)
  const n = Math.max(A.length, C.length)
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    const a = (A[i] || '').trim()
    const c = (C[i] || '').trim()
    parts.push(c ? `${a}, ${c}` : a)
  }
  return parts.filter(Boolean).join(' | ')
}


function DeliveryConfirmModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void | Promise<void>
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
      }}>
        <View style={{
          backgroundColor: '#fff',
          borderRadius: 12,
          padding: 24,
          width: '90%',
          maxWidth: 360,
        }}>
          <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, textAlign: 'center' }}>
            Παραδόθηκε
          </Text>
          <Text style={{ fontSize: 16, textAlign: 'center', marginBottom: 24 }}>
            Πλήρωσε;
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>

            <TouchableOpacity
              onPress={onConfirm}
              style={{
                backgroundColor: '#3B82F6',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Ναι</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onCancel}
              style={{
                backgroundColor: '#F3F4F6',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: '#374151', fontWeight: '600' }}>Όχι</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function ReturnsConfirmModal({
  visible,
  onYes,
  onNo,
}: {
  visible: boolean
  onYes: () => void | Promise<void>
  onNo: () => void | Promise<void>
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNo}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: 24,
            width: '90%',
            maxWidth: 360,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: '600',
              marginBottom: 12,
              textAlign: 'center',
            }}
          >
            Υπολείπονται κομμάτια για επιστροφή;
          </Text>
          <Text
            style={{
              fontSize: 15,
              textAlign: 'center',
              marginBottom: 24,
              color: '#374151',
            }}
          >
            Θέλεις να σημειώσω ότι υπάρχουν κομμάτια προς επιστροφή;
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>

            <TouchableOpacity
              onPress={onYes}
              style={{
                backgroundColor: '#3B82F6',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Ναι</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onNo}
              style={{
                backgroundColor: '#F3F4F6',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: '#374151', fontWeight: '600' }}>Όχι</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function OrderDeleteModal({
  visible,
  orderCode,
  onYes,
  onNo,
}: {
  visible: boolean
  orderCode: string
  onYes: () => void | Promise<void>
  onNo: () => void | Promise<void>
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onNo}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: 22,
            width: '90%',
            maxWidth: 420,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: '400',
              textAlign: 'center',
              marginBottom: 10,
            }}
          >
            Διαγραφή παραγγελίας
          </Text>

          <Text
            style={{
              fontSize: 15,
              textAlign: 'center',
              color: '#374151',
              marginBottom: 22,
            }}
          >
            Είστε σίγουρος ότι θέλετε να διαγράψετε την παραγγελία “{orderCode}”;
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
            <TouchableOpacity
              onPress={onNo}
              style={{
                backgroundColor: '#F3F4F6',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: '#374151', fontWeight: '400' }}>Όχι</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onYes}
              style={{
                backgroundColor: '#EF4444',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: 'white', fontWeight: '400' }}>
                Ναι, διαγραφή
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function ReadyForceConfirmModal({
  visible,
  onYes,
  onNo,
}: {
  visible: boolean
  onYes: () => void | Promise<void>
  onNo: () => void | Promise<void>
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onNo}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: '90%', maxWidth: 420 }}>
          <Text style={{ fontSize: 18, fontWeight: '400', marginBottom: 10, textAlign: 'center' }}>
            Μη πλυμένα τεμάχια
          </Text>
          <Text style={{ fontSize: 15, color: '#374151', textAlign: 'center', marginBottom: 22 }}>
            Δεν είναι όλα τα τεμάχια της παραγγελίας πλυμμένα. Είστε σίγουρος ότι θέλετε να την θέσετε σε «Έτοιμη»;
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
            <TouchableOpacity onPress={onNo} style={{ backgroundColor: '#F3F4F6', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}>
              <Text style={{ color: '#374151', fontWeight: '400' }}>Όχι</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onYes} style={{ backgroundColor: '#3B82F6', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}>
              <Text style={{ color: 'white', fontWeight: '400' }}>Ναι</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}


  return (
    <Page>
      <AppHeader showBack /* onLogout={() => router.replace('/')} */ />

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.primaryBtn} onPress={onCreateCustomer} activeOpacity={0.9}>
          <Text style={styles.primaryBtnText}>+ Νέος Πελάτης</Text>
        </TouchableOpacity>

        <View style={{ flex: 1 }} />

        {/* Search */}
        <View
          style={[
            styles.searchBox,
            isSearchFocused && { borderColor: colors.primary, borderWidth: 2.5 },
          ]}
        >
          <Ionicons name="search-outline" size={20} color={colors.primary} style={{ marginRight: 6 }} />
          <TextInput
            placeholder="Όνομα, Επώνυμο, ΑΦΜ, Τηλέφωνο, Διεύθυνση"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            style={[
              styles.searchInput,
              Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
            ]}
            returnKeyType="search"
          />
        </View>
      </View>

      {/* Count */}
      <Text style={styles.countText}>
        {loading ? 'Φόρτωση…' : `${results.length} ${results.length === 1 ? 'αποτέλεσμα' : 'αποτελέσματα'}`}
      </Text>

      {/* List panel */}
      <View style={{ flex: 1, marginTop: 10, minHeight: 0 }}>   
        <View style={[styles.panel, { flex: 1, minHeight: 0 }]}> 
          <View style={styles.panelHeader}>
            <Ionicons name="person-outline" size={22} color={colors.primary} style={styles.panelIcon} />
            <Text style={styles.panelTitle}>Λίστα Πελατών</Text>
          </View>

          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Φόρτωση πελατών…</Text>
            </View>
          ) : results.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Δεν υπάρχουν πελάτες</Text>
              <Text style={styles.emptySubtitle}>Πάτα «Νέος Πελάτης» για να προσθέσεις.</Text>
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              style={{ flex: 1 }}                          
              contentContainerStyle={{ paddingBottom: 40 }}
              showsVerticalScrollIndicator
              renderItem={({ item }) => {
                const fullName = `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim()
                const firstPhone = (item.phone || '')
                .split('|')
                .map((s: string) => s.trim())
                .filter(Boolean)[0] || ''

                const addrListItem = (item.address || '').split('|').map((s: string) => s.trim()).filter(Boolean)
                const cityListItem = (item.city || '').split('|').map((s: string) => s.trim())
                const firstAddr = addrListItem[0] || ''
                const firstCity = cityListItem[0] || ''
                const firstAddrLine = firstAddr
                  ? (firstCity ? `${firstAddr}, ${firstCity}` : firstAddr)
                  : '—'


                return (
                  <TouchableOpacity style={styles.row} onPress={() => openCustomerCard(item)}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(item.firstName?.[0] || item.lastName?.[0] || 'Π').toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>
                        <Highlight text={fullName || '—'} query={debounced} />
                      </Text>
                      <View style={styles.detailsColumn}>
                        <Text style={styles.detailText}>{firstPhone ? `☎ ${firstPhone}` : '☎ —'}</Text>
                        <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">
                          {`📍 ${firstAddrLine}`}
                        </Text>
                      </View>
                    </View>

                    <Pressable
                      onPress={(e: any) => {
                        if (Platform.OS === 'web' && e?.stopPropagation) e.stopPropagation()
                        onDeleteCustomerPressed(item.id)
                      }}
                      style={{ padding: 6, marginLeft: 8 }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={20} color="#9CA3AF" />
                    </Pressable>
                  </TouchableOpacity>
                )
              }}
            />
          )}
        </View>
      </View>


      {/* Create Modal */}
      <Modal visible={openForm} animationType="fade" onRequestClose={() => setOpenForm(false)} transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>

            <View style={styles.modalHeader}>
              <Image
                source={require('../../assets/images/customer.png')}
                style={{ width: 80, height: 80, marginBottom: 8 }}
                resizeMode="contain"
              />
              <Text style={styles.modalTitle}>Νέος πελάτης</Text>
              <Text style={styles.modalSubtitle}>Συμπληρώστε τα στοιχεία του πελάτη.</Text>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: 16 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Όνομα | Επώνυμο */}
              <View style={styles.row2}>
                {/* Όνομα */}
                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Όνομα *</Text>
                  <TextInput
                    value={firstName}
                    onChangeText={(v) => {
                      setFirstName(v)
                      if (errors.firstName && v.trim()) setErrors(s => ({ ...s, firstName: false }))
                    }}
                    style={[styles.input, errors.firstName && styles.inputError]}
                    placeholder="Εισάγετε το όνομα"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="words"

                    autoComplete="given-name"
                    {...Platform.select({
                      ios:     { textContentType: 'givenName' },
                      android: { autoComplete: 'given-name', importantForAutofill: 'yes' as any },
                      web:     { autoComplete: 'given-name' },
                    })}
                  />
                  {errors.firstName && <Text style={styles.errorText}>Το όνομα είναι υποχρεωτικό.</Text>}
                </View>

                {/* Επώνυμο */}
                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Επώνυμο *</Text>
                  <TextInput
                    value={lastName}
                    onChangeText={(v) => {
                      setLastName(v)
                      if (errors.lastName && v.trim()) setErrors(s => ({ ...s, lastName: false }))
                    }}
                    style={[styles.input, errors.lastName && styles.inputError]}
                    placeholder="Εισάγετε το επώνυμο"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="words"

                    autoComplete="family-name"
                    {...Platform.select({
                      ios:     { textContentType: 'familyName' },
                      android: { autoComplete: 'family-name', importantForAutofill: 'yes' as any },
                      web:     { autoComplete: 'family-name' },
                    })}
                  />
                  {errors.lastName && <Text style={styles.errorText}>Το επώνυμο είναι υποχρεωτικό.</Text>}
                </View>
              </View>

              {/* Διευθύνσεις */}
              <View style={styles.group}>
                <View style={styles.groupHeader}>
                  <Text style={styles.label}>Διευθύνση, Πόλη *</Text>
                  <TouchableOpacity onPress={addAddress} style={styles.linkBtn}>
                    <Text style={styles.linkBtnText}>+ Προσθήκη</Text>
                  </TouchableOpacity>
                </View>

                {addresses.map((addr, idx) => (
                  <View key={`addr-${idx}`} style={[styles.addRow, { gap: 8 }]}>
                    {/* Διεύθυνση */}
                    <TextInput
                      value={addr}
                      onChangeText={(v) => {
                        updateAddress(idx, v)
                        if (errors.addresses && v.trim()) setErrors((s) => ({ ...s, addresses: false }))
                      }}
                      style={[
                        styles.input,
                        { flex: 1 },
                        errors.addresses && idx === 0 && styles.inputError,
                      ]}
                      placeholder="Διεύθυνση"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="words"

                      autoComplete={idx === 0 ? 'street-address' : 'off'}
                      {...Platform.select({
                        ios:     idx === 0 ? { textContentType: 'fullStreetAddress' } : { textContentType: 'none' as any },
                        android: { autoComplete: idx === 0 ? 'postal-address' : 'off', importantForAutofill: (idx === 0 ? 'yes' : 'no') as any },
                        web:     { autoComplete: idx === 0 ? 'street-address' : 'off' },
                      })}
                    />

                    {/* Πόλη */}
                    <TextInput
                      value={cities[idx] || ''}
                      onChangeText={(v) => updateCity(idx, v)}
                      style={[styles.input, { flex: 0.8 }]}
                      placeholder="Πόλη"
                      placeholderTextColor={colors.muted}
                      autoCapitalize="words"

                       {...Platform.select({
                        ios: { textContentType: idx === 0 ? 'addressCity' : 'none' as const },
                        default: {},
                      })}
                    />

                    {addresses.length > 1 && (
                      <TouchableOpacity onPress={() => removeAddress(idx)} style={styles.removeBtn}>
                        <Text style={styles.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}

                {errors.addresses && (
                  <Text style={styles.errorText}>Πρέπει να προσθέσεις τουλάχιστον μία διεύθυνση.</Text>
                )}
              </View>

              {/* Τηλέφωνα | ΑΦΜ */}
              <View style={styles.row2}>
                <View style={[styles.inputWrap, styles.flex1]}>
                  <View style={styles.groupHeader}>
                    <Text style={styles.label}>Τηλέφωνα *</Text>
                    <TouchableOpacity onPress={addPhone} style={styles.linkBtn}>
                      <Text style={styles.linkBtnText}>+ Προσθήκη</Text>
                    </TouchableOpacity>
                  </View>

                  {phones.map((ph, idx) => (
                    <View key={`ph-${idx}`} style={styles.addRow}>
                      <TextInput
                        value={ph}
                        onChangeText={(v) => {
                          updatePhone(idx, v)
                          if (errors.phones && v.trim()) setErrors(s => ({ ...s, phones: false }))
                        }}
                        style={[
                          styles.input,
                          styles.flex1,
                          errors.phones && idx === 0 && styles.inputError, 
                        ]}
                        keyboardType="phone-pad"
                        placeholder="Τηλέφωνο"
                        placeholderTextColor={colors.muted}

                        autoComplete={idx === 0 ? 'tel' : 'off'}
                        {...Platform.select({
                          ios:     idx === 0 ? { textContentType: 'telephoneNumber' } : { textContentType: 'none' as any },
                          android: { autoComplete: idx === 0 ? 'tel' : 'off', importantForAutofill: (idx === 0 ? 'yes' : 'no') as any },
                          web:     { autoComplete: idx === 0 ? 'tel' : 'off' },
                        })}
                      />
                      {phones.length > 1 && (
                        <TouchableOpacity onPress={() => removePhone(idx)} style={styles.removeBtn}>
                          <Text style={styles.removeBtnText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}

                  {errors.phones && (
                    <Text style={styles.errorText}>Πρέπει να προσθέσεις τουλάχιστον ένα τηλέφωνο.</Text>
                  )}
                </View>

                {/* ΑΦΜ (όπως είναι, χωρίς autofill) */}
                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>ΑΦΜ (προαιρετικό)</Text>
                  <TextInput
                    value={afm}
                    onChangeText={(raw) => {
                      const digits = (raw || '').replace(/\D/g, '')
                      if (digits.length > 9) {
                        setAfm(digits.slice(0, 9))
                        setAfmError('Το ΑΦΜ είναι ακριβώς 9 ψηφία.')
                        return
                      }
                      setAfm(digits)
                      if (digits.length === 9) setAfmError('')
                      else if (digits.length > 0) setAfmError('Το ΑΦΜ πρέπει να έχει 9 ψηφία.')
                      else setAfmError('')
                    }}
                    onBlur={() => {
                      if (afm && !/^\d{9}$/.test(afm)) setAfmError('Το ΑΦΜ πρέπει να έχει 9 ψηφία.')
                    }}
                    style={[styles.input, afmError ? { borderColor: 'red' } : null]}
                    keyboardType="number-pad"
                    inputMode="numeric"
                    placeholder="9 ψηφία"
                    placeholderTextColor={colors.muted}
                    maxLength={9}
                    // 🔒 off
                    autoComplete="off"
                    {...Platform.select({
                      ios:     { textContentType: 'none' as any },
                      android: { autoComplete: 'off', importantForAutofill: 'no' as any },
                      web:     { autoComplete: 'off' },
                    })}
                  />
                  {afmError ? (
                    <Text style={{ color: 'red', marginTop: 4, fontSize: 11 }}>Το ΑΦΜ πρέπει να έχει 9 ψηφία.</Text>
                  ) : null}
                </View>
              </View>


              {/* Τιμή/τ.μ. (προαιρετικό) */}
              <View style={[styles.inputWrap, styles.flex1, { marginTop: 10 }]}>
                <Text style={styles.label}>Τιμή/τ.μ. (προαιρετικό)</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    value={pricePerSqm}
                    onChangeText={(raw) => {
                      const v = (raw || '').replace(/[^0-9.,]/g, '').replace(',', '.')
                      setPricePerSqm(v)
                    }}
                    onBlur={() => {
                      if (pricePerSqm && !isNaN(Number(pricePerSqm))) {
                        setPricePerSqm(Number(pricePerSqm).toFixed(2))
                      }
                    }}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, { paddingLeft: 28 }]}
                  />
                  <Text style={{ position: 'absolute', left: 10, top: 10, color: '#9CA3AF' }}>€</Text>
                </View>
              </View>



              {/* Περιγραφή → notes */}
              <View style={styles.inputWrap}>
                <Text style={styles.label}>Περιγραφή </Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  style={[styles.input, styles.textarea]}
                  placeholder="Προσθέστε περιγραφή για τον πελάτη..."
                  placeholderTextColor={colors.muted}
                  multiline
                />
              </View>
            </ScrollView>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setOpenForm(false) }} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>Ακύρωση</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleSaveCustomer} style={[styles.primaryBtn, { marginLeft: 12 }]}>
                <Text style={styles.primaryBtnText}>Αποθήκευση</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.requiredNote}>Τα πεδία με * είναι υποχρεωτικά</Text>
          </View>
        </View>
      </Modal>

      {/* ===== Μεγάλο modal ===== */}
      <Modal
        visible={detailsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <View style={styles.detailsBackdrop}>
          <View style={styles.detailsCardXL}>
            {/* Τίτλος με όνομα στο κέντρο */}
            <Text style={styles.detailsHeaderName}>
              {selectedCustomer ? `${selectedCustomer.firstName || ''} ${selectedCustomer.lastName || ''}`.trim() : '—'}
            </Text>

            {/* Tabs σε όλη τη σειρά */}
            <View style={styles.detailsTabsRow}>
              <Pressable
                onPress={() => setActiveTab('details')}
                style={[styles.tabBtnXL, styles.tabFlex, activeTab === 'details' && styles.tabBtnXLActive]}
              >
                <Text style={[styles.tabTextXL, activeTab === 'details' && styles.tabTextXLActive]}>
                  Στοιχεία πελάτη
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('orders')}
                style={[styles.tabBtnXL, styles.tabFlex, activeTab === 'orders' && styles.tabBtnXLActive]}
              >
                <Text style={[styles.tabTextXL, activeTab === 'orders' && styles.tabTextXLActive]}>
                  Παραγγελίες
                </Text>
              </Pressable>
              

              <Pressable
                onPress={() => setActiveTab('history')}
                style={[styles.tabBtnXL, styles.tabFlex, activeTab === 'history' && styles.tabBtnXLActive]}
              >
                <Text style={[styles.tabTextXL, activeTab === 'history' && styles.tabTextXLActive]}>
                  Ιστορικό
                </Text>
              </Pressable>
            </View>

            {/*  actions bar:  Close (X) */}
            <View style={styles.detailsActionsBar} pointerEvents="box-none">
              <Pressable
                onPress={() => setDetailsOpen(false)}
                hitSlop={8}
                style={{ marginLeft: 8 }}
                pointerEvents="auto"
              >
                <Ionicons name="close" size={22} color="#6B7280" />
              </Pressable>
            </View>

            {/* Περιεχόμενο */}
            {activeTab === 'details' && selectedCustomer && (
              <View style={[styles.detailsUnifiedCard, styles.cardPolish]}>
                {/* Header γραμμή με badge + actions */}
                <View style={styles.sectionTitleRow}>
                  

                  <View style={{ flex: 1 }} />

                  <View style={styles.detailsInnerActions}>
                    {!editMode ? (
                      <TouchableOpacity style={styles.editBtnInside} onPress={startEdit}>
                        <Text style={styles.editBtnInsideText}>Επεξεργασία</Text>
                      </TouchableOpacity>
                    ) : (
                      <>
                        <TouchableOpacity style={styles.cancelBtnInside} onPress={cancelEdit}>
                          <Text style={styles.cancelBtnInsideText}>Ακύρωση</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.saveBtnInside} onPress={saveEdit}>
                          <Text style={styles.saveBtnInsideText}>Αποθήκευση</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>

               
                <View style={styles.detailsContentRow}>
                  {/* scroll */}
                  <ScrollView
                    style={styles.colLeftScroll}
                    contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                  >
                    {/*  Βασικά */}
                    <FieldRow
                      label="Όνομα"
                      value={edit.firstName}
                      editable={editMode}
                      onChangeText={(v) => {
                        setEdit(s => ({ ...s, firstName: v }))
                        // καθάρισε error όταν γράφει κάτι
                        if (editErr.firstName && v.trim()) setEditErr(s => ({ ...s, firstName: false }))
                      }}
                    />
                    {editMode && editErr.firstName && (
                      <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 3, marginLeft: 4 }}>
                        Το όνομα είναι υποχρεωτικό.
                      </Text>
                    )}

                    <FieldRow
                      label="Επώνυμο"
                      value={edit.lastName}
                      editable={editMode}
                      onChangeText={(v) => {
                        setEdit(s => ({ ...s, lastName: v }))
                        if (editErr.lastName && v.trim()) setEditErr(s => ({ ...s, lastName: false }))
                      }}
                    />
                    {editMode && editErr.lastName && (
                      <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 3, marginLeft: 4 }}>
                        Το επώνυμο είναι υποχρεωτικό.
                      </Text>
                    )}

                    <View style={styles.hairline} />

                    {/*  Επικοινωνία */}
                    <FieldRow
                      label="Τηλέφωνο"
                      value={edit.phone}
                      editable={editMode}
                      keyboardType="phone-pad"
                      onChangeText={(v) => {
                        setEdit(s => ({ ...s, phone: v }))
                        if (editErr.phone && v.trim()) setEditErr(s => ({ ...s, phone: false }))
                      }}
                    />
                    {editMode && editErr.phone && (
                      <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 3, marginLeft: 4 }}>
                        Το τηλέφωνο είναι υποχρεωτικό.
                      </Text>
                    )}

                    <FieldRow
                      label="Διεύθυνση, Πόλη"
                      value={pairsCombined}
                      editable={editMode}
                      onChangeText={(v) => {
                        setPairsCombined(v)
                        if (editErr.pairs && v.trim()) setEditErr(s => ({ ...s, pairs: false }))
                      }}
                      onBlur={() => {
                        const { addressPipe, cityPipe } = parsePairs(pairsCombined)
                        setEdit(s => ({ ...s, address: addressPipe, city: cityPipe }))
                      }}
                    />

                    {/* when editing */}
                    {editMode && (
                      <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 3, marginLeft: 4 }}>
                        Π.χ: Οδός1, Πόλη1 | Οδός2, Πόλη2
                      </Text>
                    )}

                    <View style={styles.hairline} />

                    <FieldRow
                      label="ΑΦΜ"
                      value={edit.afm}
                      editable={editMode}
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={9}
                      onChangeText={(raw) => {
                        // only num
                        const digits = (raw || '').replace(/\D/g, '')
                        /// >9 --> error
                        if (digits.length > 9) {
                          setEdit(s => ({ ...s, afm: digits.slice(0, 9) }))
                          setAfmEditError('Το ΑΦΜ είναι ακριβώς 9 ψηφία.')
                          return
                        }
                        setEdit(s => ({ ...s, afm: digits }))

                        if (digits.length === 9) {
                          setAfmEditError('')
                        } else if (digits.length > 0) {
                          setAfmEditError('Το ΑΦΜ πρέπει να έχει 9 ψηφία.')
                        } else {
                          setAfmEditError('')
                        }
                      }}
                      onBlur={() => {
                        if (edit.afm && !/^\d{9}$/.test(edit.afm)) {
                          setAfmEditError('Το ΑΦΜ πρέπει να έχει 9 ψηφία.')
                        }
                      }}
                      error={!!afmEditError}
                      errorMessage={afmEditError}
                    />

                    <FieldRow
                      label="Τιμή/τ.μ. (προαιρετικό)"
                      value={edit.pricePerSqm}
                      editable={editMode}
                      keyboardType="decimal-pad"
                      onChangeText={(raw) => {
                        const v = (raw || '').replace(/[^0-9.,]/g, '').replace(',', '.')
                        setEdit(s => ({ ...s, pricePerSqm: v }))
                      }}
                      onBlur={() => {
                        const v = (edit.pricePerSqm || '').trim()
                        if (v && !isNaN(Number(v))) {
                          setEdit(s => ({ ...s, pricePerSqm: Number(v).toFixed(2) }))
                        }
                      }}
                    />

                  </ScrollView>

                  {/* Divider */}
                  <View style={styles.vDivider} />

                  {/* Δεξιά στήλη (σταθερή) */}
                  <View style={styles.detailsColRight}>
                    <Text style={styles.rightTitle}>Περιγραφή</Text>
                    {editMode ? (
                      <TextInput
                        style={[styles.notesInput, { minHeight: 160 }]}
                        value={edit.notesBase}
                        onChangeText={(v) => setEdit(s => ({ ...s, notesBase: v }))}
                        placeholder="Προσθέστε περιγραφή…"
                        placeholderTextColor="#9CA3AF"
                        multiline
                      />
                    ) : (
                      <View style={styles.notesViewBoxPolished}>
                        <Text style={styles.notesText}>
                          {parseNotes(selectedCustomer?.notes).desc || '—'}
                        </Text>
                      </View>
                    )}

                    {/* Έχει χρέος */}
                    {orders.some(o => o.hasDebt) && (
                      <View style={styles.debtBox}>
                        <Text style={styles.debtTitle}>Χρέη παραγγελιών</Text>

                        {orders
                          .filter(o => o.hasDebt)
                          .map(o => (
                            <Pressable
                              key={o.id}
                              onPress={() => {
                                setActiveTab('orders')
                                setExpandedOrderId(o.id)
                              }}
                              style={styles.debtRow}
                            >
                              <View style={styles.debtDot} />
                              <Text style={styles.debtText}>
                                Η παραγγελία <Text style={styles.debtCode}>#{o.id.slice(0, 6).toUpperCase()}</Text> έχει χρέος!
                              </Text>
                              <Ionicons name="chevron-forward" size={16} color="#B91C1C" />
                            </Pressable>
                          ))}
                      </View>
                    )}

                    {/* Υπολείπονται κομμάτια (ανά παραγγελία) */}
                    {selectedCustomer && (pendingReturnsByCustomer[selectedCustomer.id]?.length || 0) > 0 && (
                      <View style={styles.returnsBox}>
                        {(pendingReturnsByCustomer[selectedCustomer.id] || []).map((oid) => (
                          <Pressable
                            key={oid}
                            onPress={() => {
                              setActiveTab('orders')
                              setExpandedOrderId(oid) // άνοιξε τη συγκεκριμένη παραγγελία
                            }}
                            style={styles.debtRow} // reuse το ίδιο ωραίο row style
                          >
                            <View style={styles.debtDot} />
                            <Text style={styles.returnsText}>
                              Υπολείπονται κομμάτια για επιστροφή στην παραγγελία{' '}
                              <Text style={styles.debtCode}>#{oid.slice(0, 6).toUpperCase()}</Text>
                            </Text>
                            <Ionicons name="chevron-forward" size={16} color="#92400E" />
                          </Pressable>
                        ))}
                      </View>
                    )}


                  </View>
                </View>
              </View>
            )}


            {/*  ΛΙΣΤΑ ΠΑΡΑΓΓΕΛΙΩΝ */}
            {activeTab === 'orders' && (
              <View style={styles.detailsUnifiedCard}>
                {/* Header */}
                <View style={styles.detailsInnerHeader}>
                  <Text style={styles.detailsInnerTitle}>Παραγγελίες</Text>
                  <View style={styles.detailsInnerActions}>
                    {ordersLoading ? (
                      <Text style={{ color: '#6B7280', fontWeight: '600' }}>Φόρτωση…</Text>
                    ) : (
                      <Text style={{ color: '#6B7280', fontWeight: '600' }}>
                        {orders.length} {orders.length === 1 ? 'παραγγελία' : 'παραγγελίες'}
                      </Text>
                    )}

                    {/* --- Κουμπί Τεμάχια --- */}
                    <TouchableOpacity
                      style={styles.editBtnInside}
                      onPress={() => {
                        Alert.alert('DEBUG', 'Άνοιγμα Τεμαχίων');
                        setItemsOpen(true);
                      }}
                    >
                      <Text style={styles.editBtnInsideText}>Τεμάχια</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Περιεχόμενο */}
                <View style={{ flex: 1, padding: 6 }}>
                  {ordersLoading ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyTitle}>Φόρτωση παραγγελιών…</Text>
                    </View>
                  ) : orders.length === 0 ? (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyTitle}>Δεν υπάρχουν παραγγελίες</Text>
                      <Text style={styles.emptySubtitle}>Δημιούργησε νέα παραγγελία από τη ροή παραγγελιών.</Text>
                    </View>
                  ) : (
                    <FlatList
                      data={orders}
                      keyExtractor={(it) => it.id}
                      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                      contentContainerStyle={{ paddingBottom: 24 }}
                      renderItem={({ item }) => (
                        <OrderCard
                          code={`#${item.id.slice(0, 6).toUpperCase()}`}
                          date={fmtDate(item.createdAt)}
                          total={fmtMoney(item.totalAmount)}
                          deposit={item.deposit != null ? fmtMoney(item.deposit) : '—'}
                          paymentMethod={item.paymentMethod || '—'}
                          notes={item.notes || null}
                          itemsCount={typeof item.itemsCount === 'number' ? item.itemsCount : null}
                          expanded={expandedOrderId === item.id}
                          onToggle={() => setExpandedOrderId(prev => prev === item.id ? null : item.id)}
                          onViewItems={() => Alert.alert('Προβολή τεμαχίων', `Παραγγελία ${item.id}`)}
                          onEdit={() => openOrderEdit(item)}
                          onClose={() => setExpandedOrderId(null)}
                          status={item.status || 'Νέα'}
                          hasDebt={!!item.hasDebt} 
                          onChangeStatus={async (v) => {

                            if (v === 'Παραδόθηκε') {
                              setConfirmDelivered({ orderId: item.id })
                              return
                            }

                            if (v === 'Έτοιμη') {
                              try {
                                if (!selectedCustomer) {

                                  setOrders(prev =>
                                    prev.map(o => (o.id === item.id ? { ...o, status: 'Έτοιμη', hasDebt: false } : o))
                                  )
                                  await updateOrder(item.id, { orderStatus: 'Έτοιμη', hasDebt: false }, userId)
                                  return
                                }

                                const allWashed = await allItemsWashedForOrder(selectedCustomer.id, item.id)
                                if (allWashed) {

                                  setOrders(prev =>
                                    prev.map(o => (o.id === item.id ? { ...o, status: 'Έτοιμη', hasDebt: false } : o))
                                  )
                                  await updateOrder(item.id, { orderStatus: 'Έτοιμη', hasDebt: false }, userId)
                                } else {
                                  // υπάρχουν "Άπλυτα" -> άνοιξε modal επιβεβαίωσης
                                  setConfirmReadyForce({ orderId: item.id })
                                }
                              } catch (e) {
                                console.error('updateOrder status failed', e)
                                Alert.alert('Σφάλμα', 'Η ενημέρωση κατάστασης απέτυχε.')
                              }
                              return
                            }

                            setOrders(prev =>
                              prev.map(o => (o.id === item.id ? { ...o, status: v, hasDebt: false } : o))
                            )
                            updateOrder(item.id, { orderStatus: v, hasDebt: false }, userId).catch((e) => {
                              console.error('updateOrder status failed', e)
                              Alert.alert('Σφάλμα', 'Η ενημέρωση κατάστασης απέτυχε.')
                            })
                          }}

                          onDeletePress={() => askDeleteOrder(item)}
                          receiptNumber={item.receiptNumber}
                        />
                      )}
                    />
                  )}
                </View>
              </View>
            )}


            {activeTab === 'history' && !showYearReport && (
              <View style={styles.detailsUnifiedCard}>
                {/* Header  */}
                <View style={styles.detailsInnerHeader}>
                  <Text style={styles.detailsInnerTitle}>Ιστορικό</Text>
                  <View style={{ flexDirection: 'row' }}>
                    
                    </View>
                </View>

                {/* Περιεχόμενο: μόνο λίστα ετών */}
                {histLoading ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Φόρτωση ιστορικού…</Text>
                  </View>
                ) : ordersByYear.size === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Δεν υπάρχουν δεδομένα ιστορικού</Text>
                    <Text style={styles.emptySubtitle}>Μόλις δημιουργηθούν παραγγελίες θα εμφανιστούν εδώ.</Text>
                  </View>
                ) : (
                  <FlatList
                    data={years}
                    keyExtractor={(y) => String(y)}
                    ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                    contentContainerStyle={{ padding: 10, paddingBottom: 24 }}
                    renderItem={({ item: y }) => {
                      const { count, totalAmount } = totalsForYear(y)
                      return (
                        <YearRow
                          year={y}
                          subtitle={`${count} ${count === 1 ? 'παραγγελία' : 'παραγγελίες'} · ${fmtMoney(totalAmount)}`}
                          onPress={() => {
                            setYearOpen(y)
                            setShowYearReport(true)
                          }}
                        />

                      )
                    }}
                  />
                )}
              </View>
            )}





          </View>
        </View>
      </Modal>

      {/*  Modal: item list */}
      <Modal
        visible={itemsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setItemsOpen(false)}
      >
        <View style={styles.detailsBackdrop}>
          <View style={styles.itemsCard}>
            {/* Header */}
            <View style={styles.itemsHeaderRow}>
              <Text style={styles.itemsTitle}>Τεμάχια πελάτη</Text>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => setItemsOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </Pressable>
            </View>

            {/* Body */}
            <View style={{ flex: 1 }}>
              {itemsLoading ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Φόρτωση τεμαχίων…</Text>
                </View>
              ) : items.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Δεν υπάρχουν τεμάχια</Text>
                  <Text style={styles.emptySubtitle}>Πρόσθεσε τεμάχια μέσα από τις παραγγελίες.</Text>
                </View>
              ) : (
                <FlatList
                  data={items}
                  keyExtractor={(it) => it.id}
                  ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.itemRow}
                      activeOpacity={0.8}
                      onPress={() => {
                        setSelectedItem(item)
                        setItemEdit({
                          item_code: item.item_code || '',
                          category: item.category || '',
                          color: item.color || '',
                          price: item.price != null ? String(item.price) : '',
                          status: item.status || '',
                          storage_status: item.storage_status || '',
                          order_date: item.order_date || '',
                        })
                      }}
                    >
                      <View style={styles.itemIconBox}>
                        <Ionicons name="cube-outline" size={20} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.itemCode}>
                          {item.item_code || `#${item.id.slice(0,6).toUpperCase()}`}
                        </Text>
                        <Text style={styles.itemDate}>{fmtDate(item.created_at)}</Text>
                      </View>
                      <Text style={styles.itemPrice}>{fmtMoney(item.price)}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </View>
        </View>
      </Modal>


      {/*  Modal: edit items */}
      <Modal
        visible={!!selectedItem}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={styles.detailsBackdrop}>
          <View style={styles.itemEditCard}>
            {/* Header με actions δεξιά */}
            <View style={styles.itemEditHeader}>
              <Text style={styles.itemsTitle}>Επεξεργασία τεμαχίου</Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity
                onPress={() => setSelectedItem(null)}
                style={styles.actionGhostBtn}
              >
                <Ionicons name="close" size={18} color="#6B7280" style={{ marginRight: 6 }} />
                <Text style={styles.actionGhostText}>Ακύρωση</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!selectedItem) return
                  try {
                    const priceNum = itemEdit.price.trim()
                      ? Number(itemEdit.price.replace(',', '.'))
                      : 0

                    await updateOrderItem(selectedItem.id, {
                      item_code: itemEdit.item_code,
                      category: itemEdit.category,
                      color: itemEdit.color,
                      price: priceNum,
                      status: itemEdit.status,
                      storage_status: itemEdit.storage_status,
                      order_date: itemEdit.order_date,
                    })

                    setItems(prev => prev.map(it =>
                      it.id === selectedItem.id
                        ? {
                            ...it,
                            item_code: itemEdit.item_code,
                            category: itemEdit.category,
                            color: itemEdit.color,
                            price: priceNum,
                            status: itemEdit.status,
                            storage_status: itemEdit.storage_status,
                            order_date: itemEdit.order_date,
                          }
                        : it
                    ))

                    Alert.alert('OK', 'Το τεμάχιο ενημερώθηκε.')
                    setSelectedItem(null)
                  } catch (e) {
                    console.error('updateOrderItem failed', e)
                    Alert.alert('Σφάλμα', 'Η αποθήκευση απέτυχε.')
                  }
                }}
                style={styles.actionPrimaryBtn}
                activeOpacity={0.9}
              >
                <Ionicons name="save-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.actionPrimaryText}>Αποθήκευση</Text>
              </TouchableOpacity>
            </View>

            {/* Σώμα: 2 στήλες */}
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
              <View style={styles.itemFormGrid}>
                {/* Αριστερή στήλη */}
                <View style={styles.itemCol}>
                  <Text style={styles.smallLabel}>Κωδικός</Text>
                  <View style={styles.filledInput}>
                    <TextInput
                      value={itemEdit.item_code}
                      onChangeText={(v) => setItemEdit(s => ({ ...s, item_code: v }))}
                      style={styles.filledInputText}
                      placeholder="π.χ. PAP002"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>

                  <Text style={styles.smallLabel}>Χρώμα</Text>
                  <SimpleDropdown
                    value={itemEdit.color}
                    placeholder="Επιλέξτε χρώμα"
                    options={COLOR_OPTIONS}
                    onChange={(v) => setItemEdit(s => ({ ...s, color: v }))}
                  />

                  <Text style={styles.smallLabel}>Ημ/νία Παραγγελίας</Text>
                  <View style={styles.filledInput}>
                    <TextInput
                      value={itemEdit.order_date}
                      onChangeText={(v) => setItemEdit(s => ({ ...s, order_date: v }))}
                      style={styles.filledInputText}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>

                {/* Δεξιά στήλη */}
                <View style={styles.itemCol}>
                  <Text style={styles.smallLabel}>Κατηγορία</Text>
                  <SimpleDropdown
                    value={itemEdit.category}
                    placeholder="Επιλέξτε κατηγορία"
                    options={CATEGORY_OPTIONS}
                    onChange={(v) => setItemEdit(s => ({ ...s, category: v }))}
                  />

                  <Text style={styles.smallLabel}>Ράφι</Text>
                  <SimpleDropdown
                    value={itemEdit.storage_status}
                    placeholder="Επιλέξτε κατάσταση αποθήκευσης"
                    options={STORAGE_STATUS}
                    onChange={(v) => setItemEdit(s => ({ ...s, storage_status: v }))}
                  />

                  <Text style={styles.smallLabel}>Τιμή</Text>
                  <View style={styles.filledInput}>
                    <TextInput
                      value={itemEdit.price}
                      onChangeText={(v) => setItemEdit(s => ({ ...s, price: v }))}
                      style={styles.filledInputText}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                </View>
              </View>

              {/* Μία ακόμη σειρά πλήρους πλάτους */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.smallLabel}>Κατάσταση</Text>
                <SimpleDropdown
                  value={itemEdit.status}
                  placeholder="Επιλέξτε κατάσταση"
                  options={STATUS}
                  onChange={(v) => setItemEdit(s => ({ ...s, status: v }))}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      

      {/*  Confirm Delete Modal */}
      <ConfirmModal
        visible={confirmOpen}
        title="Επιβεβαίωση"
        message={`Θέλεις σίγουρα να διαγράψεις τον «${pendingName}»; Η ενέργεια δεν μπορεί να αναιρεθεί.`}
        confirmText="Διαγραφή"
        cancelText="Άκυρο"
        onCancel={() => {
          setConfirmOpen(false)
          setPendingDeleteId(null)
        }}
        onConfirm={confirmDeleteNow}
      />

      {/*  History */}
      <Modal
        visible={filtersOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFiltersOpen(false)}
      >
        <View style={styles.detailsBackdrop}>
          <View
            style={[
              styles.filtersCard,
              {
                maxWidth: 720,
                width: '90%',
                height: 600,             
                borderRadius: 18,
                backgroundColor: '#fff',
                paddingHorizontal: 14,
                paddingTop: 10,
                paddingBottom: 6,
              },
            ]}
          >
            
            
          </View>
        </View>
      </Modal>


      {/* Full-screen Year Report */}
      <Modal
        visible={showYearReport && yearOpen != null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowYearReport(false)}
      >
        <View style={styles.detailsBackdrop}>
          <View style={[styles.detailsCardXL, { paddingHorizontal: 0, paddingTop: 0 }]}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderColor: '#E5E7EB' }}>
              <TouchableOpacity onPress={() => setShowYearReport(false)} style={[styles.actionGhostBtn, { paddingHorizontal: 8 }]}>
                <Ionicons name="arrow-back" size={18} color="#6B7280" style={{ marginRight: 6 }} />
                <Text style={styles.actionGhostText}>Πίσω</Text>
              </TouchableOpacity>

              <Text style={[styles.detailsInnerTitle, { flex: 1, textAlign: 'center' }]}>
                Αναφορά έτους {yearOpen ?? '—'} — {fullName}
              </Text>

              <TouchableOpacity
                onPress={() => {
                if (yearOpen != null) {

                  exportHistoryYearPDF(yearOpen)

                  const exportData = {
                    customerId: selectedCustomer?.id ?? '',
                    year: yearOpen,
                    filters: appliedFilters,
                  }

                  logExportHistoryPDF(userId, exportData)
                    .catch((e) => console.warn('logExportHistoryPDF failed:', e))
                }
              }}
                style={styles.actionPrimaryBtn}
                activeOpacity={0.9}
              >
                <Ionicons name="print-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.actionPrimaryText}>Εξαγωγή pdf</Text>
              </TouchableOpacity>
            </View>

            {/* Σώμα — μόνο τα στοιχεία του έτους */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
              {yearOpen != null && (() => {
                const { totals, cat, color, ordersOfYear, itemsOfYear } = computeYearData(yearOpen)
                return (
                  <View>
                    {renderYearDetail(yearOpen)}
                    
                  </View>
                )
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* hasdept */}
      <DeliveryConfirmModal
        visible={!!confirmDelivered}
        onCancel={async () => {
          // ΌΧΙ = δεν πλήρωσε → Παραδόθηκε + hasDebt: true
          const id = confirmDelivered?.orderId
          if (id) {
            setOrders(prev =>
              prev.map(o =>
                o.id === id ? { ...o, status: 'Παραδόθηκε', hasDebt: true } : o
              )
            )
            try {
              await updateOrder(id, { orderStatus: 'Παραδόθηκε', hasDebt: true }, userId)
            } catch (e) {
              console.error('updateOrder (delivered, debt) failed', e)
              Alert.alert('Σφάλμα', 'Η ενημέρωση κατάστασης απέτυχε.')
            }
          }
          setConfirmDelivered(null)

          // 2nd pop up
          if (selectedCustomer?.id && id) {
            setReturnsPrompt({ customerId: selectedCustomer.id, orderId: id })
          }
        }}
        onConfirm={async () => {
          // ΝΑΙ = πλήρωσε --> Παραδόθηκε + hasDebt: false
          const id = confirmDelivered?.orderId
          if (id) {
            setOrders(prev =>
              prev.map(o =>
                o.id === id ? { ...o, status: 'Παραδόθηκε', hasDebt: false } : o
              )
            )
            try {
              await updateOrder(id, { orderStatus: 'Παραδόθηκε', hasDebt: false }, userId)
            } catch (e) {
              console.error('updateOrder (delivered, paid) failed', e)
              Alert.alert('Σφάλμα', 'Η ενημέρωση κατάστασης απέτυχε.')
            }
          }
          setConfirmDelivered(null)

          //  2nd pop up
          if (selectedCustomer?.id && id) {
            setReturnsPrompt({ customerId: selectedCustomer.id, orderId: id })
          }
        }}
      />

      {/* if not returned items */}
      <ReturnsConfirmModal
        visible={!!returnsPrompt}
        onYes={() => {
          const { customerId, orderId } = returnsPrompt!
          setPendingReturnsByCustomer(prev => {
            const list = prev[customerId] || []
            return { ...prev, [customerId]: list.includes(orderId) ? list : [...list, orderId] }
          })
          setReturnsPrompt(null)
        }}
        onNo={() => {
          const { customerId, orderId } = returnsPrompt!
          setPendingReturnsByCustomer(prev => {
            const list = prev[customerId] || []
            return { ...prev, [customerId]: list.filter(id => id !== orderId) }
          })
          setReturnsPrompt(null)
        }}
      />

    <OrderDeleteModal
      visible={!!confirmDeleteOrder}
      orderCode={confirmDeleteOrder?.code || '—'}
      onYes={() =>
        confirmDeleteOrder
          ? doDeleteOrderNow(confirmDeleteOrder.orderId)
          : undefined
      }
      onNo={() => setConfirmDeleteOrder(null)}
    />

    <ReadyForceConfirmModal
      visible={!!confirmReadyForce}
      onYes={async () => {
        if (!confirmReadyForce) return
        const orderId = confirmReadyForce.orderId
        setConfirmReadyForce(null)
        setOrders(prev => prev.map(o => (o.id === orderId ? { ...o, status: 'Έτοιμη', hasDebt: false } : o)))
        try {
          await updateOrder(orderId, { orderStatus: 'Έτοιμη', hasDebt: false }, userId)
        } catch (e) {
          console.error('updateOrder status failed', e)
          Alert.alert('Σφάλμα', 'Η ενημέρωση κατάστασης απέτυχε.')
        }
      }}
      onNo={() => setConfirmReadyForce(null)}
    />

      

    </Page>
  )
}


const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    gap: 10,
  },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },

  primaryBtnText: { 
    color: '#fff', 
    fontWeight: '400' 
  },

  cardPolish: {
  borderWidth: 0,
  borderColor: '#E5E7EB',
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  padding: 10,
},

sectionTitleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 6,
},
sectionBadge: {
  width: 28,
  height: 28,
  borderRadius: 14,
  backgroundColor: '#EFF6FF',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 8,
  borderWidth: 1,
  borderColor: '#DBEAFE',
},
sectionTitleText: {
  fontSize: 16,
  fontWeight: '400',
  color: '#111827',
},

sectionSubRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 6,
  paddingHorizontal: 2,
  gap: 0,
},
sectionSubText: {
  fontSize: 12,
  color: '#6B7280',
},
dotSep: {
  marginHorizontal: 6,
  color: '#9CA3AF',
  fontSize: 12,
},

groupTitle: {
  fontSize: 12,
  fontWeight: '800',
  color: '#374151',
  marginBottom: 8,
  marginTop: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
},

hairline: {
  height: 0.8,
  backgroundColor: '#E5E7EB',  
  marginVertical: 8,
},

notesViewBoxPolished: {
  borderWidth: 1.5,
  borderColor: '#E5E7EB',     // ίδιο γκρι με τα inputs
  backgroundColor: '#F9FAFB', // απαλό γκρι, όχι μπλε
  borderRadius: 10,           // ίδιο radius με τα υπόλοιπα
  paddingHorizontal: 10,
  paddingVertical: 8,
  minHeight: 160,
},


roHelperRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 8,
  gap: 6,
},
roHelperText: {
  fontSize: 12,
  color: '#6B7280',
},


  label: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '700',
    marginBottom: 6,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 260,
  },

  searchInput: { 
    flex: 1, 
    fontSize: 14, 
    color: '#111827' 
  },

  countText: { 
    marginTop: 8, 
    marginLeft: 14, 
    color: '#6B7280' 
  },

  panel: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 6px 14px rgba(0,0,0,0.06)' } as any,
    }) as object),
  },

  panelHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 10 
  },
  
  panelIcon: { 
    marginRight: 8 
  },
  
  panelTitle: { 
    fontSize: 16, 
    color: '#111827', 
    fontWeight: '700' 
  },

  emptyState: { 
    padding: 20, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  
  emptyTitle: { 
    fontSize: 15, 
    color: '#111827', 
    fontWeight: '700' 
  },
  
  emptySubtitle: { 
    fontSize: 13, 
    color: '#6B7280', 
    marginTop: 6 
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F1F1F3',
    borderRadius: 12,
    padding: 10,
    marginVertical: 6,
    backgroundColor: '#fff',
  },
  
  avatar: {
    width: 42, height: 42, borderRadius: 9999,
    backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },

  avatarText: { 
    color: colors.primary, 
    fontWeight: '800' 
  },
  
  rowTitle: { 
    fontSize: 14, 
    color: '#111827', 
    fontWeight: '400' 
  },
  
  detailsColumn: { 
    marginTop: 4 
  },
  
  detailText: { 
    fontSize: 12, 
    color: '#6B7280',
    marginTop: 2 
  },

  modalBackdrop: {
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 18
  },

  

  modalCard: {
    width: '45%', 
    maxWidth: 900,
    maxHeight: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 8 },
      web: { boxShadow: '0 18px 40px rgba(0,0,0,0.18)' } as any,
    }) as object),
  },

  modalHeader: { 
    alignItems: 'center', 
    marginBottom: 8 
  },
  
  modalTitle: { 
    fontSize: 18, 
    fontWeight: '800', 
    color: '#111827', 
    marginTop: 6 
  },
  
  modalSubtitle: { 
    fontSize: 13, 
    color: '#6B7280', 
    marginTop: 2 
  },

  row2: { 
    flexDirection: 'row', 
    gap: 10 
  },
  
  group: { 
    marginTop: 10 
  },
  
  groupHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 6 
  },
  
  inputWrap: { 
    marginVertical: 8 
  },

  input: {
    borderWidth: 2,
    borderColor: '#E5E7EB', 
    borderRadius: 10,
    paddingHorizontal: 10, 
    paddingVertical: 10, 
    fontSize: 14, 
    color: '#111827',
  },

  textarea: { 
    minHeight: 90, 
    textAlignVertical: 'top' 
  },

  noFocusRingWeb: Platform.select({
  web:  { outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent', boxShadow: 'none' },
  default: {}
}) as any,


detailsUnifiedCard: {
  flex: 1,
  backgroundColor: '#FFFFFF',
  borderWidth: 0,             
  borderRadius: 16,           
  paddingVertical: 8,         
  paddingHorizontal: 10,
  overflow: 'hidden',

  ...(Platform.select({
    ios: {
      shadowColor: '#000',
      shadowOpacity: 0.06,
      shadowOffset: { width: 0, height: 4 },
      shadowRadius: 8,
    },
    android: {
      elevation: 3,
    },
    web: {
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
    } as any,
  }) as object),
},


  /* Εσωτερική μπάρα ενεργειών μέσα στο card */
  detailsInnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  detailsInnerTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111827',
  },
  detailsInnerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editBtnInside: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  editBtnInsideText: {
    color: '#374151',
    fontWeight: '400',
  },
  cancelBtnInside: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  cancelBtnInsideText: {
    color: '#374151',
    fontWeight: '400',
  },
  saveBtnInside: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  saveBtnInsideText: {
    color: '#fff',
    fontWeight: '400',
  },

  detailsContentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
  },

    itemEditHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 8,
},
actionGhostBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#F3F4F6',
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 8,
  marginRight: 8,
},
actionGhostText: { color: '#374151', fontWeight: '600' },
actionPrimaryBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#22C55E',
  borderRadius: 10,
  paddingHorizontal: 14,
  paddingVertical: 9,
},
actionPrimaryText: { color: '#fff', fontWeight: '800' },

itemFormGrid: {
  flexDirection: 'row',
  gap: 14,
},
itemCol: {
  flex: 1,
},

smallLabel: {
  fontSize: 12,
  color: '#6B7280',
  fontWeight: '700',
  marginBottom: 6,
  marginTop: 8,
},

ddBackdrop: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.25)',
  justifyContent: 'center',
  alignItems: 'center',
  padding: 18,
},
ddCard: {
  width: '90%',
  maxWidth: 420,
  backgroundColor: '#fff',
  borderRadius: 14,
  padding: 12,
  ...(Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 8 },
    web: { boxShadow: '0 18px 40px rgba(0,0,0,0.18)' } as any,
  }) as object),
},
ddSearchBox: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  borderWidth: 2,
  borderColor: '#E5E7EB',
  borderRadius: 10,
  paddingHorizontal: 10,
  paddingVertical: 8,
  marginBottom: 8,
},
ddSearchInput: { flex: 1, fontSize: 14, color: '#111827' },
ddEmpty: { paddingVertical: 16, alignItems: 'center' },
ddEmptyText: { color: '#6B7280' },
ddOption: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: 12,
  paddingHorizontal: 8,
  borderRadius: 8,
},
ddOptionAlt: { backgroundColor: '#F9FAFB' },
ddOptionText: { color: '#111827', fontSize: 14 },
ddOptionTextSelected: { fontWeight: '800', color: colors.primary },


filledInput: {
  backgroundColor: '#F6F7F9',
  borderRadius: 12,
  borderWidth: 0,
  paddingHorizontal: 12,
  paddingVertical: 10,
},
filledInputText: {
  fontSize: 14,
  color: '#111827',
},

dropdownWrap: {
  backgroundColor: '#F6F7F9',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  position: 'relative',
},
dropdownIcon: {
  position: 'absolute',
  right: 10,
  top: 10,
},

// optionally, κάνε το modal λίγο πιο large/flat
itemEditCard: {
  width: '56%',
  maxWidth: 820,
  maxHeight: '82%',
  backgroundColor: '#fff',
  borderRadius: 16,
  padding: 14,
  ...(Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 6 },
    web: { boxShadow: '0 16px 38px rgba(0,0,0,0.14)' } as any,
  }) as object),
},

  colLeftScroll: {
    flex: 1,
    padding: 10,
    backgroundColor: '#F9FAFB',  
    borderRadius: 12,
  },


  detailsColRight: {
    flex: 1,
    backgroundColor: 'transparent',
    padding: 14,
    borderRadius: 10,
  },

  vDivider: {
    width: 1.5,
    backgroundColor: '#E5E7EB',
    alignSelf: 'stretch',
    borderRadius: 1,
  },

  readonlyInlineRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },

  readonlyBoxLite: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#F1F1F3',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: '#FAFAFB',
  },

  flex1: { flex: 1 },

  linkBtn: { 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 8, 
    backgroundColor: '#F3F4F6' 
  },
  linkBtnText: { 
    color: '#374151', 
    fontWeight: '400' 
  },
  addRow: { 
    flexDirection: 'row', 
    gap: 8, 
    marginTop: 6, 
    alignItems: 'center' 
  },
  removeBtn: { 
    paddingHorizontal: 10, 
    paddingVertical: 8, 
    backgroundColor: '#FEE2E2', 
    borderRadius: 8 
  },
  removeBtnText: { 
    color: '#DC2626', 
    fontWeight: '800' 
  },

  modalActions: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    marginTop: 10, 
    gap: 10 
  },
  secondaryBtn: { 
    backgroundColor: '#F3F4F6', 
    borderRadius: 10, 
    paddingHorizontal: 12, 
    paddingVertical: 10 
  },
  secondaryBtnText: { 
    color: '#374151', 
    fontWeight: '400' 
  },
  requiredNote: { 
    textAlign: 'center', 
    color: '#6B7280', 
    marginTop: 8 
  },

  // Customer details modal
  detailsBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  detailsCardXL: {
    width: '98%',
    maxWidth: 1200,
    height: '90%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 10 },
      web:   { boxShadow: '0 22px 50px rgba(0,0,0,0.20)' } as any,
    }) as object),
  },
  detailsHeaderName: {
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '400',
    color: '#111827',
    marginBottom: 12,
  },
  detailsTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    gap: 6,
  },
  tabFlex: { flex: 1 },
  tabBtnXL: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  tabBtnXLActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabTextXL: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  tabTextXLActive: {
    color: '#111827',
    fontWeight: '600',
  },

  /* Top actions bar */
  detailsActionsBar: {
    position: 'absolute',
    top: 3,
    right: 12,
    zIndex: 50,
    width: '100%',
    marginTop: 10,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },

  // --- Order list styles ---
  orderCard: {
    borderWidth: 2,
    borderColor: '#F1F1F3',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#FFFFFF',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 6px 12px rgba(0,0,0,0.04)' } as any,
    }) as object),
  },
  orderHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9999,
    marginRight: 8,
  },
  pillText: {
    color: '#1D4ED8',
    fontWeight: '800',
  },
  orderDateText: { color: '#6B7280' },
  orderTotalText: { fontWeight: '800', color: '#111827' },

  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8 as any,
    marginTop: 8,
  },
  badge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  badgeText: {
    color: '#111827',
    fontSize: 12,
  },

  orderDetailsBox: {
    marginTop: 10,
    borderTopWidth: 1.5,
    borderTopColor: '#E5E7EB',
    paddingTop: 10,
  },

  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  kvLabel: { color: '#6B7280', fontWeight: '700', fontSize: 12, marginRight: 10 },
  kvValue: { color: '#111827', fontSize: 14, fontWeight: '400', flexShrink: 1, textAlign: 'right' },

  orderNotes: { color: '#374151', marginTop: 2 },

  orderActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },

  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  actionBtnGhost: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  actionBtnGhostText: { color: '#374151', fontWeight: '400' },

  actionBtnPrimary: {
    backgroundColor: '#3B82F6',
  },
  actionBtnPrimaryText: { color: '#fff', fontWeight: '400' },

  actionBtnDanger: {
    backgroundColor: '#FEE2E2',
  },
  actionBtnDangerText: { color: '#B91C1C', fontWeight: '400' },

  rightTitle: { 
    fontSize: 12, 
    color: '#6B7280', 
    fontWeight: '800', 
    marginBottom: 8 
  },

  notesInput: {
    flex: 1,
    borderWidth: 2, borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 10,
    fontSize: 14, color: '#111827',
    minHeight: 220,
    textAlignVertical: 'top',
  },

  notesViewBox: {
    borderWidth: 2,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 220,
    backgroundColor: '#FAFAFB',
  },

  notesText: { 
    fontSize: 14, 
    color: '#111827', 
    lineHeight: 20 
  },

  placeholderArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#F1F1F3',
    borderRadius: 12,
  },

  placeholderText: { 
    color: '#6B7280', 
    fontSize: 14 
  },


  roLabel: { 
    fontSize: 12, 
    color: '#6B7280', 
    fontWeight: '700', 
    marginBottom: 2 
  },
  roValue: { 
    fontSize: 14, 
    color: '#111827' 
  },

  // --- styles για Τεμάχια ---
itemsCard: {
  width: '80%',
  maxWidth: 1000,
  height: '80%',
  backgroundColor: '#fff',
  borderRadius: 16,
  padding: 14,
  ...(Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 8 },
    web: { boxShadow: '0 18px 40px rgba(0,0,0,0.18)' } as any,
  }) as object),
},
itemsHeaderRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 8,
},
itemsTitle: {
  fontSize: 16,
  fontWeight: '700',
  color: '#111827',
},

itemRow: {
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 2,
  borderColor: '#F1F1F3',
  borderRadius: 12,
  padding: 10,
  backgroundColor: '#fff',
  ...(Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    android: { elevation: 2 },
    web: { boxShadow: '0 6px 12px rgba(0,0,0,0.04)' } as any,
  }) as object),
},
itemIconBox: {
  width: 42, height: 42, borderRadius: 12,
  backgroundColor: '#EEF2FF',
  alignItems: 'center', justifyContent: 'center',
},
itemCode: { fontSize: 14, color: '#111827', fontWeight: '700' },
itemDate: { fontSize: 12, color: '#6B7280', marginTop: 2 },
itemPrice: { fontSize: 14, color: '#111827', fontWeight: '800' },

noOutline: Platform.select({
  web:  { outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' },
  default: {}
}) as any,


yearBlock: {
  borderWidth: 2,
  borderColor: '#F1F1F3',
  borderRadius: 12,
  padding: 12,
  marginBottom: 16,
  backgroundColor: '#fff',
},
yearHeaderRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 8,
},
yearTitle: {
  fontSize: 16,
  fontWeight: '700',
  color: '#111827',
},
summaryRow: {
  flexDirection: 'row',
  gap: 10,
  marginBottom: 12,
},
summaryBox: {
  flex: 1,
  borderWidth: 2,
  borderColor: '#F1F1F3',
  borderRadius: 10,
  paddingHorizontal: 10,
  paddingVertical: 10,
  backgroundColor: '#FAFAFB',
},
summaryLabel: { fontSize: 12, color: '#6B7280', fontWeight: '700', marginBottom: 2 },
summaryValue: { fontSize: 16, color: '#111827', fontWeight: '800' },
summaryMuted: { fontSize: 16, color: '#9CA3AF', fontWeight: '700' },

cardSection: { marginTop: 8, paddingTop: 8, borderTopWidth: 1.5, borderTopColor: '#E5E7EB' },
sectionTitle: { fontSize: 14, color: '#111827', fontWeight: '700', marginBottom: 8 },
muted: { color: '#6B7280' },

legendWrap: { marginTop: 10, alignSelf: 'stretch' },
legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
legendDot: { width: 12, height: 12, borderRadius: 9999 },

 legendText: {
    fontSize: 14,
    color: '#111827',
  },
orderBriefRow: {
  paddingVertical: 6,
  borderBottomWidth: 1,
  borderBottomColor: '#F3F4F6',
},
orderBriefTitle: { fontWeight: '800', color: '#111827' },
orderBriefMeta: { color: '#6B7280', marginTop: 2, fontSize: 12 },

itemBriefRow: {
  paddingVertical: 6,
  borderBottomWidth: 1,
  borderBottomColor: '#F3F4F6',
},
itemBriefTitle: { fontWeight: '700', color: '#111827' },
itemBriefMeta: { color: '#6B7280', marginTop: 2, fontSize: 12 },

filtersCard: {
  width: '60%',
  maxWidth: 820,
  backgroundColor: '#fff',
  borderRadius: 14,
  padding: 14,
  ...(Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 8 },
    web: { boxShadow: '0 18px 40px rgba(0,0,0,0.18)' } as any,
  }) as object),
},

yearListRow: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 12,
  paddingHorizontal: 12,
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  borderWidth: 1.5,
  borderColor: '#E5E7EB',
},
yearListLeft: {
  flex: 1,
},
yearListTitle: {
  fontSize: 16,
  fontWeight: '800',
  color: '#111827',
},
yearListSub: {
  marginTop: 2,
  fontSize: 13,
  color: '#6B7280',
},

yearDetailHeader: {
  flexDirection: 'row',       // Οριζόντια διάταξη
  alignItems: 'center',       // Κεντραρισμένα κάθετα
  paddingHorizontal: 10,
  paddingBottom: 6,
},

ghostBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#F3F4F6', // Ανοιχτό γκρι
  borderRadius: 8,
  paddingHorizontal: 10,
  paddingVertical: 8,
  borderWidth: 1.5,
  borderColor: '#E5E7EB',
}, 
ghostBtnText: {
  color: '#374151',
  fontWeight: '600',
},

primaryTinyBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#3B82F6', // Μπλε accent (ίδιο με το υπόλοιπο UI σου)
  paddingHorizontal: 12,
  paddingVertical: 8,
  borderRadius: 8,
  marginLeft: 6,
},
primaryTinyBtnText: {
  color: '#fff',
  fontWeight: '700',
},

chip: {
  paddingHorizontal: 10,
  paddingVertical: 6,
  borderRadius: 9999,
  borderWidth: 1.5,
  borderColor: '#E5E7EB',
  backgroundColor: '#FFFFFF',
  marginRight: 6,
},
chipText: {
  color: '#374151',
  fontSize: 12,
},

/* ---------- Styles για τα Reusable UI bits (History) ---------- */

// SectionCard
sectionCard: {
  marginTop: 8,
  paddingTop: 8,
  borderTopWidth: 1.5,
  borderTopColor: '#E5E7EB',
},
sectionCardHeader: {
  flexDirection: 'row',
  alignItems: 'center',
},
sectionCardTitle: {
  fontSize: 14,
  color: '#111827',
  fontWeight: '700',
},

// StatTile
statRow: {
  flexDirection: 'row',
  gap: 10,
  marginBottom: 12,
},
statTile: {
  flex: 1,
  borderWidth: 2,
  borderColor: '#F1F1F3',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  backgroundColor: '#FAFAFB',
},
statTileLabel: {
  fontSize: 12,
  color: '#6B7280',
  fontWeight: '700',
  marginBottom: 2,
},
statTileValue: {
  fontSize: 16,
  color: '#111827',
  fontWeight: '800',
},



// YearRow (κάρτα έτους στη λίστα)
yearRowCard: {
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  borderWidth: 1.5,
  borderColor: '#E5E7EB',
  paddingVertical: 12,
  paddingHorizontal: 12,
  ...(Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    android: { elevation: 2 },
    web: { boxShadow: '0 6px 12px rgba(0,0,0,0.04)', cursor: 'pointer' } as any,
  }) as object),
},
yearBadge: {
  width: 32,
  height: 32,
  borderRadius: 8,
  backgroundColor: '#DBEAFE',
  alignItems: 'center',
  justifyContent: 'center',
},
yearBadgeText: {
  color: '#1D4ED8',
  fontWeight: '800',
  fontSize: 12,
},
yearRowTitle: {
  fontSize: 16,
  fontWeight: '800',
  color: '#111827',
},
yearRowSub: {
  marginTop: 2,
  fontSize: 13,
  color: '#6B7280',
},

entryCard: {
  flexDirection: 'row',
  alignItems: 'stretch',
  borderWidth: 1.5,
  borderColor: '#E5E7EB',
  borderRadius: 12,
  backgroundColor: '#FFFFFF',
  marginBottom: 8,
  ...(Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    android: { elevation: 2 },
    web: { boxShadow: '0 6px 12px rgba(0,0,0,0.04)' } as any,
  }) as object),
},
entryAccent: {
  width: 4,
  backgroundColor: '#93C5FD',
  borderTopLeftRadius: 12,
  borderBottomLeftRadius: 12,
},
entryBody: {
  flex: 1,
  paddingVertical: 10,
  paddingHorizontal: 10,
},
entryTopRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 4,
},
entryTitle: { fontSize: 14, color: '#111827', fontWeight: '800' },
entryDate: { fontSize: 12, color: '#6B7280' },
entryMetaRow: {
  flexDirection: 'row',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 2,
},
entryMeta: { fontSize: 12, color: '#374151' },
entryMetaStrong: { fontSize: 13, color: '#111827', fontWeight: '800' },

colorBadge: {
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1.5,
  borderColor: '#E5E7EB',
  borderRadius: 9999,
  paddingHorizontal: 8,
  paddingVertical: 4,
  backgroundColor: '#FFFFFF',
},
colorDot: {
  width: 10,
  height: 10,
  borderRadius: 9999,
  marginRight: 6,
},
colorBadgeText: { fontSize: 12, color: '#111827' },

  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 4,
  },
  inputError: {
    borderColor: '#EF4444',
    borderWidth: 2,
  },


  debtBox: {
  marginTop: 12,
  borderWidth: 1,
  borderColor: '#FECACA',
  backgroundColor: '#FEF2F2',
  borderRadius: 12,
  padding: 10,
},

debtTitle: {
  fontWeight: '600',
  fontSize: 14,
  color: '#991B1B',
  marginBottom: 6,
},

debtRow: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 6,
},

debtDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: '#DC2626',
  marginRight: 8,
},

debtText: {
  flex: 1,
  color: '#B91C1C',
  fontWeight: '600',
},

debtCode: {
  color: '#991B1B',
  fontWeight: '800',
},


returnsBox: {
  marginTop: 12,
  borderWidth: 1.5,
  borderColor: '#EAB308',       
  backgroundColor: '#FEF9C3',   
  borderRadius: 10,
  padding: 10,
},
returnsTitle: {
  fontWeight: '800',
  color: '#92400E',
  marginBottom: 4,
},
returnsText: {
  color: '#7C2D12',
},



})
