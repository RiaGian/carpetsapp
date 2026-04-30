import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Image,
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

import { listCustomers } from '../services/customer'

import {
  createOrderItem,
  deleteOrderItem,
  listOrderItemsByOrder,
  updateOrderItem,
} from '../services/orderItems'
import {
  getOrderById,
  updateOrder,
} from '../services/orders'

/**  helpers/types */
type CustomerRow = {
  id: string
  firstName: string
  lastName: string
  phone?: string
  afm?: string
  address?: string
}

type OrderItemUI = {
  categoryOpen: boolean
  category: string | null
  qty: string
  date: string
  colorOpen: boolean
  color: string | null
}
const makeEmptyOrder = (): OrderItemUI => ({
  categoryOpen: false,
  category: null,
  qty: '1',
  date: '',
  colorOpen: false,
  color: null,
})

type PieceItem = {
  id?: string
  category: string | null
  cost: string
  color?: string
  code?: string
  shelf?: string
  status?: 'άπλυτο' | 'πλυμένο'
  workType?: 'Επιστροφή' | 'Φύλλαξη'
  saved?: boolean          // already existed item
  newlyAdded?: boolean     // new item added
  dirty?: boolean          
}

const ddmmyyyy = (d = new Date()) => {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export default function EditOrderScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  const [loading, setLoading] = useState(true)

  // customer
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [customerModalOpen, setCustomerModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null) // κρατάμε id

  // header / payment / notes
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null)
  const [depositEnabled, setDepositEnabled] = useState(false)
  const [depositAmount, setDepositAmount] = useState('')
  const [notes, setNotes] = useState('')

  // Orders details (UI)
  const categoryLabels = ['Χαλί', 'Μοκέτα', 'Πάπλωμα', 'Κουβέρτα', 'Διαδρομάκι', 'Φλοκάτι']
  const colorLabels = ['Κόκκινο', 'Μπλε', 'Πράσινο', 'Κίτρινο', 'Μαύρο', 'Άσπρο', 'Γκρι', 'Καφέ', 'Μπεζ', 'Ροζ']
  const [orders, setOrders] = useState<OrderItemUI[]>([makeEmptyOrder()])
  const updateOrderUI = (index: number, patch: Partial<OrderItemUI>) => {
    setOrders(prev => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)))
  }
  const addOrderUI = () => setOrders(prev => [...prev, makeEmptyOrder()])
  const removeOrderUI = (index: number) => {
    setOrders(prev => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }
  const onChangeOrderDateAt = (index: number, txt: string) => {
    const digits = txt.replace(/\D/g, '').slice(0, 8)
    let out = ''
    for (let i = 0; i < digits.length; i++) {
      out += digits[i]
      if (i === 1 || i === 3) out += '/'
    }
    updateOrderUI(index, { date: out })
  }

  // pieces 
  const [piecesVisible, setPiecesVisible] = useState(true)
  const [pieces, setPieces] = useState<PieceItem[]>([])
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]) 

  // modal of piece
  const [pieceModalOpen, setPieceModalOpen] = useState(false)
  const [pieceModalIndex, setPieceModalIndex] = useState<number | null>(null)
  const [pieceForm, setPieceForm] = useState({
    color: '',
    code: '',
    shelf: '',
    status: 'άπλυτο' as 'άπλυτο' | 'πλυμένο',
    workType: 'Επιστροφή' as 'Επιστροφή' | 'Φύλλαξη',
  })
  const [statusOpen, setStatusOpen] = useState(false)
  const activePiece = pieceModalIndex !== null ? pieces[pieceModalIndex] : null
  const activeCategory = activePiece?.category ?? null

  const paymentLabels: Record<string, string> = {
    card: 'Κάρτα',
    cash: 'Μετρητά',
    bank: 'Τραπεζική κατάθεση',
    mixed: 'Μικτός τρόπος πληρωμής',
  }

  const paymentOptions = ['cash', 'card', 'bank', 'mixed'] as const
    const [paymentOpen, setPaymentOpen] = useState(false)


  /**  LOAD (order + items)*/
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        const order = await getOrderById(orderId)
        const items = await listOrderItemsByOrder(orderId)

        setSelectedCustomer(order.customerId || null)
        setPaymentMethod(order.paymentMethod || null)
        setDepositAmount(order.deposit?.toString() ?? '')
        setDepositEnabled(!!order.deposit && order.deposit > 0)
        setNotes(order.notes || '')

        setOrders([{
          ...makeEmptyOrder(),
          date: order.orderDate || '',
        }])

        const mapped: PieceItem[] = items.map((it: any) => ({
          id: it.id,
          category: it.category ?? null,
          color: it.color ?? '',
          code: it.item_code ?? '',
          shelf: it.shelf ?? '',
          status: (it.status as ('άπλυτο' | 'πλυμένο')) ?? 'άπλυτο',
          workType: (it.storage_status as ('Επιστροφή' | 'Φύλλαξη')) ?? 'Επιστροφή',
          cost: (typeof it.price === 'number' ? it.price.toFixed(2) : (it.price ?? '0.00')).toString(),
          saved: true,
          newlyAdded: false,
          dirty: false,
        }))
        if (!cancelled) {
          setPieces(mapped)
          setPiecesVisible(true)
          setRemovedItemIds([]) 
        }
      } catch (err) {
        console.error('❌ loadData error:', err)
        Alert.alert('Σφάλμα', 'Αποτυχία φόρτωσης της παραγγελίας.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()

    // clean when out
    return () => {
      cancelled = true
      // επαναφορά state
      setPieces([])
      setRemovedItemIds([])
      setSelectedCustomer(null)
      setPaymentMethod(null)
      setDepositAmount('')
      setDepositEnabled(false)
      setNotes('')
      setOrders([makeEmptyOrder()])
    }
  }, [orderId])

  /**  Load customers  */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows: any[] = await listCustomers(500)
        if (cancelled) return
        const mapped: CustomerRow[] = rows.map((r: any) => ({
          id: r.id ?? r._raw?.id ?? '',
          firstName: r.firstName ?? r._raw?.first_name ?? '',
          lastName: r.lastName ?? r._raw?.last_name ?? '',
          phone: r.phone ?? r._raw?.phone ?? '',
          afm: r.afm ?? r._raw?.afm ?? '',
          address: r.address ?? r._raw?.address ?? '',
        }))
        setCustomers(mapped)
      } catch (err) {
        console.warn('Failed to load customers:', err)
      }
    })()
    return () => { cancelled = true }
  }, [])

  /** derived values  */
  const qtySum = useMemo(() => pieces.length, [pieces])
  const totalCost = useMemo(() => {
    const sum = pieces.reduce((acc, p) => {
      const v = parseFloat((p.cost || '').toString().replace(',', '.'))
      return acc + (isNaN(v) ? 0 : v)
    }, 0)
    return sum.toFixed(2)
  }, [pieces])

  const onChangeDeposit = (t: string) => {
    const cleaned = t.replace(/[^\d.,]/g, '')
    setDepositAmount(cleaned)
    if (!depositEnabled) setDepositEnabled(true)
    }

    const balance = useMemo(() => {
    const dep = depositEnabled
        ? parseFloat((depositAmount || '0').replace(',', '.')) || 0
        : 0
    const tot = parseFloat(totalCost) || 0
    return Math.max(0, tot - dep).toFixed(2)
    }, [totalCost, depositAmount, depositEnabled])

  const selectedCustomerDisplay = useMemo(() => {
    if (!selectedCustomer) return 'Επιλέξτε Πελάτη'
    const c = customers.find(x => x.id === selectedCustomer)
    if (!c) return 'Επιλέξτε Πελάτη'
    const full = `${c.firstName} ${c.lastName}`.trim() || '—'
    const phone = c.phone || ''
    return phone ? `${full} - ${phone}` : full
  }, [customers, selectedCustomer])

  /** pieces helpers*/
  const stepPieceCost = (index: number, delta: number) => {
    setPieces(prev =>
      prev.map((p, i) => {
        if (i !== index) return p
        const val = parseFloat((p.cost || '0').toString().replace(',', '.')) || 0
        const next = Math.max(0, val + delta)
        return { ...p, cost: next.toFixed(2), dirty: true }
      })
    )
  }

  const updatePiece = (index: number, patch: Partial<PieceItem>) => {
    setPieces(prev => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  const removePiece = (index: number) => {
    setPieces(prev => {
        const copy = [...prev]
        const toRemove = copy[index]

        if (toRemove?.id) {
        setRemovedItemIds(ids =>
            ids.includes(toRemove.id!) ? ids : [...ids, toRemove.id!]
        )
        }

        copy.splice(index, 1)
        return copy
    })

    if (pieceModalOpen && pieceModalIndex === index) closePieceModal()
    else if (pieceModalOpen && pieceModalIndex !== null && pieceModalIndex > index) {
        setPieceModalIndex(pieceModalIndex - 1)
    }
    }

  /** add pieces (no saved yet) */
  const addPiecesForOrder = (ord: OrderItemUI) => {
    const n = parseInt((ord.qty || '1').toString(), 10)
    const count = isNaN(n) || n < 1 ? 1 : n

    const newOnes: PieceItem[] = Array.from({ length: count }).map(() => ({
      category: ord.category ?? null,
      color: ord.color ?? '',
      code: '',
      cost: '0.00',
      status: 'άπλυτο',
      workType: 'Επιστροφή',
      saved: false,
      newlyAdded: true,
      dirty: true, 
    }))

    setPieces(prev => [...prev, ...newOnes])
    setPiecesVisible(true)
    Alert.alert('OK', count === 1 ? 'Προστέθηκε 1 τεμάχιο (μη αποθηκευμένο).' : `Προστέθηκαν ${count} τεμάχια (μη αποθηκευμένα).`)
  }

  /** piece modal open/close/save */
  const openPieceModalFor = (index: number) => {
    setPieceModalIndex(index)
    const p = pieces[index]
    setPieceForm({
      color: p.color ?? '',
      code: p.code ?? '',
      shelf: p.shelf ?? '',
      status: p.status ?? 'άπλυτο',
      workType: p.workType ?? 'Επιστροφή',
    })
    setPieceModalOpen(true)
  }

  const closePieceModal = () => {
    setPieceModalOpen(false)
    setPieceModalIndex(null)
    setStatusOpen(false)
  }

  const isCodeValid = () => {
    const up = (pieceForm.code || '').trim().toUpperCase()
    return up === '' || /^[A-ZΑ-Ω]{3}\d{3}$/.test(up)
  }

  // not saved in db yes
  const savePieceModal = () => {
    if (pieceModalIndex === null) return
    const active = pieces[pieceModalIndex]
    if (!active) return

    if (!pieceForm.color.trim()) {
      Alert.alert('Προσοχή', 'Το πεδίο Χρώμα είναι υποχρεωτικό.')
      return
    }
    const upCode = (pieceForm.code || '').toUpperCase()
    if (upCode && !/^[A-ZΑ-Ω]{3}\d{3}$/.test(upCode)) {
      Alert.alert('Προσοχή', 'Ο Κωδικός πρέπει να είναι της μορφής XXX999 (π.χ. CHR001).')
      return
    }

    updatePiece(pieceModalIndex, {
      color: pieceForm.color.trim(),
      code: upCode,
      shelf: (pieceForm.shelf || '').toUpperCase(),
      status: pieceForm.status,
      workType: pieceForm.workType,
      dirty: true,
    })

    closePieceModal()
  }

  /**  Save Order */
  const onSave = async () => {
    try {
        //  DELETE 
        if (removedItemIds.length) {
        for (const id of removedItemIds as string[]) {
            await deleteOrderItem(id, orderId, 'system')
        }
        }

        // INSERT  (new)
        const toInsert = pieces.filter(p => !p.id)
        if (toInsert.length) {
        const created: any[] = []
        for (const p of toInsert) {
            const rec = await createOrderItem({
            orderId,
            item_code: (p.code || '').toUpperCase(),
            category: p.category ?? '',
            color: p.color ?? '',
            price: parseFloat((p.cost || '0').toString().replace(',', '.')) || 0,
            status: p.status ?? 'άπλυτο',
            storage_status: p.workType ?? 'Επιστροφή',
            })
            created.push(rec)
        }
        //  ids & clear flags 
        if (created.length) {
            let k = 0
            setPieces(prev =>
            prev.map(px => {
                if (!px.id) {
                const rec = created[k++]
                return { ...px, id: rec.id, saved: true, newlyAdded: false, dirty: false }
                }
                return px
            })
            )
        }
        }

        //  UPDATE  id & dirty 
        const toUpdate = pieces.filter(p => p.id && p.dirty && !removedItemIds.includes(p.id!))
        if (toUpdate.length) {
        for (const p of toUpdate) {
            await updateOrderItem(p.id!, {
            item_code: (p.code || '').toUpperCase(),
            category: p.category ?? '',
            color: p.color ?? '',
            price: parseFloat((p.cost || '0').toString().replace(',', '.')) || 0,
            status: p.status ?? 'άπλυτο',
            storage_status: p.workType ?? 'Επιστροφή',
            })
        }
        // clean flags
        setPieces(prev => prev.map(p => p.id ? { ...p, dirty: false, saved: true, newlyAdded: false } : p))
        }

        // UPDATE ORDER header 
        await updateOrder(orderId, {
        customerId: selectedCustomer || undefined,
        orderDate: orders[0]?.date && orders[0].date.length === 10 ? orders[0].date : undefined,
        notes,
        paymentMethod: paymentMethod ?? 'cash',
        deposit: depositEnabled ? parseFloat((depositAmount || '0').replace(',', '.')) || 0 : 0,
        totalAmount: parseFloat(totalCost),
        })

        // clear queue deletion
        setRemovedItemIds([])

       if (Platform.OS === 'web') {
        //  web 
        Alert.alert('✅', `Η παραγγελία #${orderId} ενημερώθηκε.`)

        router.push('/customers' as any)
        } else {
        //  mobile (iOS/Android)
        Alert.alert('✅', `Η παραγγελία #${orderId} ενημερώθηκε.`, [
            { text: 'OK', onPress: () => router.push('/customers' as any) },
        ])
        }  
        } catch (err) {
        console.error(' onSave error:', err)
        Alert.alert('Σφάλμα', 'Η αποθήκευση απέτυχε.')
        }
    }

  if (loading) {
    return (
      <Page>
        <AppHeader />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text>Φόρτωση παραγγελίας...</Text>
        </View>
      </Page>
    )
  }

  const toggleDeposit = () => {
    setDepositEnabled(prev => {
      const next = !prev
      if (!next) setDepositAmount('')
      return next
    })
  }

  return (
    <Page>
      <AppHeader showBack />

      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.containerScroll}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {/* ===== Τίτλοι ===== */}
        <View style={styles.textSection}>
          <Text style={styles.title}>Επεξεργασία Παραγγελίας</Text>
          <Text style={styles.subtitle}>
            Ενημερώστε την παραγγελία <Text style={styles.mono}>#{orderId?.slice(0, 6)?.toUpperCase?.()}</Text>
          </Text>
        </View>

        {/* ===== Στοιχεία Πελάτη (ίδιο flow με δημιουργία) ===== */}
        <View style={styles.cardBox}>
          <Text style={styles.inputLabel}>Πελάτης</Text>
          <Pressable onPress={() => setCustomerModalOpen(true)} style={styles.fakeInput}>
            <Text numberOfLines={1} style={[styles.fakeInputText, !selectedCustomer && { color: '#999' }]}>
              {selectedCustomerDisplay}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#666" />
          </Pressable>
        </View>

        {/* ===== Στοιχεία Παραγγελίας ===== */}
        {orders.map((ord, idx) => {
          const isLast = idx === orders.length - 1
          const canRemove = orders.length > 1 && idx > 0
          return (
            <View key={`order-${idx}`} style={[styles.cardBox, styles.cardBoxLarge, { marginTop: 16 }]}>
              <View style={styles.orderIconFab}>
                <Ionicons name="calendar-outline" size={22} color="#fff" />
              </View>

              {isLast && (
                <Pressable onPress={addOrderUI} style={styles.addOrderFab}>
                  <Ionicons name="add" size={22} color="#fff" />
                </Pressable>
              )}
              {canRemove && (
                <Pressable onPress={() => removeOrderUI(idx)} style={styles.removeOrderFab}>
                  <Text style={styles.removeOrderFabText}>×</Text>
                </Pressable>
              )}

              <Text style={styles.orderHeaderTitle}>
                Στοιχεία παραγγελίας {orders.length > 1 ? `#${idx + 1}` : ''}
              </Text>

              <View style={styles.orderInnerPanel}>
                <View style={styles.orderRow}>
                  {/* Κατηγορία */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.inputLabelInline}>Κατηγορία</Text>
                    <Pressable
                      onPress={() => updateOrderUI(idx, { categoryOpen: !ord.categoryOpen })}
                      style={styles.fakeInputInline}
                    >
                      <Text style={[styles.fakeInputText, !ord.category && { color: '#999' }]}>
                        {ord.category ?? 'Επιλέξτε κατηγορία..'}
                      </Text>
                      <Ionicons name={ord.categoryOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                    </Pressable>
                    {ord.categoryOpen && (
                      <View style={[styles.dropdownMenu, { marginLeft: 0, zIndex: 10 + (orders.length - idx) }]}>
                        {categoryLabels.map((label, i) => (
                          <View key={label}>
                            {i > 0 && <View style={styles.dropdownDivider} />}
                            <Pressable
                              onPress={() => updateOrderUI(idx, { category: label, categoryOpen: false })}
                              style={styles.dropdownItem}
                            >
                              <Text style={styles.dropdownItemText}>{label}</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Ποσότητα */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.inputLabelInline}>Ποσότητα</Text>
                    <View style={styles.amountInputWrap}>
                      <TextInput
                        value={ord.qty}
                        onChangeText={(t) => updateOrderUI(idx, { qty: t })}
                        placeholder="π.χ. 1"
                        keyboardType="numeric"
                        style={styles.amountInput}
                      />
                    </View>
                  </View>

                  {/* Ημερομηνία */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.inputLabelInline}>Ημερομηνία</Text>
                    <View style={styles.amountInputWrap}>
                      <TextInput
                        value={ord.date}
                        onChangeText={(t) => onChangeOrderDateAt(idx, t)}
                        placeholder={ddmmyyyy()}
                        keyboardType="numeric"
                        maxLength={10}
                        style={styles.amountInput}
                      />
                    </View>
                  </View>

                  {/* Χρώμα */}
                  <View style={styles.fieldGroup}>
                    <Text style={styles.inputLabelInline}>Χρώμα</Text>
                    <Pressable
                      onPress={() => updateOrderUI(idx, { colorOpen: !ord.colorOpen })}
                      style={styles.fakeInputInline}
                    >
                      <Text style={[styles.fakeInputText, !ord.color && { color: '#999' }]}>
                        {ord.color ?? 'Επιλέξτε χρώμα..'}
                      </Text>
                      <Ionicons name={ord.colorOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                    </Pressable>
                    {ord.colorOpen && (
                      <View style={[styles.dropdownMenu, { marginLeft: 0, zIndex: 10 + (orders.length - idx) }]}>
                        {colorLabels.map((label, i) => (
                          <View key={label}>
                            {i > 0 && <View style={styles.dropdownDivider} />}
                            <Pressable
                              onPress={() => updateOrderUI(idx, { color: label, colorOpen: false })}
                              style={styles.dropdownItem}
                            >
                              <Text style={styles.dropdownItemText}>{label}</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.orderActions}>
                <Pressable style={styles.primaryBtn} onPress={() => addPiecesForOrder(ord)}>
                  <Text style={styles.primaryBtnText}>Επιλογή</Text>
                </Pressable>
              </View>
            </View>
          )
        })}

        {/* ===== Τεμάχια Παραγγελίας ===== */}
        {piecesVisible && (
          <View style={[styles.cardBox, styles.cardBoxLarge, { marginTop: 16 }]}>
            <View style={styles.piecesIconFab}>
              <Ionicons name="file-tray-stacked-outline" size={22} color="#fff" />
            </View>
            <Text style={styles.piecesHeaderTitle}>
              Τεμάχια Παραγγελίας ({qtySum} {qtySum === 1 ? 'τεμάχιο' : 'τεμάχια'})
            </Text>

            <View style={styles.piecesList}>
                {pieces.map((p, i) => {
                    const isExisting = p.saved && !p.newlyAdded 

                    return (
                    <View
                        key={p.id ?? `piece-${i}`}
                        style={[
                        styles.pieceRow,
                        { position: 'relative' },
                        isExisting && styles.pieceRowCompleted,
                        ]}
                    >
                        <Pressable
                        onPress={() => removePiece(i)}
                        style={{ position: 'absolute', top: 4, right: 8, padding: 4 }}
                        >
                        <Text style={{ color: '#9CA3AF', fontWeight: 'bold', opacity: 0.8, fontSize: 14 }}>Χ</Text>
                        </Pressable>

                        <View style={styles.pieceInfo}>
                        <Text style={styles.pieceTitle}>Τεμάχιο {i + 1}</Text>
                        <Text style={styles.pieceSubtitle}>Κατηγορία: {p.category ?? '—'}</Text>
                        {!!p.code && <Text style={styles.pieceSubtitle}>Κωδικός: {p.code}</Text>}
                        </View>

                        <View style={styles.costControl}>
                        <Pressable style={styles.stepBtn} onPress={() => stepPieceCost(i, -1)}>
                            <Text style={styles.stepBtnText}>–</Text>
                        </Pressable>
                        <View style={styles.costInputWrap}>
                            <TextInput
                            value={p.cost}
                            onChangeText={(t) => updatePiece(i, { cost: t.replace(/[^\d.,]/g, '') })}
                            placeholder="0.00"
                            keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric' })}
                            inputMode="decimal"
                            style={styles.costInput}
                            />
                            <Text style={styles.euroSuffix}>€</Text>
                        </View>
                        <Pressable style={styles.stepBtn} onPress={() => stepPieceCost(i, 1)}>
                            <Text style={styles.stepBtnText}>+</Text>
                        </Pressable>
                        </View>

                        <Pressable style={styles.addPieceSmallBtn} onPress={() => openPieceModalFor(i)}>
                        <Text style={styles.addPieceSmallBtnText}>
                            {p.newlyAdded ? '+ Νέο τεμάχιο' : 'Επεξεργασία'}
                        </Text>
                        </Pressable>
                    </View>
                    )
                })}
            </View>


            {/* + Νέο Τεμάχιο (προαιρετικό) */}
            {/*<Pressable
              style={[styles.addPieceBtn, { marginTop: 10 }]}
              onPress={() => {
                const idx = pieces.length
                setPieces(prev => [...prev, { category: null, cost: '0.00', color: '', code: '', shelf: '', status: 'άπλυτο', workType: 'Επιστροφή', saved: false, newlyAdded: true, }])
                openPieceModalFor(idx)
              }}
            >
              
            </Pressable> */}
          </View>
        )}

        {/* ===== Πληρωμή ===== */}
        <View style={[styles.cardBox, { marginTop: 26 }]}>
        <Text style={[styles.inputLabel, { fontSize: 16 }]}>Πληρωμή</Text>

        {/* Προκαταβολή */}
            <View style={styles.inputWrap}>
                <View style={styles.depositRow}>
                    <Text style={[styles.inputLabel, { marginLeft: 1 }]}>Προκαταβολή</Text>
                    <Pressable
                    onPress={() => setDepositEnabled(prev => !prev)} // ή toggleDeposit() αν το έχεις
                    style={[styles.toggleWrapSmall, depositEnabled && styles.toggleWrapOnSmall]}
                    >
                    <View style={[styles.toggleKnobSmall, depositEnabled && styles.toggleKnobOnSmall]} />
                    </Pressable>
                </View>

                {depositEnabled && (
                    <View style={styles.amountRow}>
                    <View style={styles.amountInputWrap}>
                        <TextInput
                        value={depositAmount}
                        onChangeText={onChangeDeposit}   // κρατάω τη δική σου λογική
                        placeholder="Ποσό προκαταβολής"
                        keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
                        inputMode="decimal"
                        style={styles.amountInput}
                        />
                        <Text style={styles.euroSuffix}>€</Text>
                    </View>
                    </View>
                )}

                {/* Υπόλοιπο */}
                <View style={{ marginTop: 12 }}>
                    <Text style={[styles.inputLabelInline, { marginBottom: 4 }]}>Υπόλοιπο</Text>
                    <View style={[styles.totalAmountWrap, { paddingVertical: 8 }]}>
                    <Text style={[styles.totalAmountText, { fontSize: 18 }]}>{balance} €</Text>
                    </View>
                </View>
            </View>


        {/* Τρόπος πληρωμής */}
        <View>
            <Text style={styles.inputLabelInline}>Τρόπος πληρωμής</Text>
            <Pressable onPress={() => setPaymentOpen(v => !v)} style={styles.fakeInput}>
            <Text style={[styles.fakeInputText, !paymentMethod && { color: '#999' }]}>
                {paymentMethod ? (paymentLabels[paymentMethod] || paymentMethod) : 'Επιλέξτε τρόπο...'}
            </Text>
            <Ionicons name={paymentOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
            </Pressable>

            {paymentOpen && (
            <View style={[styles.dropdownMenu, { marginTop: 8 }]}>
                {paymentOptions.map((opt, i) => (
                <View key={opt}>
                    {i > 0 && <View style={styles.dropdownDivider} />}
                    <Pressable
                    onPress={() => { setPaymentMethod(opt); setPaymentOpen(false) }}
                    style={styles.dropdownItem}
                    >
                    <Text style={styles.dropdownItemText}>{paymentLabels[opt]}</Text>
                    </Pressable>
                </View>
                ))}
            </View>
            )}
        </View>
        </View>


        {/* ===== Συνολικό Κόστος ===== */}
        <View style={[styles.cardBox, styles.cardBoxLarge, { marginTop: 16 }]}>
          <View style={styles.totalIconFab}>
            <Ionicons name="calculator-outline" size={22} color="#fff" />
          </View>
          <Text style={styles.totalHeaderTitle}>Συνολικό Κόστος</Text>
          <View style={styles.totalAmountWrap}>
            <Text style={styles.totalAmountText}>{totalCost} €</Text>
          </View>
        </View>

        {/* ===== Σημειώσεις ===== */}
        <View style={[styles.cardBox, styles.cardBoxLarge, { marginTop: 16 }]}>
          <Text style={[styles.orderHeaderTitle, { paddingLeft: 0, marginBottom: 8 }]}>Σημειώσεις</Text>
          <View style={styles.notesWrap}>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Πληκτρολογήστε σημειώσεις..."
              multiline
              style={styles.notesInput}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* ===== Κουμπιά ===== */}
        <View style={styles.footerActions}>
          <Pressable style={styles.cancelBtnOutline} onPress={() => router.push('/dashboard')}>
            <Text style={styles.cancelBtnOutlineText}>Ακύρωση</Text>
          </Pressable>
          <Pressable style={styles.createBtn} onPress={onSave}>
            <Text style={styles.createBtnText}>Αποθήκευση</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ===== Modal επιλογής πελάτη (ίδιο με δημιουργία) ===== */}
      <Modal
        visible={customerModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setCustomerModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill as any} onPress={() => setCustomerModalOpen(false)} />
          <View style={styles.modalCard}>
            {/* Νέος πελάτης — πάνω δεξιά */}
            <Pressable
              style={styles.modalTopRightFab}
              onPress={() => {
                setCustomerModalOpen(false)
                router.push('/customers')
              }}
            >
              <Ionicons name="person-add-outline" size={20} color="#3B82F6" />
            </Pressable>

            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12 }}>
              Επιλέξτε Πελάτη
            </Text>

            <View style={styles.tableCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, styles.colName]}>Ονοματεπώνυμο</Text>
                <View style={styles.vDivider} />
                <Text style={[styles.th, styles.colAfm]}>ΑΦΜ</Text>
                <View style={styles.vDivider} />
                <Text style={[styles.th, styles.colAddr]}>Διεύθυνση</Text>
              </View>

              <ScrollView
                style={{ flex: 1, maxHeight: 420 }}
                contentContainerStyle={{ paddingBottom: 88 }}
                keyboardShouldPersistTaps="handled"
              >
                {customers.map((c, idx) => {
                  const full = `${c.firstName} ${c.lastName}`.trim()
                  const selected = selectedCustomer === c.id
                  const zebra = idx % 2 === 1
                  return (
                    <Pressable
                      key={c.id}
                      style={[
                        styles.rowItem,
                        zebra && styles.trZebra,
                        selected && styles.rowItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedCustomer(c.id)
                        setCustomerModalOpen(false)
                      }}
                    >
                      <Text style={[styles.rowText, styles.colName]} numberOfLines={1}>
                        {full || '—'}
                      </Text>
                      <View style={styles.vDivider} />
                      <Text style={[styles.rowText, styles.colAfm]} numberOfLines={1}>
                        {c.afm || '—'}
                      </Text>
                      <View style={styles.vDivider} />
                      <Text style={[styles.rowText, styles.colAddr]} numberOfLines={1}>
                        {c.address || '—'}
                      </Text>
                    </Pressable>
                  )
                })}
              </ScrollView>
            </View>

            <View style={styles.modalActionsBottom}>
              <Pressable
                style={[styles.cancelBtn, { marginRight: 8 }]}
                onPress={() => setCustomerModalOpen(false)}
              >
                <Text style={styles.cancelBtnText}>Κλείσιμο</Text>
              </Pressable>

              <Pressable
                style={[styles.primaryBtn, { marginLeft: 8 }]}
                onPress={() => setCustomerModalOpen(false)}
              >
                <Text style={styles.primaryBtnText}>Επιλογή</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ===== Modal: Νέο/Επεξεργασία Τεμαχίου ===== */}
      <Modal
        visible={pieceModalOpen}
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={closePieceModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Image
                source={require('../../assets/images/box.png')}
                style={{ width: 70, height: 70, marginBottom: 8 }}
                resizeMode="contain"
              />
              <Text style={styles.modalTitle}>{activePiece?.id ? 'Επεξεργασία τεμαχίου' : 'Νέο τεμάχιο'}</Text>
              <Text style={styles.modalSubtitle}>#{orderId?.slice(0, 6)?.toUpperCase?.()}</Text>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
              <View style={styles.row2}>
                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Κατηγορία</Text>
                  <TextInput
                    value={activeCategory ?? '—'}
                    editable={false}
                    selectTextOnFocus={false}
                    style={[styles.input, styles.lockedInput]}
                    placeholder="—"
                  />
                </View>

                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Χρώμα *</Text>
                  <TextInput
                    value={pieceForm.color}
                    onChangeText={(v) => setPieceForm(s => ({ ...s, color: v }))}
                    style={styles.input}
                    placeholder="π.χ. κόκκινο, μπλε..."
                    placeholderTextColor="#6B7280"
                  />
                </View>
              </View>

              <View style={styles.row2}>
                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Κωδικός τεμαχίου</Text>
                  <TextInput
                    value={pieceForm.code}
                    onChangeText={(v) => setPieceForm(s => ({ ...s, code: v.toUpperCase() }))}
                    style={[styles.input, !isCodeValid() && pieceForm.code ? styles.inputError : null]}
                    placeholder="CHR001"
                    placeholderTextColor="#6B7280"
                    autoCapitalize="characters"
                    maxLength={6}
                  />
                  {!isCodeValid() && pieceForm.code ? (
                    <Text style={styles.inputHintError}>Μορφή XXX999 (π.χ. CHR001)</Text>
                  ) : null}
                </View>

                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Ράφι</Text>
                  <TextInput
                    value={pieceForm.shelf}
                    onChangeText={(v) => setPieceForm(s => ({ ...s, shelf: v.toUpperCase() }))}
                    style={styles.input}
                    placeholder="π.χ. Α1"
                    placeholderTextColor="#6B7280"
                    autoCapitalize="characters"
                    maxLength={4}
                  />
                </View>
              </View>

              <View style={styles.row2}>
                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Κατάσταση</Text>
                  <Pressable onPress={() => setStatusOpen(v => !v)} style={styles.fakeInput}>
                    <Text style={styles.fakeInputText}>{pieceForm.status}</Text>
                    <Ionicons name={statusOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                  </Pressable>
                  {statusOpen && (
                    <View style={styles.dropdownMenu}>
                      {(['άπλυτο', 'πλυμένο'] as const).map((opt, i) => (
                        <View key={opt}>
                          {i > 0 && <View style={styles.dropdownDivider} />}
                          <Pressable
                            style={styles.dropdownItem}
                            onPress={() => { setPieceForm(s => ({ ...s, status: opt })); setStatusOpen(false) }}
                          >
                            <Text style={styles.dropdownItemText}>{opt}</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                <View style={[styles.inputWrap, styles.flex1]}>
                  <Text style={styles.label}>Τύπος Εργασίας *</Text>
                  <View style={styles.chipRow}>
                    {(['Επιστροφή', 'Φύλλαξη'] as const).map(opt => {
                      const active = pieceForm.workType === opt
                      return (
                        <Pressable
                          key={opt}
                          onPress={() => setPieceForm(s => ({ ...s, workType: opt }))}
                          style={[styles.chip, active && styles.chipActive]}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                        </Pressable>
                      )
                    })}
                  </View>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryBtn} onPress={closePieceModal}>
                <Text style={styles.secondaryBtnText}>Ακύρωση</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, { marginLeft: 12 }]} onPress={savePieceModal}>
                <Text style={styles.primaryBtnText}>Αποθήκευση</Text>
              </Pressable>
            </View>
          </View>
        </View>

        
        

      </Modal>

      
    </Page>
  )
}


const styles = StyleSheet.create({
  /* ===== Layout / Containers ===== */
  scroller: { flex: 1, width: '100%' },
  containerScroll: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
    paddingTop: 50,
    paddingBottom: 40,
  },
  textSection: {
    alignItems: 'flex-start',
    marginBottom: 50,
    width: '90%',
    maxWidth: 900,
  },

  depositRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginRight: 10,
},

    toggleWrapSmall: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    paddingHorizontal: 3,
    },
    toggleWrapOnSmall: { backgroundColor: '#21A67A' },
    toggleKnobSmall: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', transform: [{ translateX: 0 }] },
    toggleKnobOnSmall: { transform: [{ translateX: 18 }] },

    amountRow: { marginTop: 12, marginLeft: 48, gap: 6 },
    euroSuffix: { fontSize: 15, color: '#333' },
  title: {
    fontSize: 28,
    color: '#1F2A44',
    fontWeight: '400',
    marginBottom: 6,
  },
  subtitle: { fontSize: 18, color: '#555' },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },

modalActions: {
  flexDirection: 'row',
  justifyContent: 'center', // ίδιο mood με τη “Νέα παραγγελία”
  alignItems: 'center',
  marginTop: 12,
  gap: 12,
},
  /* ===== Cards ===== */
  cardBox: {
    width: '90%',
    maxWidth: 900,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    position: 'relative',
  },
  cardBoxLarge: { padding: 24 },

  /* ===== Labels / Inputs (inline & block) ===== */
  inputLabel: { fontSize: 15, color: '#1F2A44', marginBottom: 10 },
  inputLabelInline: { fontSize: 15, color: '#1F2A44', marginBottom: 8, paddingLeft: 4 },

  fakeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9F9F9',
    borderColor: '#D8D8D8',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    marginLeft: 2,
  },
  fakeInputInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9F9F9',
    borderColor: '#D8D8D8',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  fakeInputText: { fontSize: 15, color: '#333', flexShrink: 1, flexGrow: 1, marginRight: 8 },

  
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderColor: '#D8D8D8',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 120,
  },
  amountInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingVertical: 0,
    marginRight: 8,
    textAlignVertical: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowColor: 'transparent',
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : {}),
  },

  input: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FAFAFB',
  },
  lockedInput: { backgroundColor: '#FAFAFB', color: '#6B7280' },
  inputError: { borderColor: '#FCA5A5' },
  inputHintError: { fontSize: 12, color: '#B91C1C', marginTop: 4 },

  /* ===== Dropdown ===== */
  dropdownMenu: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    overflow: 'hidden',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
      web: { boxShadow: '0 6px 16px rgba(0,0,0,0.12)' } as any,
    }) as object),
  },
  dropdownItem: { paddingVertical: 12, paddingHorizontal: 14 },
  dropdownItemText: { fontSize: 15, color: '#333' },
  dropdownDivider: { height: 1, backgroundColor: '#EFEFEF' },

  /* ===== Order Section ===== */
  orderIconFab: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F2A44',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 5 },
      web: { boxShadow: '0 6px 12px rgba(0,0,0,0.18)' } as any,
    }) as object),
  },
  addOrderFab: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F2A44',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 5 },
      web: { boxShadow: '0 6px 12px rgba(0,0,0,0.18)', cursor: 'pointer' } as any,
    }) as object),
  },
  removeOrderFab: {
    position: 'absolute',
    right: 60,
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E9E9E9',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.select({ web: { cursor: 'pointer' } as any }) as object),
  },
  removeOrderFabText: { color: '#444', fontSize: 22, lineHeight: 22, fontWeight: '400', marginTop: -1 },

  orderHeaderTitle: { fontSize: 18, color: '#1F2A44', marginBottom: 12, paddingLeft: 60, fontWeight: '400' },
  orderInnerPanel: {
    backgroundColor: '#FBFBFB',
    borderColor: '#EEEEEE',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginLeft: 48,
  },
  orderRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fieldGroup: { flexGrow: 1, flexBasis: 200, minWidth: 180, marginBottom: 12 },

  /* ===== Pieces ===== */
  piecesIconFab: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F2A44',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 5 },
      web: { boxShadow: '0 6px 12px rgba(0,0,0,0.18)' } as any,
    }) as object),
  },
  piecesHeaderTitle: { fontSize: 15, color: '#1F2A44', marginBottom: 12, paddingLeft: 60, fontWeight: '400' },
  piecesList: { marginLeft: 48, gap: 10 },
  pieceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#EEEEEE',
    backgroundColor: '#FBFBFB',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  pieceRowCompleted: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10B981' },
  pieceInfo: { flexShrink: 1, flexGrow: 1 },
  pieceTitle: { fontSize: 15, color: '#1F2A44', fontWeight: '400' },
  pieceSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },

  costControl: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: 24 },
  stepBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 15, color: '#333', fontWeight: '400', lineHeight: 18 },
  costInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderColor: '#D8D8D8',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 110,
  },
  costInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingVertical: 0,
    marginRight: 6,
    textAlign: 'right',
    ...(Platform.OS === 'web' ? { outlineWidth: 0 } : {}),
  },
  

  /* ===== Total / Notes ===== */
  totalIconFab: {
    position: 'absolute',
    left: 12,
    top: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F2A44',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 5 },
      web: { boxShadow: '0 6px 12px rgba(0,0,0,0.18)' } as any,
    }) as object),
  },
  totalHeaderTitle: { fontSize: 15, color: '#1F2A44', marginBottom: 12, paddingLeft: 60, fontWeight: '400' },
  totalAmountWrap: { alignItems: 'center', paddingVertical: 8 },
  totalAmountText: { fontSize: 28, fontWeight: '400', color: '#0F6EFD' },

  notesWrap: {
    borderWidth: 1,
    borderColor: '#D8D8D8',
    borderRadius: 12,
    backgroundColor: '#F9F9F9',
    padding: 12,
    minHeight: 120,
  },
  notesInput: {
    fontSize: 14,
    color: '#333',
    minHeight: 96,
    textAlignVertical: 'top',
    includeFontPadding: false,
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    textAlign: 'left',
    ...(Platform.OS === 'web' ? { outlineWidth: 0, outlineColor: 'transparent' } : {}),
  },

  /* ===== Footer buttons ===== */
  footerActions: {
    width: '90%',
    maxWidth: 900,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  cancelBtnOutline: {
    flexGrow: 1,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 4px 10px rgba(0,0,0,0.06)', cursor: 'pointer' } as any,
    }) as object),
  },
  cancelBtnOutlineText: { color: '#333', fontSize: 15, fontWeight: '400' },
  createBtn: {
    flexGrow: 1,
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
      web: { boxShadow: '0 6px 16px rgba(0,0,0,0.12)', cursor: 'pointer' } as any,
    }) as object),
  },
  createBtnText: { color: '#fff', fontSize: 14, fontWeight: '400' },

  /* ===== Primary / Secondary buttons (reused) ===== */
  primaryBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 3 },
      web: { boxShadow: '0 6px 16px rgba(0,0,0,0.12)', cursor: 'pointer' } as any,
    }) as object),
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '400' },
  secondaryBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#3B82F6', fontWeight: '400', fontSize: 14 },

  /* ===== Table (modal) ===== */
  tableCard: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginTop: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  th: { fontSize: 13, fontWeight: '600', color: '#374151' },
  trZebra: { backgroundColor: '#FAFAFA' },
  vDivider: { width: 1, height: 18, backgroundColor: '#E0E0E0', marginHorizontal: 10 },
  colName: { flex: 2 },
  colAfm: { flex: 1 },
  colAddr: { flex: 2 },
  rowItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8 },
  rowItemSelected: { backgroundColor: '#F0F6FF', borderWidth: 1, borderColor: '#C7DAFF' },
  rowText: { fontSize: 15, color: '#333' },

  /* ===== Modals ===== */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalCard: {
    width: '90%',
    maxWidth: 540,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 28,
    maxHeight: '100%',
    height: 565,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 8 },
      web: { boxShadow: '0 12px 28px rgba(0,0,0,0.22)' } as any,
    }) as object),
  },
  modalTopRightFab: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  modalActionsBottom: { position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, backgroundColor: '#F1F1F1' },
  cancelBtnText: { color: '#333', fontSize: 15 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalHeader: { alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '400', color: '#1F2A44', marginTop: 6 },
  modalSubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2, textAlign: 'center' },

  /* ===== Chips ===== */
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 9999, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  chipText: { color: '#3B82F6', fontWeight: '400' },
  chipTextActive: { color: '#fff' },

  /* ===== Row utils ===== */
  row2: { flexDirection: 'row', gap: 10 },
  inputWrap: { marginBottom: 12, minWidth: 150 },
  label: { fontSize: 14, color: '#6B7280', fontWeight: '400', marginBottom: 6 },
  flex1: { flex: 1 },

  /* ===== Misc ===== */
  orderActions: { marginTop: 12, alignItems: 'flex-end', paddingRight: 12 },
  addPieceBtn: {
    backgroundColor: '#F1F5FF',
    borderWidth: 1,
    borderColor: '#CFE0FF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    ...(Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 2 }, web: { boxShadow: '0 4px 10px rgba(0,0,0,0.08)', cursor: 'pointer' } as any }) as object),
  },
  addPieceBtnText: { color: '#3B82F6', fontWeight: '400' },
  addPieceSmallBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginLeft: 8,
    marginRight: 24,
    ...(Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 2 }, web: { cursor: 'pointer' } as any }) as object),
  },
  addPieceSmallBtnText: { color: '#fff', fontWeight: '400', marginRight: 2 },
});
