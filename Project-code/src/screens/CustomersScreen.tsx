import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { router } from 'expo-router'
import React, { useCallback, useMemo, useRef, useState } from 'react'
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
import AppHeader from '../components/AppHeader'
import ConfirmModal from '../components/ConfirmModal'
import Page from '../components/Page'
import { createCustomer, deleteCustomer, observeCustomers, updateCustomer } from '../services/customer'
import { listOrderItemsByCustomer, updateOrderItem } from '../services/orderItems'

import { observeOrdersByCustomer } from '../services/orders'
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

/*  Helpers */
const fmtDate = (isoOrMs: string | number) => {
  try {
    const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs)
    return isNaN(d.getTime()) ? '—' : d.toLocaleString('el-GR')
  } catch { return '—' }
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
}: {
  label: string
  value: string
  editable: boolean
  onChangeText?: (v: string) => void
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'decimal-pad'
}) {
  const inputRef = React.useRef<TextInput | null>(null)

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '700', marginBottom: 6 }}>
        {label}
      </Text>

      {editable ? (
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType || 'default'}
          underlineColorAndroid="transparent"
          onFocus={() => {
            // Web only
            if (Platform.OS === 'web') {
              (inputRef.current as any)?.setNativeProps?.({
                style: { outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent', boxShadow: 'none' },
              })
            }
          }}
          style={[
            {
              borderWidth: 2,
              borderColor: '#BFDBFE',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 10,
              fontSize: 14,
              color: '#111827',
            },
            styles.noFocusRingWeb, // NO focus ring on Web
          ]}
        />
      ) : (
        <View
          style={{
            borderWidth: 2,
            borderColor: '#BFDBFE',
            borderRadius: 10,
            paddingHorizontal: 10,
            paddingVertical: 10,
            backgroundColor: '#FAFAFB',
          }}
        >
          <Text style={{ fontSize: 14, color: '#111827' }}>{(value || '').trim() || '—'}</Text>
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

/* component: key/value line  */
function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  )
}

