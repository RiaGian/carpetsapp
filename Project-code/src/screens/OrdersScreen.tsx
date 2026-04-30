import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Image, Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import { listCustomers } from '../services/customer';
import { createOrderItem } from '../services/orderItems';
import { createOrder, NewOrder } from '../services/orders'; // + service insert
import { useAuth } from '../state/AuthProvider'; // logged-in user

type CustomerRow = {
  id: string;
  firstName: string;
  lastName: string;
  afm: string;
  address: string;
};

//  orderes (above blocks)
type OrderItem = {
  categoryOpen: boolean;
  category: string | null;
  qty: string;
  date: string;
  colorOpen: boolean;
  color: string | null;
};

const makeEmptyOrder = (): OrderItem => ({
  categoryOpen: false,
  category: null,
  qty: '',
  date: '',
  colorOpen: false,
  color: null,
});

// pieces
type PieceItem = {
  category: string | null;
  cost: string; 
  color?: string;
  code?: string;
  shelf?: string;
  status?: 'άπλυτο' | 'πλυμένο';
  workType?: 'Επιστροφή' | 'Φύλαξη';
  saved?: boolean; 
};

// helper: dd/mm/yyyy
const ddmmyyyy = (d = new Date()) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

export default function OrdersScreen() {
  //current user from AuthProvider (refresh done)
  const { user, loading: authLoading } = useAuth();

  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);

  //pay 
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  // pre pay
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [depositAmount, setDepositAmount] = useState<string>('');

  // types of pieces
  const categoryLabels = ['Χαλί', 'Μοκέτα', 'Πάπλωμα', 'Κουβέρτα', 'Κουρτίνα', 'Διαδρομάκι', 'Φλοκάτι'];
  const colorLabels = ['Κόκκινο', 'Μπλε', 'Πράσινο', 'Κίτρινο', 'Μαύρο', 'Άσπρο', 'Γκρι', 'Καφέ', 'Μπεζ', 'Ροζ'];

  const [orders, setOrders] = useState<OrderItem[]>([makeEmptyOrder()]);

  const updateOrder = (index: number, patch: Partial<OrderItem>) => {
    setOrders(prev => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  };

  const addOrder = () => setOrders(prev => [...prev, makeEmptyOrder()]);

  const [successOpen, setSuccessOpen] = useState(false);

  const removeOrder = (index: number) => {
    setOrders(prev => {
      if (prev.length <= 1) return prev; 
      return prev.filter((_, i) => i !== index);
    });
  };

  // dd/mm/yyyy 
  const onChangeOrderDateAt = (index: number, txt: string) => {
    const digits = txt.replace(/\D/g, '').slice(0, 8);
    let out = '';

    for (let i = 0; i < digits.length; i++) {
      out += digits[i];
      if (i === 1 || i === 3) out += '/';
    }

    if (!out.trim()) {
      out = ddmmyyyy();
    }

    updateOrder(index, { date: out });
  };


  // pieces
  const [piecesVisible, setPiecesVisible] = useState(false);
  const [pieces, setPieces] = useState<PieceItem[]>([]);

  const qtySum = useMemo(() => {
    return orders.reduce((acc, o) => {
      const n = parseInt((o.qty || '1').toString(), 10);
      return acc + (isNaN(n) || n < 1 ? 1 : n);
    }, 0);
  }, [orders]);

  const buildPiecesFromOrders = () => {
    const arr: PieceItem[] = [];
    orders.forEach(o => {
      const n = parseInt((o.qty || '1').toString(), 10);
      const count = isNaN(n) || n < 1 ? 1 : n;
      for (let i = 0; i < count; i++) {
        arr.push({ category: o.category ?? null, cost: '' });
      }
    });
    setPieces(arr);
    setPiecesVisible(true);
  };
    const addPiecesForOrder = (ord: OrderItem) => {
    const n = parseInt((ord.qty || '1').toString(), 10);
    const count = isNaN(n) || n < 1 ? 1 : n;

    const newOnes: PieceItem[] = Array.from({ length: count }, () => ({
      category: ord.category ?? null,
      cost: '',
      color: ord.color ?? undefined, 
    }));

    setPieces(prev => [...prev, ...newOnes]); 
    setPiecesVisible(true);
  };

  const addPiece = () => {
    setPieces(prev => [...prev, { category: null, cost: '' }]);
  };

  const updatePiece = (index: number, patch: Partial<PieceItem>) => {
    setPieces(prev => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  const stepPieceCost = (index: number, delta: number) => {
    setPieces(prev =>
      prev.map((p, i) => {
        if (i !== index) return p;
        const val = parseFloat(p.cost.replace(',', '.')) || 0;
        const next = Math.max(0, val + delta);
        return { ...p, cost: next.toFixed(2) };
      })
    );
  };

  const removePiece = (index: number) => {
  setPieces(prev => prev.filter((_, i) => i !== index));


  if (pieceModalOpen && pieceModalIndex === index) {
    closePieceModal();
  } else if (pieceModalOpen && pieceModalIndex !== null && pieceModalIndex > index) {
    setPieceModalIndex(pieceModalIndex - 1);
  }
};

  // STATE :item's modal
  const [pieceModalOpen, setPieceModalOpen] = useState(false)
  const [pieceModalIndex, setPieceModalIndex] = useState<number | null>(null) // null = new item

  //  φόρμα & helpers for item's modal
  const [pieceForm, setPieceForm] = useState({
    color: '',
    code: '',
    shelf: '',
    status: 'άπλυτο' as 'άπλυτο' | 'πλυμένο',
    workType: 'Επιστροφή' as 'Επιστροφή' | 'Φύλαξη',
    lengthM: '', 
    widthM: '',
  });
  const [statusOpen, setStatusOpen] = useState(false);

  const activePiece = pieceModalIndex !== null ? pieces[pieceModalIndex] : null;
  const activeCategory = activePiece?.category ?? null;

  const dimensionsCategories = useMemo(
    () => new Set(['Μοκέτα', 'Χαλί', 'Φλοκάτι', 'Διαδρομάκι']),
    []
  );
  const needsDimensions = dimensionsCategories.has(activeCategory ?? '');

  const lengthVal = parseFloat((pieceForm.lengthM || '').replace(',', '.'));
  const widthVal  = parseFloat((pieceForm.widthM  || '').replace(',', '.'));
  const hasBoth   = Number.isFinite(lengthVal) && Number.isFinite(widthVal);
  const areaSqm   = hasBoth ? (lengthVal * widthVal) : 0;


  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedId) || null, [customers, selectedId]);
  const customerFullName = selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}`.trim() : '—';

  //helpers open/close modal (prefill)
  const openPieceModalFor = (index: number | null) => {
    setPieceModalIndex(index);
    if (index !== null && pieces[index]) {
      const p = pieces[index];
      setPieceForm({
        color: p.color ?? '',
        code: p.code ?? '',
        shelf: p.shelf ?? '',
        status: p.status ?? 'άπλυτο',
        workType: p.workType ?? 'Επιστροφή',
        lengthM: '', 
        widthM: '', 
      });
    } else {
      setPieceForm({ color: '', code: '', shelf: '', status: 'άπλυτο', workType: 'Επιστροφή', lengthM: '',  widthM: '',   });
    }
    setPieceModalOpen(true);
  };

  const closePieceModal = () => {
    setPieceModalOpen(false);
    setPieceModalIndex(null);
    setStatusOpen(false);
  };

  const isCodeValid = () => {
    const up = pieceForm.code.trim().toUpperCase();
    return /^[A-ZΑ-Ω]{3}\d{3}$/.test(up);
  };

  const [errors, setErrors] = useState({
    color: false,
    code: false,
    status: false,
    workType: false,
  });


  const savePieceModal = () => {
    if (!activePiece || pieceModalIndex === null) return;

    // έλεγχος σφαλμάτων
    const newErrors = {
      color: !pieceForm.color.trim(),
      code: !isCodeValid(),
      status: !pieceForm.status,
      workType: !pieceForm.workType,
    };

    setErrors(newErrors); // ενημέρωση state για κόκκινο περίγραμμα

    // Έλεγχοι με alerts
    if (!pieceForm.color.trim()) {
      Alert.alert('Προσοχή', 'Το πεδίο Χρώμα είναι υποχρεωτικό.');
      return;
    }

    if (!isCodeValid()) {
      Alert.alert(
        'Προσοχή',
        'Ο Κωδικός τεμαχίου πρέπει να είναι της μορφής XXX999 (π.χ. CHR001).'
      );
      return;
    }

    if (!pieceForm.status) {
      Alert.alert('Προσοχή', 'Το πεδίο Κατάσταση είναι υποχρεωτικό.');
      return;
    }

    if (!pieceForm.workType) {
      Alert.alert('Προσοχή', 'Το πεδίο Τύπος Εργασίας είναι υποχρεωτικό.');
      return;
    }

    // Αν όλα είναι ΟΚ → αποθήκευση
    updatePiece(pieceModalIndex, {
      color: pieceForm.color.trim(),
      code: pieceForm.code.trim().toUpperCase(),
      shelf: pieceForm.shelf.trim(),
      status: pieceForm.status,
      workType: pieceForm.workType,
      saved: true,
    });

    closePieceModal();
  };



  // final cost
  const totalCost = useMemo(() => {
    const sum = pieces.reduce((acc, p) => {
      const v = parseFloat(p.cost.replace(',', '.'));
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
    return sum.toFixed(2);
  }, [pieces]);

  // notes
  const [notes, setNotes] = useState('');

  // Load customers 
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows: any[] = await listCustomers(500);
        if (cancelled) return;

        const mapped: CustomerRow[] = rows.map((r: any) => ({
          id: r.id ?? r._raw?.id ?? '',
          firstName: r.firstName ?? r._raw?.first_name ?? '',
          lastName: r.lastName ?? r._raw?.last_name ?? '',
          afm: r.afm ?? r._raw?.afm ?? '',
          address: r.address ?? r._raw?.address ?? '',
        }));
        setCustomers(mapped);
      } catch (err) {
        console.warn('Failed to load customers:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const displayValue = useMemo(() => {
    if (!selectedCustomer) return 'Επιλέξτε Πελάτη';
    const full = `${selectedCustomer.firstName} ${selectedCustomer.lastName}`.trim() || '—';
    const afm = selectedCustomer.afm || '—';
    const addr = selectedCustomer.address || '—';
    return `${full} | ${afm} | ${addr}`;
  }, [selectedCustomer]);

  const paymentLabels: Record<string, string> = {
    card: 'Κάρτα',
    cash: 'Μετρητά',
    bank: 'Τραπεζική κατάθεση',
    mixed: 'Μικτός τρόπος πληρωμής',
  };
  const paymentDisplay = paymentMethod ? paymentLabels[paymentMethod] : 'Επιλέξτε τρόπο πληρωμής..';

  const goCreateCustomer = () => router.push('/customers');

  const toggleDeposit = () => {
    setDepositEnabled(prev => {
      const next = !prev;
      if (!next) setDepositAmount('');
      return next;
    });
  };
  const [submitting, setSubmitting] = useState(false);

  // if  AuthProvider still rehydrate
  if (authLoading) {
    return null;
  }

  // (INSERT) - create order + insert order_items
  const onCreateOrder = async () => {
    try {
      if (submitting) return;

      if (!selectedId) {
        Alert.alert('Προσοχή', 'Παρακαλώ επιλέξτε πελάτη.');
        return;
      }

      // guard --> logged-in user
      if (!user?.id) {
        Alert.alert('Προσοχή', 'Δεν υπάρχει συνδεδεμένος χρήστης.');
        return;
      }

      const orderDate =
        orders.find(o => o.date && o.date.length === 10)?.date || ddmmyyyy();

      const deposit = depositEnabled
        ? parseFloat(depositAmount.replace(',', '.')) || 0
        : 0;

      const totalAmount = parseFloat(totalCost) || 0;

      const payload: NewOrder = {
        customerId: selectedId,
        paymentMethod: paymentMethod ?? '',
        deposit,
        totalAmount,
        notes: (notes ?? '').trim() || undefined,
        orderDate,
        createdBy: user.id, // real logged in user
      };

      setSubmitting(true);

      // create order & get orderId
      const created = await createOrder(payload, user.id);
      const orderId: string = created?.id;
      if (!orderId) throw new Error('createOrder did not return id');

      // 
      const itemsToInsert = pieces.filter(
        p => p.code || p.color || p.category || p.status || p.cost
      );

      // insert
      const inserts = itemsToInsert.map(p => {
        const price = parseFloat((p.cost || '').replace(',', '.')) || 0;

        return createOrderItem({
          orderId,
          item_code: p.code ?? '',
          category:  p.category ?? '',
          color:     p.color ?? '',
          price,                                   
          status:    p.status ?? 'άπλυτο',
          storage_status: p.workType ?? '', 
          order_date: orderDate,
          created_at: Date.now(),
        });
      });

      //  inserts (if manny)
      if (inserts.length) {
        await Promise.all(inserts);
      }

      setSubmitting(false);
      setSuccessOpen(true); //success modal

    } catch (err) {
      console.warn('createOrder failed:', err);
      setSubmitting(false);
      Alert.alert('Σφάλμα', 'Κάτι πήγε στραβά κατά την καταχώρηση.');
    }
  };


  const onSuccessOk = () => {
    setSuccessOpen(false);
    setModalOpen(false);
    setPieceModalOpen(false);

    // clear
    setOrders([makeEmptyOrder()]);
    setPieces([]);
    setPiecesVisible(false);
    setPaymentMethod(null);
    setDepositEnabled(false);
    setDepositAmount('');
    setNotes('');

    // --> dashboard
    router.push('/dashboard');
  };

  return (
    <Page>
      <AppHeader showBack />

      {/* Scroll and stable header  */}
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={styles.containerScroll}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.textSection}>
          <Text style={styles.title}>Νέα παραγγελία</Text>
          <Text style={styles.subtitle}>Δημιουργήστε μία νέα παραγγελία</Text>
        </View>

        {/* Πελάτης */}
        <View style={styles.cardBox}>
          
          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, { marginLeft: -50 }]}>
              Πελάτης <Text style={styles.required}>*</Text>
            </Text>
            <Pressable onPress={() => setModalOpen(true)} style={styles.fakeInput}>
              <Text numberOfLines={1} style={[styles.fakeInputText, !selectedCustomer && { color: '#999' }]}>
                {displayValue}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#666" />
            </Pressable>
          </View>
        </View>

        {/* Πληρωμή */}
        <View style={[styles.cardBox, { marginTop: 16 }]}>
          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, { marginLeft: -50 }]}>Πληρωμή</Text>

            <Pressable onPress={() => setPaymentOpen(v => !v)} style={styles.fakeInput}>
              <Text numberOfLines={1} style={[styles.fakeInputText, !paymentMethod && { color: '#999' }]}>
                {paymentDisplay}
              </Text>
              <Ionicons name={paymentOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
            </Pressable>
            {paymentOpen && (
              <View style={styles.dropdownMenu}>
                {Object.entries(paymentLabels).map(([key, label], i) => (
                  <View key={key}>
                    {i > 0 && <View style={styles.dropdownDivider} />}
                    <Pressable
                      style={styles.dropdownItem}
                      onPress={() => { setPaymentMethod(key); setPaymentOpen(false); }}
                    >
                      <Text style={styles.dropdownItemText}>{label}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Προκαταβολή */}
        <View style={[styles.cardBox, { marginTop: 16 }]}>
          <View style={styles.inputWrapper}>
            <View style={styles.depositRow}>
              <Text style={[styles.inputLabel, { marginLeft: -50 }]}>Προκαταβολή</Text>
              <Pressable onPress={toggleDeposit} style={[styles.toggleWrapSmall, depositEnabled && styles.toggleWrapOnSmall]}>
                <View style={[styles.toggleKnobSmall, depositEnabled && styles.toggleKnobOnSmall]} />
              </Pressable>
            </View>
            {depositEnabled && (
              <View style={styles.amountRow}>
                <View style={styles.amountInputWrap}>
                  <TextInput
                    value={depositAmount}
                    onChangeText={setDepositAmount}
                    placeholder="Ποσό προκαταβολής"
                    keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
                    inputMode="decimal"
                    style={styles.amountInput}
                  />
                  <Text style={styles.euroSuffix}>€</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Στοιχεία παραγγελίας (πολλαπλά) */}
        {orders.map((ord, idx) => {
          const isLast = idx === orders.length - 1;
          const canRemove = orders.length > 1 && idx > 0;
          return (
            <View key={`order-${idx}`} style={[styles.cardBox, styles.cardBoxLarge, { marginTop: 16 }]}>
              <View style={styles.orderIconFab}>
                <Ionicons name="calendar-outline" size={22} color="#fff" />
              </View>

              {/* + στο πάνω δεξί ΜΟΝΟ στο τελευταίο */}
              {isLast && (
                <Pressable onPress={addOrder} style={styles.addOrderFab} accessibilityLabel="Προσθήκη νέου πλαισίου παραγγελίας">
                  <Ionicons name="add" size={22} color="#fff" />
                </Pressable>
              )}

              {/* Χ (αφαίρεση) πάνω δεξιά σε μη-πρώτα πλαίσια */}
              {canRemove && (
                <Pressable onPress={() => removeOrder(idx)} style={styles.removeOrderFab} accessibilityLabel="Αφαίρεση πλαισίου παραγγελίας">
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
                      onPress={() => updateOrder(idx, { categoryOpen: !ord.categoryOpen })}
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
                              onPress={() => updateOrder(idx, { category: label, categoryOpen: false })}
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
                        onChangeText={(t) => updateOrder(idx, { qty: t })}
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
                      onPress={() => updateOrder(idx, { colorOpen: !ord.colorOpen })}
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
                              onPress={() => updateOrder(idx, { color: label, colorOpen: false })}
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
                {/* Πατώντας Επιλογή → δημιουργεί τα Τεμάχια από πάνω παραγγελίες */}
                <Pressable style={styles.primaryBtn} onPress={() => addPiecesForOrder(ord)}>
                  <Text style={styles.primaryBtnText}>Επιλογή</Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {/* ===== Τεμάχια Παραγγελίας ===== */}
        {piecesVisible && (
          <View style={[styles.cardBox, styles.cardBoxLarge, { marginTop: 16 }]}>
            <View style={styles.piecesIconFab}>
              <Ionicons name="file-tray-stacked-outline" size={22} color="#fff" />
            </View>
            <Text style={styles.piecesHeaderTitle}>
              Τεμάχια Παραγγελίας ({qtySum} τεμάχια)
            </Text>

            <View style={styles.piecesList}>
              {pieces.map((p, i) => (
                <View
                  key={`piece-${i}`}
                  style={[
                    styles.pieceRow,
                    { position: 'relative' },
                    p.saved && styles.pieceRowCompleted, // ✅ όταν το τεμάχιο είναι saved → πράσινο φόντο
                  ]}
                >
              
                  <Pressable
                    onPress={() => removePiece(i)}
                    style={{
                      position: 'absolute',
                      
                      top: 4,
                      right: 8,
                      padding: 4,
                    
                    }}
                  >
                    <Text style={{ color: '#9CA3AF',letterSpacing: 1, fontWeight: 'bold',opacity: 0.8, fontSize: 14 }}>Χ</Text>
                  </Pressable>

                  <View style={styles.pieceInfo}>
                    <Text style={styles.pieceTitle}>Τεμάχιο {i + 1}</Text>
                    <Text style={styles.pieceSubtitle}>Κατηγορία: {p.category ?? '—'}</Text>
                  </View>

                  {/* Κόστος με – [input] + */}
                  <View style={styles.costControl}>
                    <Pressable style={styles.stepBtn} onPress={() => stepPieceCost(i, -1)}>
                      <Text style={styles.stepBtnText}>–</Text>
                    </Pressable>
                    <View style={styles.costInputWrap}>
                      <TextInput
                        value={p.cost}
                        onChangeText={(t) => {
                          const clean = t.replace(/[^\d.,]/g, '')
                          updatePiece(i, { cost: clean })
                        }}
                        placeholder="0.00"
                        keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
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
                    <Text style={styles.addPieceSmallBtnText}>+ Νέο τεμάχιο</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            
          </View>
        )}


        {/* Final Cost*/}
        <View style={[styles.cardBox, styles.cardBoxLarge, { marginTop: 16 }]}>
          <View style={styles.totalIconFab}>
            <Ionicons name="calculator-outline" size={22} color="#fff" />
          </View>
          <Text style={styles.totalHeaderTitle}>Συνολικό Κόστος</Text>

          <View style={styles.totalAmountWrap}>
            <Text style={styles.totalAmountText}>{totalCost} €</Text>
          </View>
        </View>

        {/* Notes */}
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

        {/* BUTTONS - CANCEL - CREATE ORDER */}
        <View style={styles.footerActions}>
          <Pressable
            style={styles.cancelBtnOutline}
            onPress={() => router.push('/dashboard')}
          >
            <Text style={styles.cancelBtnOutlineText}>Ακύρωση</Text>
          </Pressable>
          <Pressable style={styles.createBtn} onPress={onCreateOrder}>
            <Text style={styles.createBtnText}>Δημιουργία Παραγγελίας</Text>
          </Pressable>
        </View>
      </ScrollView>



      <Modal
  visible={isModalOpen}
  animationType="fade"
  transparent
  onRequestClose={() => setModalOpen(false)}
>
  <View style={styles.modalOverlay}>
    <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalOpen(false)} />

    <View style={styles.modalCard}>
      {/* 🔵 Νέος Πελάτης – στρογγυλό κουμπί πάνω δεξιά */}
      <Pressable
        style={styles.modalTopRightFab}
        onPress={() => {
          setModalOpen(false);
          router.push('/customers');
        }}
      >
        <Ionicons name="person-add-outline" size={20} color="#3B82F6" />
      </Pressable>

      {/* 🧱 Περιεχόμενο modal */}
      <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12 }}>
        Επιλέξτε Πελάτη
      </Text>

      {/* 🧱 Πίνακας πελατών (κεφαλίδα + γραμμές) */}
      <View style={styles.tableCard}>
        {/* Κεφαλίδα στηλών */}
        <View style={styles.tableHeader}>
          <Text style={[styles.th, styles.colName]}>Ονοματεπώνυμο</Text>
          <View style={styles.vDivider} />
          <Text style={[styles.th, styles.colAfm]}>ΑΦΜ</Text>
          <View style={styles.vDivider} />
          <Text style={[styles.th, styles.colAddr]}>Διεύθυνση</Text>
        </View>

        {/* Λίστα πελατών με “αέρα” κάτω να μην κρύβεται από τα κουμπιά */}
        <ScrollView
          style={{ flex: 1, maxHeight: 420 }}
          contentContainerStyle={{ paddingBottom: 88 }}
          keyboardShouldPersistTaps="handled"
        >
          {customers.map((c, idx) => {
            const full = `${c.firstName} ${c.lastName}`.trim();
            const selected = selectedId === c.id;
            const zebra = idx % 2 === 1; // ζέβρα γραμμές

            return (
              <Pressable
                key={c.id}
                style={[
                  styles.rowItem,
                  zebra && styles.trZebra,
                  selected && styles.rowItemSelected,
                ]}
                onPress={() => {
                  setSelectedId(c.id);
                  setModalOpen(false);
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
            );
          })}
        </ScrollView>
      </View>

      {/* ✅ Κουμπιά στο κάτω μέρος */}
      <View style={styles.modalActionsBottom}>
        <Pressable
          style={[styles.cancelBtn, { marginRight: 8 }]}
          onPress={() => setModalOpen(false)}
        >
          <Text style={styles.cancelBtnText}>Κλείσιμο</Text>
        </Pressable>

        <Pressable
          style={[styles.primaryBtn, { marginLeft: 8 }]}
          onPress={() => setModalOpen(false)}
        >
          <Text style={styles.primaryBtnText}>Επιλογή</Text>
        </Pressable>
      </View>
    </View>
  </View>
      </Modal>



        {/* ===== Modal: Νέο Τεμάχιο (ίδιο στυλ) ===== */}
        <Modal
          visible={pieceModalOpen}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={closePieceModal}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, needsDimensions && styles.modalCardTall]}>
              <View style={styles.modalHeader}>
                {/* Logo στο κέντρο */}
                <Image
                  source={require('../../assets/images/box.png')}
                  style={{ width: 70, height: 70, marginBottom: 8 }}
                  resizeMode="contain"
                />
                <Text style={styles.modalTitle}>Νέο τεμάχιο</Text>
                {/* Μικρότερο: Όνομα πελάτη */}
                <Text style={styles.modalSubtitle}>{customerFullName}</Text>
              </View>

              <ScrollView
                contentContainerStyle={{ paddingBottom: 12 }}
                keyboardShouldPersistTaps="handled"
                style={{ overflow: 'visible' }}
              >
                {/* Κατηγορία (κλειδωμένο) | Χρώμα * */}
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
                      onChangeText={(v) => {
                        setPieceForm(s => ({ ...s, color: v }));
                        if (errors.color) setErrors(e => ({ ...e, color: false }));
                      }}
                      style={[styles.input, errors.color && styles.inputError]}
                      placeholder="π.χ. κόκκινο, μπλε..."
                      placeholderTextColor="#6B7280"
                    />
                  </View>
                </View>

                {/* Κωδικός τεμαχίου | Ράφι */}
                <View style={styles.row2}>
                  <View style={[styles.inputWrap, styles.flex1]}>
                    <Text style={styles.label}>Κωδικός τεμαχίου *</Text>
                    <TextInput
                      value={pieceForm.code}
                      onChangeText={(v) => {
                        setPieceForm(s => ({ ...s, code: v.toUpperCase() }));
                        if (errors.code) setErrors(e => ({ ...e, code: false }));
                      }}
                      style={[styles.input, errors.code && styles.inputError]}
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
                      placeholder="π.χ. Α1, Α2 (προαιρετικό)"
                      placeholderTextColor="#6B7280"
                      autoCapitalize="characters"
                      maxLength={4}
                    />
                  </View>
                </View>

                {needsDimensions && (
                  <>
                    <Text style={[styles.label, { marginTop: 8 }]}>Διαστάσεις (μέτρα)</Text>
                    <View style={styles.row2}>
                      <View style={[styles.inputWrap, styles.flex1]}>
                        <Text style={styles.label}>Μήκος (προαιρετικό)</Text>
                        <TextInput
                          value={pieceForm.lengthM}
                          onChangeText={(v) => {
                            const clean = v.replace(/[^\d.,]/g, '');
                            setPieceForm(s => ({ ...s, lengthM: clean }));
                          }}
                          style={styles.input}
                          placeholder="Μήκος (προαιρετικό)"
                          placeholderTextColor="#6B7280"
                          keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
                          inputMode="decimal"
                        />
                      </View>

                      <View style={[styles.inputWrap, styles.flex1]}>
                        <Text style={styles.label}>Πλάτος (προαιρετικό)</Text>
                        <TextInput
                          value={pieceForm.widthM}
                          onChangeText={(v) => {
                            const clean = v.replace(/[^\d.,]/g, '');
                            setPieceForm(s => ({ ...s, widthM: clean }));
                          }}
                          style={styles.input}
                          placeholder="Πλάτος (προαιρετικό)"
                          placeholderTextColor="#6B7280"
                          keyboardType={Platform.select({ ios: 'decimal-pad', android: 'numeric', default: 'numeric' })}
                          inputMode="decimal"
                        />
                      </View>
                    </View>

                    {hasBoth && (
                      <View style={{ marginTop: 4 }}>
                        <Text style={[styles.label, { fontWeight: '600' }]}>
                          Επιφάνεια: {areaSqm.toFixed(2)} τ.μ.
                        </Text>
                      </View>
                    )}
                  </>
                )}

                {/* Κατάσταση (dropdown) | Τύπος Εργασίας * (chips) */}
                <View style={styles.row2}>
                  <View style={[styles.inputWrap, styles.flex1, styles.dropdownHost]}>
                    <Text style={styles.label}>Κατάσταση *</Text>
                    <Pressable
                      onPress={() => setStatusOpen(v => !v)}
                      style={styles.fakeInput}
                    >
                      <Text style={styles.fakeInputText}>{pieceForm.status}</Text>
                      <Ionicons name={statusOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                    </Pressable>
                    {statusOpen && (
                      <View style={[styles.dropdownMenu,  styles.dropdownMenuAbove]}>
                        {(['άπλυτο', 'πλυμένο'] as const).map((opt, i) => (
                          <View key={opt}>
                            {i > 0 && <View style={styles.dropdownDivider} />}
                            <Pressable
                              style={styles.dropdownItem}
                              onPress={() => { setPieceForm(s => ({ ...s, status: opt })); setStatusOpen(false); }}
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
                      {(['Επιστροφή', 'Φύλαξη'] as const).map(opt => {
                        const active = pieceForm.workType === opt;
                        return (
                          <Pressable
                            key={opt}
                            onPress={() => setPieceForm(s => ({ ...s, workType: opt }))}
                            style={[styles.chip, active && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                          </Pressable>
                        );
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
              <Text style={styles.requiredNote}>
                Τα πεδία με * είναι υποχρεωτικά
              </Text>

            </View>
          </View>
        </Modal>
        <Modal
          visible={successOpen}
          animationType="fade"
          transparent
          statusBarTranslucent
          onRequestClose={() => setSuccessOpen(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { paddingVertical: 106, paddingHorizontal: 30,justifyContent: 'flex-start', paddingTop: 50, width: '50%', height: 300 }]}>
              <View style={styles.modalHeader}>
                {/* Εικονίδιο επιτυχίας */}
                <Ionicons name="checkmark-circle-outline" size={64} color="#10B981" style={{ marginBottom: 8 }} />
                <Text style={styles.modalTitle}>Η παραγγελία δημιουργήθηκε επιτυχώς!</Text>
                {/* Μικρό υπότιτλο (προαιρετικό) */}
                <Text style={[styles.modalSubtitle, { marginTop: 4 }]}>
                  Ολοκληρώθηκε η καταχώρηση της παραγγελίας.
                </Text>
              </View>

              <View style={styles.modalActions}>
                <Pressable style={styles.primaryBtn} onPress={onSuccessOk}>
                  <Text style={styles.primaryBtnText}>OK</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>



    </Page>
  );
}


const styles = StyleSheet.create({
  scroller: { flex: 1, width: '100%' },
  containerScroll: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
    paddingTop: 50,
    paddingBottom: 40,
  },

  dropdownHost: {
    position: 'relative',    
    overflow: 'visible',     
    zIndex: 100,             
  },

  dropdownMenuAbove: {
    bottom: 133, 
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 10,
    paddingTop: 50,
  },

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

th: {
  fontSize: 13,
  fontWeight: '600',
  color: '#374151',
},

trZebra: {
  backgroundColor: '#FAFAFA', // εναλλάξ γκρι
},

modalActionsBottom: {
  position: 'absolute',
  left: 16,
  right: 16,
  bottom: 16,
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 12,
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

  requiredNote: {
  fontSize: 11,
  color: '#6B7280', 
  textAlign: 'center',
  marginTop: 6,
  marginBottom: 4,
},

  successTitle: { color: '#10B981', fontWeight: '600' },

  textSection: {
    alignItems: 'flex-start',
    marginBottom: 50,
    width: '90%',
    maxWidth: 900,
  },
  title: {
    fontSize: 28,
    color: '#1F2A44',
    fontWeight: '400',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 18,
    color: '#555',
  },

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

  

  cardBoxLarge: {
    padding: 24,
  },

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

  secondaryBtnText: {
    color: '#3B82F6',
    fontWeight: '400',
    fontSize: 14,
  },
  modalBackdrop: {
  flex: 1,
  backgroundColor: 'rgba(0,0,0,0.25)',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 18,
},



  // --- Επικεφαλίδα modal ---
  modalHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#1F2A44',
    marginTop: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'center',
  },

  personFab: {
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
      web: { boxShadow: '0 6px 12px rgba(0,0,0,0.18)', cursor: 'pointer' } as any,
    }) as object),
  },

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

  // + κουμπί (πάνω δεξιά)
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

  // Χ κουμπί (αφαίρεση) — απαλό γκρι
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
    ...(Platform.select({
      web: { cursor: 'pointer' } as any,
    }) as object),
  },
  removeOrderFabText: {
    color: '#444',
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '400',
    marginTop: -1,
  },

  inputWrapper: {
    width: '100%',
    zIndex: 1,
    paddingTop: 8,
  },
  inputLabel: {
    fontSize: 15,
    color: '#1F2A44',
    marginBottom: 10,
    paddingLeft: 60,
  },
  required: {
    color: '#d33',
  },

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
  fakeInputText: {
    fontSize: 15,
    color: '#333',
    flex: 1,
    marginRight: 8,
  },

  dropdownMenu: {
    marginLeft: 48,
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
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#333',
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#EFEFEF',
  },

  // ---- Toggle & Amount ----
  toggleWrap: {
    marginLeft: 48,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EAEAEA',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  toggleWrapOn: {
    backgroundColor: '#21A67A',
  },
  toggleKnob: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  toggleKnobOn: {
    transform: [{ translateX: 16 }],
  },
  toggleText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '400',
  },
  toggleTextOn: {
    color: '#fff',
  },

  amountRow: {
    marginTop: 12,
    marginLeft: 48,
    gap: 6,
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
    borderColor: '#D8D8D8',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
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

  euroSuffix: {
    fontSize: 15,
    color: '#333',
  },
  amountHint: {
    fontSize: 12,
    color: '#666',
    paddingLeft: 4,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
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

  addPieceSmallBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginLeft: 8,
    marginRight: 24,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
      web: { cursor: 'pointer' } as any,
    }) as object),
  },
  addPieceSmallBtnText: {
    color: '#fff',
    fontWeight: '400',
    marginRight: 2
  },

  columnsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E6E6E6',
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },

  colText: {
    fontSize: 15,
    color: '#666',
  },

  colName: { flex: 2 },
  colAfm: { flex: 1 },
  colAddr: { flex: 2 },
  vDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 10,
  },

  hDivider: {
    height: 1,
    backgroundColor: '#EFEFEF',
  },


  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },

  rowItemPressed: {
    opacity: 0.8,
  },

  rowItemSelected: {
    backgroundColor: '#F0F6FF',
    borderWidth: 1,
    borderColor: '#C7DAFF',
  },
  rowText: {
    fontSize: 15,
    color: '#333',
  },

  modalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 12,
  },

  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F1F1F1',
  },

  cancelBtnText: {
    color: '#333',
    fontSize: 15,
  },

  toggleWrapSmall: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleWrapOnSmall: {
    backgroundColor: '#21A67A',
  },
  toggleKnobSmall: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    transform: [{ translateX: 0 }],
  },
  toggleKnobOnSmall: {
    transform: [{ translateX: 18 }],
  },
  depositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 10,
    marginLeft: 0,
  },

  // ===== Στοιχεία παραγγελίας =====
  orderHeaderTitle: {
    fontSize: 18,
    color: '#1F2A44',
    marginBottom: 12,
    paddingLeft: 60,
    fontWeight: '400',
  },
  orderInnerPanel: {
    backgroundColor: '#FBFBFB',
    borderColor: '#EEEEEE',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginLeft: 48,
  },
  orderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  fieldGroup: {
    flexGrow: 1,
    flexBasis: 200,
    minWidth: 180,
  },
  inputLabelInline: {
    fontSize: 15,
    color: '#1F2A44',
    marginBottom: 8,
    paddingLeft: 4,
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
  orderActions: {
    marginTop: 12,
    alignItems: 'flex-end',
    paddingRight: 12,
  },
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
  primaryBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '400',
  },

  // ===== Τεμάχια Παραγγελίας =====
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
  piecesHeaderTitle: {
    fontSize: 15,
    color: '#1F2A44',
    marginBottom: 12,
    paddingLeft: 60,
    fontWeight: '400',
  },
  piecesList: {
    marginLeft: 48,
    gap: 10,
  },
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
  pieceInfo: {
    flexShrink: 1,
    flexGrow: 1,
  },
  pieceTitle: {
    fontSize: 15,
    color: '#1F2A44',
    fontWeight: '400',
  },
  pieceSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  costControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 24,
  },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '400',
    lineHeight: 18,
  },
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
  piecesActions: {
    marginTop: 12,
    alignItems: 'flex-end',
    paddingRight: 12,
  },
  addPieceBtn: {
    backgroundColor: '#F1F5FF',
    borderWidth: 1,
    borderColor: '#CFE0FF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
      web: { boxShadow: '0 4px 10px rgba(0,0,0,0.08)', cursor: 'pointer' } as any,
    }) as object),
  },
  addPieceBtnText: {
    color: '#3B82F6',
    fontWeight: '400',
  },

  // ===== Συνολικό Κόστος =====
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
  totalHeaderTitle: {
    fontSize: 15,
    color: '#1F2A44',
    marginBottom: 12,
    paddingLeft: 60,
    fontWeight: '400',
  },
  totalAmountWrap: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalAmountText: {
    fontSize: 28,
    fontWeight: '400',
    color: '#0F6EFD',
  },

  // ===== Σημειώσεις =====
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
    ...(Platform.OS === 'web'
      ? {
          outlineWidth: 0,
          outlineColor: 'transparent',
        }
      : {}),
},


  // ===== Footer buttons =====
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
  cancelBtnOutlineText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '400',
  },
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
  createBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '400',
  },

  // === ΝΕΑ styles για το modal τεμαχίου ===
  lockedInput: {
    backgroundColor: '#FAFAFB',
    color: '#6B7280',
  },
  inputError: {
    borderColor: '#FCA5A5',
  },
  inputHintError: {
    marginTop: 4,
    fontSize: 12,
    color: '#B91C1C',
  },
  chipRow: {
    flexDirection: 'row',
    
    gap: 8,
    marginTop: 2,
    marginLeft: 18,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 9999,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  chipText: {
    color: '#3B82F6',
    fontWeight: '400',
  },
  chipTextActive: {
    color: '#fff',
  },

  // --- missing base styles ---
  row2: { 
    flexDirection: 'row', 
    gap: 10,
  },

  inputWrap: { 
    marginVertical: 8,
    minWidth: 150,
    marginBottom: 12,
  },

  flex1: { 
    flex: 1,
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

  label: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '400',
    marginBottom: 6,
  },

  pieceRowCompleted: {
  backgroundColor: 'rgba(16,185,129,0.12)', 
  borderColor: '#10B981',
},

modalCardTall: {
    height: 630,             
    maxHeight: '92%',        
  },

});
