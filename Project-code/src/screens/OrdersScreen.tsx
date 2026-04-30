import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Calendar } from 'react-native-calendars';

import {
  Alert,
  Modal,
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
import { createOrderItem, existsItemCode } from '../services/orderItems';
import { createOrder, NewOrder } from '../services/orders'; // + service insert
import { useAuth } from '../state/AuthProvider'; // logged-in user

type CustomerRow = {
  id: string;
  firstName: string;
  lastName: string;
  afm: string;
  address: string;  
  phone?: string;
};

//  orderes (above blocks)
type OrderItem = {
  categoryOpen: boolean;
  category: string | null;
  qty: string;
  date: string;
  dateOpen: boolean;           
  colorOpen: boolean;
  color: string | null;
  statusOpen: boolean;
  status: 'άπλυτο' | 'πλυμένο';
  workType: 'Επιστροφή' | 'Φύλαξη';
  itemCode?: string;
};

const makeEmptyOrder = (): OrderItem => ({
  categoryOpen: false,
  category: null,
  qty: '',
  date: '',
  dateOpen: false,   
  colorOpen: false,
  color: null,
  statusOpen: false,
  status: 'άπλυτο',
  workType: 'Επιστροφή',
  itemCode: '',
});

// pieces/ order items
type PieceItem = {
  category: string | null;
  cost: string;
  color?: string;
  status?: 'άπλυτο' | 'πλυμένο';
  workType?: 'Επιστροφή' | 'Φύλαξη';
  code?: string;            
  orderDate?: string;       
  saved?: boolean;
  sourceOrderIndex?: number;
};

// helper--> return date: dd/mm/yyyy
const ddmmyyyy = (d = new Date()) => {
  const dd = String(d.getDate()).padStart(2, '0'); // date (2)
  const mm = String(d.getMonth() + 1).padStart(2, '0'); // month (2)
  const yyyy = d.getFullYear(); // year (4)
  return `${dd}/${mm}/${yyyy}`;
};

// iso --> dd/mm/yyyy
const isoToDDMMYYYY = (iso: string) => {

  // dd-mm-yyyy --> ["yyyy", "mm", "dd"]
  const [yyyy, mm, dd] = iso.split('-');
  if (!yyyy || !mm || !dd) return ddmmyyyy(); // if missing --> retunrn today
  return `${dd}/${mm}/${yyyy}`;
};

// dd/mm/yyyy --> iso (to save in DB)
const ddmmyyyyToISO = (s: string) => {

  // check string (dd/mm/yyyy)
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);

  // if not valid --> today's date
  if (!m) {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  // if vaid --> [dd, mm, yyyy]
  const [, dd, mm, yyyy] = m;

  // return in iso
  return `${yyyy}-${mm}-${dd}`;
};

// create +1 item's code (prefix+startNum)
const generateSequentialCodes = async (
  prefix: string,
  startNum: number,
  count: number
): Promise<string[]> => {
  const codes: string[] = []; // codes
  let n = startNum; //counter (+1)

  while (codes.length < count) {
    if (n > 999) {
      // limit
      throw new Error('Ξεπέρασες το όριο κωδικών XXX999.');
    }
    // create candidate item's code (new)
    const candidate = `${prefix}${String(n).padStart(3, '0')}`;
    // check in DB if already code exists
    const taken = await existsItemCode(candidate);
    
    // if new
    if (!taken && !codes.includes(candidate)) {

      // add in the list/batch 
      codes.push(candidate);
    }
    // +1 
    n++;
  }

  return codes;
};

export default function OrdersScreen() {


  //current user from AuthProvider (refresh done)
  const { user, loading: authLoading } = useAuth();

  // customers, ids, modals
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);

  //pay 
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  // pre pay
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [depositAmount, setDepositAmount] = useState<string>('');

  // types of pieces/ order items
  const categoryLabels = ['Χαλί', 'Μοκέτα', 'Πάπλωμα', 'Κουβέρτα', 'Κουρτίνα', 'Διαδρομάκι', 'Φλοκάτι'];
  const colorLabels = ['Κόκκινο', 'Μπλε', 'Πράσινο', 'Κίτρινο', 'Μαύρο', 'Άσπρο', 'Γκρι', 'Καφέ', 'Μπεζ', 'Ροζ'];

  // create orders
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
    if (!out.trim()) out = ddmmyyyy();

    updateOrder(index, { date: out });

    //  dd/mm/yyyy update pieces
    if (out.length === 10) {
      setPieces(prev =>
        prev.map(p => (p.sourceOrderIndex === index ? { ...p, orderDate: out } : p))
      );
    }
  };

  // pieces/ order items
  const [piecesVisible, setPiecesVisible] = useState(false);
  const [pieces, setPieces] = useState<PieceItem[]>([]);

  // error flags for item codes
  const [codeErrors, setCodeErrors] = useState<Record<number, boolean>>({});

  // validation errors per row/field --> category,color,quantity,code
  type FieldErr = 'required' | 'format' | 'max' | 'nan';
  type RowErr = {
    category?: FieldErr;
    color?: FieldErr;
    itemCode?: FieldErr;
    qty?: FieldErr;
    customer?: FieldErr; 
    paymentMethod?: FieldErr;
  };

  const [fieldErrors, setFieldErrors] = useState<Record<number, RowErr>>({});

  const flagFieldErr = (i: number, patch: Partial<RowErr>) => {
    setFieldErrors(prev => ({ ...prev, [i]: { ...(prev[i] || {}), ...patch } }));
  };

  const clearFieldErr = (i: number, key: keyof RowErr) => {
    setFieldErrors(prev => {
      const row = { ...(prev[i] || {}) };
      delete row[key];
      return { ...prev, [i]: row };
    });
  };

  const ERR_MSG: Record<FieldErr, string> = {
    required: 'Απαιτείται.',
    format: 'Μη έγκυρη μορφή (XXX999).',
    max: 'Υπερβαίνει το μέγιστο (200).',
    nan: 'Μη έγκυρη αριθμητική τιμή.',
  };


  const qtySum = useMemo(() => {
    return orders.reduce((acc, o) => {
      const n = parseInt((o.qty || '1').toString(), 10);
      return acc + (isNaN(n) || n < 1 ? 1 : n);
    }, 0);
  }, [orders]);

  // create order items for the order --> quantity & item code
  const addPiecesForOrder = async (ord: OrderItem, index?: number) => {
    const i = typeof index === 'number' ? index : 0;
    let hasErr = false;

    // Καθάρισε παλιά inline errors για αυτή τη γραμμή (ώστε να εμφανίζονται τα τρέχοντα)
    setFieldErrors(prev => ({ ...prev, [i]: {} }));

    // --- Κατηγορία ---
    if (!ord.category) {
      flagFieldErr(i, { category: 'required' });
      hasErr = true;
    } else {
      clearFieldErr(i, 'category');
    }

    // --- Χρώμα ---
    if (!ord.color) {
      flagFieldErr(i, { color: 'required' });
      hasErr = true;
    } else {
      clearFieldErr(i, 'color');
    }

    // --- Κωδικός (μορφή + μοναδικότητα) ---
    const CODE_RE = /^[A-ZΑ-Ω]{3}\d{3}$/;
    const baseCode = (ord.itemCode ?? '').trim().toUpperCase();

    if (!baseCode) {
      flagFieldErr(i, { itemCode: 'required' });
      hasErr = true;
    } else if (!CODE_RE.test(baseCode)) {
      flagFieldErr(i, { itemCode: 'format' });
      hasErr = true;
    } else {
      const baseTaken = await existsItemCode(baseCode);
      if (baseTaken) {
        setCodeErrors(prev => ({ ...prev, [i]: true }));
        return;  //live check 
      } else {
        clearFieldErr(i, 'itemCode');
        setCodeErrors(prev => ({ ...prev, [i]: false }));
      }
    }

    // --- Ποσότητα ---
    const qtyRaw = (ord.qty ?? '').toString().trim();
    const qtyParsed = parseInt(qtyRaw || '0', 10);

    if (!qtyRaw) {
      flagFieldErr(i, { qty: 'required' });
      hasErr = true;
    } else if (Number.isNaN(qtyParsed) || qtyParsed <= 0) {
      flagFieldErr(i, { qty: 'nan' });
      hasErr = true;
    } else if (qtyParsed > 200) {
      flagFieldErr(i, { qty: 'max' });
      hasErr = true;
    } else {
      clearFieldErr(i, 'qty');
    }

    // Αν υπάρχει οποιοδήποτε σφάλμα, σταμάτα εδώ (τα πλαίσια θα κοκκινίσουν από το JSX)
    if (hasErr) return;

    // --- Αν περάσει ο έλεγχος, προχώρα όπως πριν ---
    const qtyNum = Math.max(1, qtyParsed);

    const prefix = baseCode.slice(0, 3);
    const baseNum = parseInt(baseCode.slice(3), 10);
    let codes: string[] = [];

    try {
      codes = await generateSequentialCodes(prefix, baseNum, qtyNum);
    } catch (e: any) {
      Alert.alert('Προσοχή', e?.message || 'Αποτυχία δημιουργίας διαδοχικών κωδικών.');
      return;
    }

    const od = (ord.date && ord.date.length === 10) ? ord.date : ddmmyyyy();

    const newOnes: PieceItem[] = codes.map(code => ({
      category: ord.category ?? null,
      color: ord.color ?? undefined,
      status: ord.status,
      workType: ord.workType,
      code,
      orderDate: od,
      cost: '',
      sourceOrderIndex: index,
    }));

    setPieces(prev => [...prev, ...newOnes]);
    setPiecesVisible(true);

    if (typeof index === 'number') {
      setOrders(prev => prev.map((o, k) => (k === index ? makeEmptyOrder() : o)));
      // καθάρισε inline errors για αυτή τη γραμμή
      setFieldErrors(prev => ({ ...prev, [index]: {} }));
      // προαιρετικά κράτα και το δικό σου codeErrors όπως ήδη κάνεις:
      setCodeErrors(prev => ({ ...prev, [index]: false }));
    }
  };

  // update pieces/ order items
  const updatePiece = (index: number, patch: Partial<PieceItem>) => {
    setPieces(prev => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };

  // order item's cost
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

  // delete order items
  const removePiece = (index: number) => {
    setPieces(prev => prev.filter((_, i) => i !== index));
  };

  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedId) || null, [customers, selectedId]);

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
          phone:
          r.phone ?? r.mobile ?? r.mobilePhone ?? r.telephone ?? r._raw?.phone ?? r._raw?.mobile ?? r._raw?.mobile_phone ?? r._raw?.telephone ??
          '',
        }));
        setCustomers(mapped);
      } catch (err) {
        console.warn('Failed to load customers:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // NEW: Search & Pagination state 
const [searchValue, setSearchValue] = useState('');
const [debouncedQuery, setDebouncedQuery] = useState('');
const [page, setPage] = useState(1);

// debounce 300ms
useEffect(() => {
  const t = setTimeout(() => setDebouncedQuery(searchValue.trim()), 300);
  return () => clearTimeout(t);
}, [searchValue]);

// reset page όταν αλλάζει query ή λίστα πελατών
useEffect(() => { setPage(1); }, [debouncedQuery, customers]);

// filtering 
const filteredCustomers = useMemo(() => {
  if (!debouncedQuery) return customers;
  const q = debouncedQuery.toLowerCase();
  return customers.filter(c => {
    const full = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
    return (
      full.includes(q) ||
      (c.afm || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q)
    );
  });
}, [customers, debouncedQuery]);

//selidopoihsh
const PAGE_SIZE = 5;                 
const ROW_HEIGHT = 50;             
const PAGE_ROWS = PAGE_SIZE;         
const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
const startIdx = (page - 1) * PAGE_SIZE;
const pageItems = filteredCustomers.slice(startIdx, startIdx + PAGE_SIZE);
const LIST_HEIGHT = ROW_HEIGHT * PAGE_ROWS;
const SHOW_PAGINATION = totalPages > 1;
const HEADER_H = 44;                 
const PAGINATION_H = 52;            
const TABLE_CARD_HEIGHT =
  HEADER_H + LIST_HEIGHT + (SHOW_PAGINATION ? PAGINATION_H : 0);

// helpers
const goPrev = () => setPage(p => Math.max(1, p - 1));
const goNext = () => setPage(p => Math.min(totalPages, p + 1));

  const displayValue = useMemo(() => {
    if (!selectedCustomer) return 'Επιλέξτε Πελάτη';
    const full = `${selectedCustomer.firstName} ${selectedCustomer.lastName}`.trim() || '—';
    const afm = selectedCustomer.afm || '—';
    const addr = selectedCustomer.address || '—';
     const phone = selectedCustomer.phone || '—';
    return `${full} | ${afm} | ${addr} | ${phone}`; 
  }, [selectedCustomer]);

  const paymentLabels: Record<string, string> = {
    card: 'Κάρτα',
    cash: 'Μετρητά',
    bank: 'Τραπεζική κατάθεση',
    mixed: 'Μικτός τρόπος πληρωμής',
  };
  const paymentDisplay = paymentMethod ? paymentLabels[paymentMethod] : 'Επιλέξτε τρόπο πληρωμής..';


  const toggleDeposit = () => {
    setDepositEnabled(prev => {
      const next = !prev;
      if (!next) setDepositAmount('');
      return next;
    });
  };
  const [submitting, setSubmitting] = useState(false);

  const piecesCount = useMemo(() => pieces.length, [pieces]);

  const piecesCountLabel = useMemo(
    () => `${piecesCount} ${piecesCount === 1 ? 'τεμάχιο' : 'τεμάχια'}`,
    [piecesCount]
  );

  // final cost - deposit ONLY if final cost /= 0 
  const depositNum = useMemo(() => {
    if (!depositEnabled) return 0;
    const n = parseFloat((depositAmount || '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [depositEnabled, depositAmount]);

  // if final cost = 0 --> NOT -
  const netPayable = useMemo(() => {
    const tot = parseFloat(totalCost) || 0;
    if (tot <= 0) return '0.00';               
    const rem = Math.max(0, tot - depositNum); 
    return rem.toFixed(2);
  }, [totalCost, depositNum]);

  // if  AuthProvider still rehydrate
  if (authLoading) {
    return null;
  }

  // (INSERT) - create order + insert order_items
  const onCreateOrder = async () => {
    try {
      if (submitting) return;

      // check if customer is selected
      if (!selectedId) {
        flagFieldErr(0, { customer: 'required' }); 
        Alert.alert('Προσοχή', 'Παρακαλώ επιλέξτε πελάτη.');
        return;
      } else {
        clearFieldErr(0, 'customer'); // clear if chosen
      }

      // cheack if payment method is selected
      if (!paymentMethod) {
        flagFieldErr(0, { paymentMethod: 'required' });
        Alert.alert('Προσοχή', 'Παρακαλώ επιλέξτε τρόπο πληρωμής.');
        setSubmitting(false);
        return;
      } else {
        clearFieldErr(0, 'paymentMethod');
      }

      // check if user is logged in
      if (!user?.id) {
        Alert.alert('Προσοχή', 'Δεν υπάρχει συνδεδεμένος χρήστης.');
        return;
      }
      const currentUserId = user.id; 

      // dd/mm/yyy
      const orderDateDefault = (() => {
        const isDDMMYYYY = (s?: string) => !!s && /^\d{2}\/\d{2}\/\d{4}$/.test(s);
        const toISO = (s: string) => {
          const [dd, mm, yyyy] = s.split('/');
          return `${yyyy}-${mm}-${dd}`;
        };

        // from order items
        const pieceDates = pieces
          .map(p => p.orderDate)
          .filter(isDDMMYYYY) as string[];
        if (pieceDates.length) {
          return pieceDates.sort((a, b) => +new Date(toISO(b)) - +new Date(toISO(a)))[0];
        }

        //from order blocks
        const orderDates = orders
          .map(o => o.date)
          .filter(isDDMMYYYY) as string[];
        if (orderDates.length) {
          return orderDates[orderDates.length - 1];
        }

        // 3) Default:today
        return ddmmyyyy();
      })();

      // payment
      const deposit = depositEnabled
        ? parseFloat(depositAmount.replace(',', '.')) || 0
        : 0;
      const totalAmount = parseFloat(netPayable) || 0;

      // code check
      const badCode = pieces.find(p =>
        (p.code ?? '').trim() &&
        !/^[A-ZΑ-Ω]{3}\d{3}$/.test((p.code ?? '').trim().toUpperCase())
      );
      if (badCode) {
        Alert.alert('Προσοχή', 'Ο Κωδικός τεμαχίου πρέπει να είναι της μορφής XXX999 (π.χ. CHR001).');
        return;
      }

      setSubmitting(true);

      // === Δημιουργία παραγγελίας ===
      const payload: NewOrder = {
        customerId: selectedId,
        paymentMethod: paymentMethod ?? '',
        deposit,
        totalAmount,
        notes: (notes ?? '').trim() || undefined,
        orderDate: orderDateDefault,
        createdBy: currentUserId,
        orderStatus: 'Νέα',
      };

      const created = await createOrder(payload, currentUserId);
      const orderId: string = created?.id;
      if (!orderId) throw new Error('createOrder did not return id');

      // create order items
      const inserts = pieces.map(p => {
        const price = parseFloat((p.cost || '').replace(',', '.')) || 0;
        return createOrderItem(
          {
            orderId,
            item_code: (p.code ?? '').toUpperCase(),
            category: p.category ?? '',
            color: p.color ?? '',
            price,
            status: p.status ?? 'άπλυτο',
            storage_status: p.workType ?? 'Επιστροφή',
            order_date: p.orderDate || orderDateDefault,
            created_at: Date.now(),
          },
          String(currentUserId)
        );
      });

      if (inserts.length) {
        await Promise.all(inserts);
      }

      setSubmitting(false);
      setSuccessOpen(true);
    } catch (err) {
      console.warn('createOrder failed:', err);
      setSubmitting(false);
      Alert.alert('Σφάλμα', 'Κάτι πήγε στραβά κατά την καταχώρηση.');
    }
  };

  // if order is success , return to dashboard
  const onSuccessOk = () => {
    setSuccessOpen(false);
    setModalOpen(false);
   

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

            <Pressable
              onPress={() => setModalOpen(true)}
              style={[
                styles.fakeInput,
                fieldErrors[0]?.customer && styles.inputError, // ✅ κόκκινο περίγραμμα αν λείπει
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.fakeInputText,
                  !selectedCustomer && { color: '#999' },
                ]}
              >
                {displayValue}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#666" />
            </Pressable>

            {/* ✅ Κόκκινο μηνυματάκι κάτω από το input */}
            {fieldErrors[0]?.customer === 'required' && (
              <Text style={styles.helperError}>Απαιτείται.</Text>
            )}
          </View>
        </View>


        {/* Πληρωμή */}
        <View style={[styles.cardBox, { marginTop: 16 }]}>
          <View style={styles.inputWrapper}>
            <Text style={[styles.inputLabel, { marginLeft: -50 }]}>
              Πληρωμή <Text style={styles.required}>*</Text>
            </Text>

            <Pressable
              onPress={() => setPaymentOpen(v => !v)}
              style={[
                styles.fakeInput,
                fieldErrors[0]?.paymentMethod && styles.inputError, // ✅ κόκκινο περίγραμμα αν λάθος
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.fakeInputText,
                  !paymentMethod && { color: '#999' },
                ]}
              >
                {paymentDisplay}
              </Text>
              <Ionicons
                name={paymentOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#666"
              />
            </Pressable>

            {/* Dropdown επιλογών */}
            {paymentOpen && (
              <View style={styles.dropdownMenu}>
                {Object.entries(paymentLabels).map(([key, label], i) => (
                  <View key={key}>
                    {i > 0 && <View style={styles.dropdownDivider} />}
                    <Pressable
                      style={styles.dropdownItem}
                      onPress={() => {
                        setPaymentMethod(key);
                        clearFieldErr(0, 'paymentMethod'); // ✅ καθάρισε το error μόλις επιλεγεί
                        setPaymentOpen(false);
                      }}
                    >
                      <Text style={styles.dropdownItemText}>{label}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}

            {/* ✅ Κόκκινο μηνυματάκι */}
            {fieldErrors[0]?.paymentMethod === 'required' && (
              <Text style={styles.helperError}>Απαιτείται.</Text>
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

        {/* Στοιχεία παραγγελίας (πολλα) */}
        {orders.map((ord, idx) => {
          const rowErr = fieldErrors[idx] || {};
          const isLast = idx === orders.length - 1;
          const canRemove = orders.length > 1 && idx > 0;
          return (
            <View key={`order-${idx}`} style={[styles.cardBox, styles.cardBoxLarge, { marginTop: 16 }, ord.dateOpen && styles.raiseAbove,]}>
              <View style={styles.orderIconFab}>
                <Ionicons name="calendar-outline" size={22} color="#fff" />
              </View>


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
                      style={[styles.fakeInputInline, rowErr.category && styles.inputError]} 
                    >
                      <Text style={[styles.fakeInputText, !ord.category && { color: '#9CA3AF' }]}>
                        {ord.category ?? 'Επιλέξτε κατηγορία..'}
                      </Text>
                      <Ionicons name={ord.categoryOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                    </Pressable>

                    {/* red error message */}
                    {rowErr.category && (
                      <Text style={styles.helperError}>
                        {ERR_MSG[rowErr.category] }
                      </Text>
                    )}

                    {ord.categoryOpen && (
                      <View style={[styles.dropdownMenu, { marginLeft: 0, zIndex: 10 + (orders.length - idx) }]}>
                        {categoryLabels.map((label, i) => (
                          <View key={label}>
                            {i > 0 && <View style={styles.dropdownDivider} />}
                            <Pressable
                              onPress={() => {
                                updateOrder(idx, { category: label, categoryOpen: false });
                                clearFieldErr(idx, 'category');
                              }}
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
                        value={ord.qty ?? ''}                 
                        onChangeText={(t) => {
                          const clean = t.replace(/\D/g, '');  

                          if (clean.length > 0) {
                            clearFieldErr(idx, 'qty');
                          }
                          
                          updateOrder(idx, { qty: clean });  
                        }}
                        placeholder="Εισάγετε ποσότητα"
                        placeholderTextColor="#9CA3AF"
                        keyboardType={Platform.select({ ios: 'number-pad', android: 'numeric', default: 'numeric' })}
                        inputMode="numeric"
                        maxLength={3} // 0–999
                        style={[
                          styles.amountInput,
                          rowErr.qty && styles.inputError,    
                        ]}
                      />
                    </View>

                    {rowErr.qty && (
                      <Text style={styles.helperError}>
                        {ERR_MSG[rowErr.qty]} {/* 'Απαιτείται.' | 'Μη έγκυρη τιμή.' | 'Υπερβαίνει το μέγιστο (200).' */}
                      </Text>
                    )}
                  </View>


                 {/* Ημερομηνία */}
                <View style={[styles.fieldGroup,styles.popHost]}>
                  <Text style={styles.inputLabelInline}>Ημερομηνία</Text>
                  <View style={[styles.amountInputWrap, { position: 'relative' }]}>
                    <TextInput
                      value={ord.date}
                      onChangeText={(t) => onChangeOrderDateAt(idx, t)}
                      placeholder={ddmmyyyy()}
                      placeholderTextColor="#9CA3AF"
                      keyboardType="numeric"
                      maxLength={10}
                      style={[styles.amountInput, { paddingRight: 34 }]} //calender icon
                    />

                    {/* calender */}
                    <Pressable
                      onPress={() => updateOrder(idx, { dateOpen: !ord.dateOpen })}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: [{ translateY: -10 }],
                        padding: 4,
                      }}
                      hitSlop={8}
                      accessibilityLabel="Άνοιγμα ημερολογίου"
                    >
                      <Ionicons name="calendar-outline" size={18} color="#6B7280" />
                    </Pressable>
                  </View>

                  {/* Popover  */}
                 {ord.dateOpen && (
                  <View
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      zIndex: 99999,      // 🔼 Πάνω απ’ όλα
                      elevation: 1000,    // Android
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      overflow: 'hidden',
                      shadowColor: '#000',
                      shadowOpacity: 0.15,
                      shadowRadius: 8,
                      shadowOffset: { width: 0, height: 3 },
                    }}
                  >
                    <Calendar
                      initialDate={ddmmyyyyToISO(ord.date || ddmmyyyy())}
                      current={ddmmyyyyToISO(ord.date || ddmmyyyy())}
                      onDayPress={({ dateString }) => {
                        const picked = isoToDDMMYYYY(dateString);
                        updateOrder(idx, { date: picked, dateOpen: false });
                        setPieces(prev =>
                          prev.map(p => (p.sourceOrderIndex === idx ? { ...p, orderDate: picked } : p))
                        );
                      }}
                      firstDay={1}
                      hideExtraDays
                      enableSwipeMonths
                    />
                  </View>
                  )}

                </View>


                  {/* Χρώμα */}
                  <View style={[styles.fieldGroup, { minWidth: 120, flexBasis: 160 }]}>
                    <Text style={styles.inputLabelInline}>Χρώμα</Text>

                    <Pressable
                      onPress={() => updateOrder(idx, { colorOpen: !ord.colorOpen })}
                      style={[styles.fakeInputInline, rowErr.color && styles.inputError]}   // 👈 κοκκινίζει όταν έχει σφάλμα
                    >
                      <Text style={[styles.fakeInputText, !ord.color && { color: '#9CA3AF' }]}>
                        {ord.color ?? 'Επιλέξτε'}
                      </Text>
                      <Ionicons name={ord.colorOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                    </Pressable>

                    {/* 👇 μικρό κόκκινο μηνυματάκι όταν λείπει το χρώμα */}
                    {rowErr.color && (
                      <Text style={styles.helperError}>
                        {ERR_MSG[rowErr.color]} {/* συνήθως 'Απαιτείται.' */}
                      </Text>
                    )}

                    {ord.colorOpen && (
                      <View style={[styles.dropdownMenu, { marginLeft: 0, zIndex: 10 + (orders.length - idx) }]}>
                        {colorLabels.map((label, i) => (
                          <View key={label}>
                            {i > 0 && <View style={styles.dropdownDivider} />}
                            <Pressable
                              onPress={() => {
                                updateOrder(idx, { color: label, colorOpen: false });
                                clearFieldErr(idx, 'color'); 
                              }}
                              style={styles.dropdownItem}
                            >
                              <Text style={styles.dropdownItemText}>{label}</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>


                  {/* Κωδικός Τεμαχίου */}
                  <View style={[styles.fieldGroup, { minWidth: 160, flexBasis: 180 }]}>
                    <Text style={styles.inputLabelInline}>Κωδικός Τεμαχίου</Text>

                    <View style={styles.amountInputWrap}>
                      <TextInput
                        value={ord.itemCode ?? ''}
                        onChangeText={async (v) => {
                          const clean = v
                            .toUpperCase()
                            .replace(/[^A-ZΑ-Ω0-9]/g, '')
                            .slice(0, 6);

                          updateOrder(idx, { itemCode: clean });

                          if (clean.length > 0) {
                            clearFieldErr(idx, 'itemCode');
                          }

                          // live check
                          const CODE_RE = /^[A-ZΑ-Ω]{3}\d{3}$/;
                          if (CODE_RE.test(clean)) {
                            const taken = await existsItemCode(clean);
                            setCodeErrors(prev => ({ ...prev, [idx]: taken }));
                          } else {
                            setCodeErrors(prev => ({ ...prev, [idx]: false }));
                          }
                        }}
                        placeholder="π.χ. ΧΧΧ999"
                        placeholderTextColor="#9CA3AF"
                        autoCapitalize="characters"
                        maxLength={6}
                        style={[
                          styles.amountInput,
                          // Κοκκίνισε είτε από inline error (rowErr.itemCode) είτε από live taken (codeErrors[idx])
                          (rowErr.itemCode || codeErrors[idx]) && styles.inputError,
                        ]}
                      />
                    </View>

                    {/* Προτεραιότητα μηνύματος: 1) inline (submit) 2) live taken */}
                    {rowErr.itemCode ? (
                      <Text style={styles.helperError}>{ERR_MSG[rowErr.itemCode]}</Text>
                    ) : codeErrors[idx] ? (
                      <Text style={styles.helperError}>Ο κωδικός υπάρχει ήδη!</Text>
                    ) : null}
                  </View>


                  {/* Κατάσταση (dropdown) */}
                  <View style={[styles.fieldGroup, styles.dropdownHost, { minWidth: 140, flexBasis: 160 }]}>
                    <Text style={styles.inputLabelInline}>Κατάσταση</Text>
                    <Pressable
                      onPress={() => updateOrder(idx, { statusOpen: !ord.statusOpen })}
                      style={styles.fakeInputInline}
                    >
                      <Text style={styles.fakeInputText}>{ord.status}</Text>
                      <Ionicons name={ord.statusOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                    </Pressable>
                    {ord.statusOpen && (
                      <View style={[styles.dropdownMenu, { marginLeft: 0, zIndex: 20 + (orders.length - idx) }]}>
                        {(['άπλυτο','πλυμένο'] as const).map((opt, i) => (
                          <View key={opt}>
                            {i > 0 && <View style={styles.dropdownDivider} />}
                            <Pressable
                              style={styles.dropdownItem}
                              onPress={() => updateOrder(idx, { status: opt, statusOpen: false })}
                            >
                              <Text style={styles.dropdownItemText}>{opt}</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Τύπος Εργασίας */}
                  <View style={[styles.fieldGroup, { minWidth: 200, flexBasis: 220 }]}>
                    <Text style={styles.inputLabelInline}>Τύπος Εργασίας</Text>
                    <View style={[styles.chipRow, { marginLeft: 0, marginTop: 0 }]}>
                      {(['Επιστροφή','Φύλαξη'] as const).map(opt => {
                        const active = ord.workType === opt;
                        return (
                          <Pressable
                            key={opt}
                            onPress={() => updateOrder(idx, { workType: opt })}
                            style={[styles.chip, active && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>


                </View>
              </View>

             <View
                style={[styles.orderActions, ord.dateOpen && styles.demoteBelowPop]}
                pointerEvents={ord.dateOpen ? 'none' : 'auto'}  
              >
                <Pressable
                  style={[styles.primaryBtn, ord.dateOpen && styles.demoteBelowPop]} 
                  onPress={() => addPiecesForOrder(ord, idx)}
                >
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
              Τεμάχια Παραγγελίας ({piecesCountLabel})
            </Text>

            <View style={styles.piecesList}>
              {pieces.map((p, i) => (
                <View
                  key={`piece-${i}`}
                  style={[
                    styles.pieceRow,
                    { position: 'relative' },
                    p.saved && styles.pieceRowCompleted, 
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
          <Text style={styles.totalHeaderTitle}>Συνολικό κόστος</Text>

          <View style={{ gap: 8, marginTop: 8 }}>
            {/* Γραμμή: Σύνολο */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Σύνολο</Text>
              <Text style={styles.totalValue}>{totalCost} €</Text>
            </View>

            {/* Γραμμή: Προκαταβολή */}
            {depositEnabled && depositNum > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Προκαταβολή</Text>
                <Text style={styles.totalValue}>– {depositNum.toFixed(2)} €</Text>
              </View>
            )}

            <View style={styles.hDivider} />

            {/* Γραμμή: Πληρωτέο */}
            <View style={[styles.totalRow, { marginTop: 4 }]}>
              <Text style={[styles.totalLabel, { fontWeight: '700' }]}>Πληρωτέο</Text>
              <Text style={[styles.totalValue, { fontWeight: '700' }]}>{netPayable} €</Text>
            </View>
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

            {/* (1) Υπολογισμοί ύψους/σελιδοποίησης (μέσα στο render για σαφήνεια) */}
            {(() => {
              const ROW_HEIGHT = 50;               // ύψος κάθε γραμμής
              const PAGE_ROWS = PAGE_SIZE;         // π.χ. 20
              const renderedRows = Math.min(PAGE_ROWS, pageItems.length);
              const LIST_HEIGHT = Math.min(
                ROW_HEIGHT * PAGE_ROWS,
                ROW_HEIGHT * Math.max(1, renderedRows)
              );
              const SHOW_PAGINATION = totalPages > 1;

              const HEADER_H = 44;
              const PAGINATION_H = 52;
              const TABLE_CARD_HEIGHT = HEADER_H + LIST_HEIGHT + (SHOW_PAGINATION ? PAGINATION_H : 0);

              return (
                <View style={[styles.modalCard, { height: 565 }]}>
                  {/* Νέος Πελάτης  */}
                  <Pressable
                    onPress={() => {
                      setModalOpen(false);
                      router.push('/customers');
                    }}
                    style={styles.newCustomerBtn}
                  >
                    <Ionicons name="add" size={16} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.newCustomerBtnText}>Νέος Πελάτης</Text>
                  </Pressable>


                  {/* Τίτλος */}
                  <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 10 }}>
                    Επιλέξτε Πελάτη
                  </Text>

                  {/*  Search bar + customers */}
                  <View style={{ marginBottom: 6, width: '90%', alignSelf: 'center' }}>
                    <View style={[styles.amountInputWrap, { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 }]}>
                      <Ionicons name="search" size={14} color="#6B7280" style={{ marginRight: 6 }} />
                      <TextInput
                        value={searchValue}
                        onChangeText={setSearchValue}
                        placeholder="Αναζήτηση με όνομα, ΑΦΜ, διεύθυνση ή κινητό"
                        style={[styles.amountInput, { fontSize: 13, paddingVertical: 0 }]}
                        inputMode="text"
                        autoCorrect={false}
                      />
                    </View>
                    <Text style={[styles.requiredNote, { fontSize: 12 }]}>
                      Εμφανίζονται {(filteredCustomers.length === 0) ? 0 : (startIdx + 1)}–
                      {Math.min(filteredCustomers.length, startIdx + PAGE_SIZE)} από {filteredCustomers.length} πελάτες
                    </Text>
                  </View>

                  {/*  Πλαίσιο πίνακα */}
                  <View style={[styles.tableCard, { height: TABLE_CARD_HEIGHT }]}>
                    {/* Κεφαλίδα */}
                    <View style={styles.tableHeader}>
                      <Text style={[styles.th, styles.colName]}>Ονοματεπώνυμο</Text>
                      <View style={styles.vDivider} />
                      <Text style={[styles.th, styles.colAfm]}>ΑΦΜ</Text>
                      <View style={styles.vDivider} />
                      <Text style={[styles.th, styles.colAddr]}>Διεύθυνση</Text>
                      <View style={styles.vDivider} />
                      <Text style={[styles.th, styles.colPhone]}>Κινητό</Text>

                    </View>

                    {/* Λίστα (not scrolling )*/}
                    <View style={{ height: LIST_HEIGHT, overflow: 'hidden' }}>
                      {pageItems.map((c, idx) => {
                        const globalIndex = startIdx + idx;
                        const zebra = globalIndex % 2 === 1;
                        const full = `${c.firstName} ${c.lastName}`.trim();
                        const selected = selectedId === c.id;

                        return (
                          <Pressable
                            key={c.id}
                            style={[
                              styles.rowItem,
                              zebra && styles.trZebra,
                              selected && styles.rowItemSelected,
                              { height: ROW_HEIGHT, paddingVertical: 0, alignItems: 'center' },
                            ]}
                            onPress={() => {
                              setSelectedId(c.id);
                               clearFieldErr(0, 'customer');
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
                            <View style={styles.vDivider} />
                            <Text style={[styles.rowText, styles.colPhone]} numberOfLines={1}>
                              {c.phone || '—'} 
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>


                    {/*  Σελιδοποίηση  */}
                    {SHOW_PAGINATION && (
                      <View style={styles.paginationBar}>
                        <Pressable
                          onPress={goPrev}
                          disabled={page <= 1}
                          style={[styles.pageBtn, page <= 1 && styles.pageBtnDisabled]}
                        >
                          <Ionicons name="chevron-back" size={18} color={page <= 1 ? '#9CA3AF' : '#1F2A44'} />
                        </Pressable>

                        <Text style={styles.pageText}>Σελίδα {page} από {totalPages}</Text>

                        <Pressable
                          onPress={goNext}
                          disabled={page >= totalPages}
                          style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
                        >
                          <Ionicons name="chevron-forward" size={18} color={page >= totalPages ? '#9CA3AF' : '#1F2A44'} />
                        </Pressable>
                      </View>
                    )}
                  </View>

                  {/*  Κάτω actions */}
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
              );
            })()}
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

  paginationBar: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 8,
  gap: 12,
},
pageBtn: {
  backgroundColor: '#F3F4F6',
  borderRadius: 8,
  padding: 6,
  alignItems: 'center',
  justifyContent: 'center',
  width: 36,
  height: 36,
},
pageBtnDisabled: { opacity: 0.5 },
pageText: { fontSize: 14, color: '#1F2A44' },


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
  backgroundColor: '#FFFFFF',
  marginTop: 8,
  overflow: 'hidden', 
  paddingHorizontal: 4,
  paddingVertical: 4,
  ...(Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
    android: { elevation: 3 },
    web: { boxShadow: '0 4px 10px rgba(0,0,0,0.08)' } as any,
  }) as object),
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
    overflow: 'visible',
    zIndex: 1,
  },

  raiseAbove: {
    zIndex: 9999,   
    elevation: 24, 
  },

  popHost: {
  position: 'relative',
  zIndex: 10000,   
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
    width: '95%',
    maxWidth: 700,
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
    overflow: 'visible',
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
     zIndex: 0,
  },
  primaryBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 10,
    elevation: 2,
    zIndex: 0,
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

  demoteBelowPop: {
    zIndex: -1,                     
    ...(Platform.select({
      android: { elevation: 0 },    
    }) as object),
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
    zIndex: 0,
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

  colPhone: { flex: 1 }, 


  newCustomerBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#3B82F6',
    borderRadius: 9999,    
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
  },

  newCustomerBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },


    helperError: {
      fontSize: 12,
      color: '#B91C1C',
      marginTop: 4,
    },


  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 14,
    color: '#374151',
  },
  totalValue: {
    fontSize: 16,
    color: '#111827',
  },



});