/*  component: OrderCard  */
function OrderCard({
  code, date, total, deposit, paymentMethod, notes, itemsCount,
  expanded, onToggle, onViewItems, onEdit, onClose,
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
          <KV label="Αριθμός τεμαχίων" value={typeof itemsCount === 'number' ? String(itemsCount) : '—'} />
          <KV label="Συνολικό κόστος" value={total} />
          <KV label="Προκαταβολή" value={deposit} />
          <KV label="Τρόπος πληρωμής" value={paymentMethod} />

          {notes ? <View style={{ height: 6 }} /> : null}
          {notes ? <Text style={styles.orderNotes}>{notes}</Text> : null}

          {/* action bar */}
          <View style={styles.orderActionsRow}>
            <TouchableOpacity onPress={onViewItems} style={[styles.actionBtn, styles.actionBtnGhost]}>
              <Text style={styles.actionBtnGhostText}>Προβολή τεμαχίων</Text>
            </TouchableOpacity>

            <View style={{ flex: 1 }} />

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

export default function CustomersScreen() {
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
  const [receiptNo, setReceiptNo] = useState('')     // -> notes
  const [pricePerSqm, setPricePerSqm] = useState('') // -> notes
  const [description, setDescription] = useState('') // -> notes

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
  const [edit, setEdit] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    address: '',
    afm: '',
    notesBase: '',     
    receiptNo: '',
    pricePerSqm: '',
  })

  // ADD: Items modal & edit state 
const [itemsOpen, setItemsOpen] = useState(false)
const [itemsLoading, setItemsLoading] = useState(false)
const [items, setItems] = useState<any[]>([])

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
    if (!detailsOpen || activeTab !== 'orders' || !selectedCustomer) return
    setOrdersLoading(true)

    const sub = observeOrdersByCustomer(selectedCustomer.id, { limit: 200 })
      .subscribe((rows: any[]) => {
        const mapped = rows.map((r: any) => ({
          id: r.id,                         // unique
          customerId: selectedCustomer.id,

          // camelCase 
          paymentMethod: r.paymentMethod,
          deposit: r.deposit,
          totalAmount: r.totalAmount,
          notes: r.notes ?? null,
          orderDate: r.orderDate,
          createdAt: r.createdAt,
          lastModifiedAt: r.lastModifiedAt,

          // itemsCount: (προαιρετικά αργότερα)
          itemsCount: null,
        }))
        setOrders(mapped)
        setOrdersLoading(false)
      })

    return () => sub.unsubscribe()
  }, [detailsOpen, activeTab, selectedCustomer])

  React.useEffect(() => {
    if (!itemsOpen || !selectedCustomer) return

    let cancelled = false
    const run = async () => {
      try {
        setItemsLoading(true)
        const rows: any[] = await listOrderItemsByCustomer(selectedCustomer.id, { limit: 1000 })
        if (cancelled) return

        const mapped = rows.map((r: any) => ({
          id: r.id,
          order_id: r.order_id,
          item_code: r.item_code ?? '',
          category: r.category ?? '',
          color: r.color ?? '',
          price: r.price ?? 0,
          status: r.status ?? '',
          storage_status: r.storage_status ?? '',
          order_date: r.order_date ?? '',
          created_at: r.created_at,
        }))
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

  // Filter results
  const results = useMemo(() => {
    const q = debounced.trim()
    if (!q) return customers

    if (isAFM(q)) return customers.filter(c => (c.afm ?? '').includes(q))
    if (isPhone(q)) return customers.filter(c => (c.phone ?? '').includes(q))

    const nq = normalize(q)
    return customers.filter(c => {
      const fullName = `${c.firstName} ${c.lastName}`.trim()
      const hay = [fullName, c.address ?? '', c.afm ?? '', c.phone ?? '', c.notes ?? '']
        .map(x => normalize(x))
        .join(' | ')
      return hay.includes(nq) || hay.indexOf(nq) >= 0
    })
  }, [debounced, customers])

  // Open create modal
  const onCreateCustomer = () => {
    setFirstName(''); setLastName('')
    setAddresses(['']); setPhones([''])
    setAfm(''); setReceiptNo(''); setPricePerSqm(''); setDescription('')
    setOpenForm(true)
  }

  // open customer card
  function openCustomerCard(customer: DBCustomer) {
    const { desc, receiptNo, pricePerSqm } = parseNotes(customer.notes)
    setSelectedCustomer(customer)
    setEdit({
      firstName: customer.firstName || '',
      lastName:  customer.lastName  || '',
      phone:     customer.phone     || '',
      address:   customer.address   || '',
      afm:       customer.afm       || '',
      notesBase: desc || '',
      receiptNo: receiptNo || '',
      pricePerSqm: pricePerSqm || '',
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
      afm:       selectedCustomer.afm       || '',
      notesBase: desc || '',
      receiptNo: receiptNo || '',
      pricePerSqm: pricePerSqm || '',
    })
    setEditMode(false)
  }

  // UPDATE customer
  async function saveEdit() {
    if (!selectedCustomer) return
    try {
      const newNotes = composeNotes(edit.notesBase, edit.receiptNo, edit.pricePerSqm)
      await updateCustomer(selectedCustomer.id, {
        firstName: edit.firstName.trim(),
        lastName:  edit.lastName.trim(),
        phone:     edit.phone.trim(),
        address:   edit.address.trim(),
        afm:       edit.afm.trim(),
        notes:     newNotes,
      })

      // sync modal
      setSelectedCustomer(prev =>
        prev ? {
          ...prev,
          firstName: edit.firstName.trim(),
          lastName:  edit.lastName.trim(),
          phone:     edit.phone.trim(),
          address:   edit.address.trim(),
          afm:       edit.afm.trim(),
          notes:     newNotes,
          lastModifiedAt: Date.now(),
        } : prev
      )
      setEditMode(false)
      Alert.alert('OK', 'Τα στοιχεία πελάτη ενημερώθηκαν.')
    } catch (e) {
      console.error('Update failed:', e)
      Alert.alert('Σφάλμα', 'Η αποθήκευση απέτυχε.')
    }
  }

  // edit customer's order
  function openOrderEdit(o: any) {
    setDetailsOpen(false);
    router.push({ pathname: '/editorder', params: { orderId: o.id } })
  }

  // Multi-input helpers
  const addAddress = () => setAddresses(prev => [...prev, ''])
  const addPhone = () => setPhones(prev => [...prev, ''])
  const updateAddress = (idx: number, val: string) =>
    setAddresses(prev => prev.map((a, i) => (i === idx ? val : a)))
  const updatePhone = (idx: number, val: string) =>
    setPhones(prev => prev.map((p, i) => (i === idx ? val : p)))
  const removeAddress = (idx: number) => setAddresses(prev => prev.filter((_, i) => i !== idx))
  const removePhone = (idx: number) => setPhones(prev => prev.filter((_, i) => i !== idx))

  // INSERT new customer (as-is)
  async function handleSaveCustomer() {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Σφάλμα', 'Το όνομα και το επώνυμο είναι υποχρεωτικά.')
      return
    }
    const cleanPhones = phones.map(p => p.trim()).filter(Boolean)
    const cleanAddresses = addresses.map(a => a.trim()).filter(Boolean)
    if (cleanPhones.length === 0) {
      Alert.alert('Σφάλμα', 'Πρέπει να προσθέσεις τουλάχιστον ένα τηλέφωνο.')
      return
    }
    if (cleanAddresses.length === 0) {
      Alert.alert('Σφάλμα', 'Πρέπει να προσθέσεις τουλάχιστον μία διεύθυνση.')
      return
    }
    if (!receiptNo.trim()) {
      Alert.alert('Σφάλμα', 'Το πεδίο "Αρ. Δελτίου Παραλαβής" είναι υποχρεωτικό.')
      return
    }

    const phone = cleanPhones.join(' | ')
    const address = cleanAddresses.join(' | ')
    const notesBlock = [
      description?.trim() || '',
      receiptNo ? `Receipt: ${receiptNo.trim()}` : '',
      pricePerSqm ? `€/m²: ${pricePerSqm.trim()}` : '',
    ].filter(Boolean).join(' | ')

    try {
      const rec = await createCustomer({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone,
        address,
        afm: afm.trim() || undefined,
        notes: notesBlock || undefined,
      })
      console.log('INSERT ok. new customer id:', rec.id)

      setOpenForm(false)
      Alert.alert('OK', 'Ο πελάτης προστέθηκε.')
    } catch (e) {
      console.error('Σφάλμα κατά την προσθήκη πελάτη:', e)
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
      await deleteCustomer(pendingDeleteId)
      console.log('🗑️ Customer deleted:', pendingDeleteId)
    } catch (e) {
      console.error('Delete failed:', e)
      Alert.alert('Σφάλμα', 'Η διαγραφή απέτυχε.')
    } finally {
      setConfirmOpen(false)
      setPendingDeleteId(null)
    }
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
      <View style={{ flex: 1, marginTop: 10 }}>
        <View style={styles.panel}>
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
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item }) => {
                const fullName = `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim()

                const firstPhone = (item.phone || '')
                  .split('|').map(s => s.trim()).filter(Boolean)[0] || ''
                const firstAddress = (item.address || '')
                  .split('|').map(s => s.trim()).filter(Boolean)[0] || ''

                return (
                  <TouchableOpacity style={styles.row} onPress={() => openCustomerCard(item)}>
                    {/* avatar */}
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(item.firstName?.[0] || item.lastName?.[0] || 'Π').toUpperCase()}
                      </Text>
                    </View>

                    {/* center info */}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>
                        <Highlight text={fullName || '—'} query={debounced} />
                      </Text>
                      <View style={styles.detailsColumn}>
                        <Text style={styles.detailText}>
                          {firstPhone ? `☎ ${firstPhone}` : '☎ —'}
                        </Text>
                        <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">
                          {firstAddress ? `📍 ${firstAddress}` : '📍 —'}
                        </Text>
                      </View>
                    </View>

                    {/* delete (X) */}
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
                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Όνομα *</Text>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    style={styles.input}
                    placeholder="Εισάγετε το όνομα"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Επώνυμο *</Text>
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    style={styles.input}
                    placeholder="Εισάγετε το επώνυμο"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>

              {/* Διευθύνσεις */}
              <View style={styles.group}>
                <View style={styles.groupHeader}>
                  <Text style={styles.label}>Διευθύνσεις *</Text>
                  <TouchableOpacity onPress={addAddress} style={styles.linkBtn}>
                    <Text style={styles.linkBtnText}>+ Προσθήκη</Text>
                  </TouchableOpacity>
                </View>
                {addresses.map((addr, idx) => (
                  <View key={`addr-${idx}`} style={styles.addRow}>
                    <TextInput
                      value={addr}
                      onChangeText={(v) => updateAddress(idx, v)}
                      style={[styles.input, styles.flex1]}
                      placeholder="Διεύθυνση"
                      placeholderTextColor={colors.muted}
                    />
                    {addresses.length > 1 && (
                      <TouchableOpacity onPress={() => removeAddress(idx)} style={styles.removeBtn}>
                        <Text style={styles.removeBtnText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
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
                        onChangeText={(v) => updatePhone(idx, v)}
                        style={[styles.input, styles.flex1]}
                        keyboardType="phone-pad"
                        placeholder="Τηλέφωνο"
                        placeholderTextColor={colors.muted}
                      />
                      {phones.length > 1 && (
                        <TouchableOpacity onPress={() => removePhone(idx)} style={styles.removeBtn}>
                          <Text style={styles.removeBtnText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>

                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>ΑΦΜ (προαιρετικό)</Text>
                  <TextInput
                    value={afm}
                    onChangeText={setAfm}
                    style={styles.input}
                    keyboardType="number-pad"
                    placeholder="9 ψηφία"
                    placeholderTextColor={colors.muted}
                    maxLength={9}
                  />
                </View>
              </View>

              {/* Αρ. Δελτίου & Τιμή/τ.μ. → notes */}
              <View style={styles.row2}>
                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Αρ. Δελτίου Παραλαβής *</Text>
                  <TextInput
                    value={receiptNo}
                    onChangeText={setReceiptNo}
                    style={styles.input}
                    placeholder="Αριθμός Δελτίου"
                    placeholderTextColor={colors.muted}
                  />
                </View>
                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Τιμή / τ.μ (προαιρετικό)</Text>
                  <TextInput
                    value={pricePerSqm}
                    onChangeText={setPricePerSqm}
                    style={styles.input}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              </View>

              {/* Περιγραφή → notes */}
              <View style={styles.inputWrap}>
                <Text style={styles.label}>Περιγραφή *</Text>
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
              <View style={styles.detailsUnifiedCard}>
                {/* Εσωτερική μπάρα ενεργειών μέσα στο ίδιο card */}
                <View style={styles.detailsInnerHeader}>
                  <Text style={styles.detailsInnerTitle}>Στοιχεία πελάτη</Text>
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
                  {/* ⬅️ Αριστερή στήλη: ΜΟΝΟ αυτή σκρολάρει */}
                  <ScrollView
                    style={styles.colLeftScroll}
                    contentContainerStyle={{ padding: 14, paddingBottom: 24 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                  >
                    <FieldRow label="Όνομα" value={edit.firstName} editable={editMode}
                      onChangeText={(v) => setEdit(s => ({ ...s, firstName: v }))} />
                    <FieldRow label="Επώνυμο" value={edit.lastName} editable={editMode}
                      onChangeText={(v) => setEdit(s => ({ ...s, lastName: v }))} />
                    <FieldRow label="Τηλέφωνο" value={edit.phone} editable={editMode}
                      keyboardType="phone-pad"
                      onChangeText={(v) => setEdit(s => ({ ...s, phone: v }))} />
                    <FieldRow label="Διεύθυνση" value={edit.address} editable={editMode}
                      onChangeText={(v) => setEdit(s => ({ ...s, address: v }))} />
                    <FieldRow label="ΑΦΜ" value={edit.afm} editable={editMode}
                      keyboardType="number-pad"
                      onChangeText={(v) => setEdit(s => ({ ...s, afm: v }))} />

                    <FieldRow label="Αρ. Δελτίου" value={edit.receiptNo} editable={editMode}
                      onChangeText={(v) => setEdit(s => ({ ...s, receiptNo: v }))} />
                    <FieldRow label="€/m²" value={edit.pricePerSqm} editable={editMode}
                      keyboardType="decimal-pad"
                      onChangeText={(v) => setEdit(s => ({ ...s, pricePerSqm: v }))} />

                    {/* read-only δίπλα-δίπλα */}
                    <View style={styles.readonlyInlineRow}>
                      <View style={styles.readonlyBoxLite}>
                        <Text style={styles.roLabel}>Δημιουργία</Text>
                        <Text style={styles.roValue}>
                          {selectedCustomer ? new Date(selectedCustomer.createdAt).toLocaleString('el-GR') : '—'}
                        </Text>
                      </View>
                      <View style={styles.readonlyBoxLite}>
                        <Text style={styles.roLabel}>Τελευταία αλλαγή</Text>
                        <Text style={styles.roValue}>
                          {selectedCustomer ? new Date(selectedCustomer.lastModifiedAt || selectedCustomer.createdAt).toLocaleString('el-GR') : '—'}
                        </Text>
                      </View>
                    </View>
                  </ScrollView>

                  {/* Divider */}
                  <View style={styles.vDivider} />

                  {/* ➡️ Δεξιά στήλη: ΣΤΑΘΕΡΗ (χωρίς scroll) */}
                  <View style={styles.detailsColRight}>
                    <Text style={styles.rightTitle}>Περιγραφή</Text>
                    {editMode ? (
                      <TextInput
                        style={styles.notesInput}
                        value={edit.notesBase}
                        onChangeText={(v) => setEdit(s => ({ ...s, notesBase: v }))}
                        placeholder="Προσθέστε περιγραφή…"
                        placeholderTextColor="#9CA3AF"
                        multiline
                      />
                    ) : (
                      <View style={styles.notesViewBox}>
                        <Text style={styles.notesText}>
                          {parseNotes(selectedCustomer?.notes).desc || '—'}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            )}

  

            {/* 🔁 ΛΙΣΤΑ ΠΑΡΑΓΓΕΛΙΩΝ */}
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
                          date={fmtDate(item.orderDate || item.createdAt)}
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
                        />
                      )}
                    />
                  )}
                </View>
              </View>
            )}


            {activeTab === 'history' && (
              <View style={styles.placeholderArea}>
                <Text style={styles.placeholderText}>Το ιστορικό θα προστεθεί αργότερα.</Text>
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
    fontWeight: '800' 
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
    borderWidth: 1.5,
    borderColor: '#E5E7EB', 
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',

    ...(Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08, 
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 10,
      },
      android: {
        elevation: 4, 
      },
      web: {
        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.08)', 
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
    flex: 1.2,
    minHeight: 0, 
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
    fontWeight: '800' 
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
    fontWeight: '800' 
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
  actionBtnGhostText: { color: '#374151', fontWeight: '600' },

  actionBtnPrimary: {
    backgroundColor: '#3B82F6',
  },
  actionBtnPrimaryText: { color: '#fff', fontWeight: '700' },

  actionBtnDanger: {
    backgroundColor: '#FEE2E2',
  },
  actionBtnDangerText: { color: '#B91C1C', fontWeight: '700' },

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

})
