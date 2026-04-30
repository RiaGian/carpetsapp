//npm install @react-native-async-storage/async-storage

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import { colors } from '../theme/colors';

// ⬇️ ΝΕΟ: hook για global preview (χωρίς fetch/DB)
import { usePreview } from '../state/PreviewProvider';

// Types
type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  addresses: string[];
  phones: string[];
  afm?: string;
  receiptNo: string;
  pricePerSqm?: string;
  description?: string;

  // future  sync με DB
  createdAt: string;     
  updatedAt: string;     
  pendingSync: boolean; 
  serverId?: string;     
};

const normalize = (s: string) =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const isAFM = (q: string) => /^\d{9}$/.test(q); // 9 
const isPhone = (q: string) => /^\d{7,}$/.test(q); // FIX IT

// "file name" in local storage
const STORAGE_KEY = 'customers:v1';
const uid = () => `cst_${Math.random().toString(36).slice(2, 10)}`;

// loads customers from local storage (AsyncStorage
async function loadCustomersFromStorage(): Promise<Customer[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    // parse the JSON string --> Js object
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
// saves customers to local storage (AsyncStorage)
async function saveCustomersToStorage(customers: Customer[]) {
  // customer list --> JSON string --> save STORAGE_KEY
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <Text>{text}</Text>;
  const nq = normalize(query);
  const nt = normalize(text);
  const idx = nt.indexOf(nq);
  if (idx === -1) return <Text>{text}</Text>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + query.length);
  const after = text.slice(idx + query.length);
  return (
    <Text>
      {before}
      <Text style={{ fontWeight: '800' }}>{match}</Text>
      {after}
    </Text>
  );
}

//  Screen 
export default function CustomersScreen() {
  // ⬇️ ΝΕΟ: setter για να γράφουμε την προεπισκόπηση που θα δει το Dashboard
  const { setCustomersPreview } = usePreview();

  // List of costumers (persistent)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // search
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // modal state
  const [openForm, setOpenForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [addresses, setAddresses] = useState<string[]>(['']);
  const [phones, setPhones] = useState<string[]>(['']);
  const [afm, setAfm] = useState('');
  const [receiptNo, setReceiptNo] = useState('');
  const [pricePerSqm, setPricePerSqm] = useState('');
  const [description, setDescription] = useState('');

  // load from disk 
  useEffect(() => {
    (async () => {
      const data = await loadCustomersFromStorage();
      setCustomers(data);
      setLoading(false);

      // ⬇️ ΝΕΟ: Γράψε προεπισκόπηση για το Dashboard (χωρίς fetch)
      const count = data.length;
      const names = data
        .slice(0, 2)
        .map((c) => (`${c.firstName ?? ''} ${c.lastName ?? ''}`).trim() || '—');
      setCustomersPreview({ count, names });
    })();
  }, [setCustomersPreview]);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebounced(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // search results
  const results = useMemo(() => {
    const q = debounced.trim();
    if (!q) return customers;

    if (isAFM(q)) return customers.filter(c => (c.afm ?? '').includes(q));
    if (isPhone(q)) return customers.filter(c => c.phones.some(p => (p ?? '').includes(q)));

    const nq = normalize(q);
    return customers.filter(c => {
      const fullName = `${c.firstName} ${c.lastName}`.trim();
      const hay = [fullName, ...c.addresses].map(x => normalize(x ?? '')).join(' | ');
      return hay.includes(nq) || hay.indexOf(nq) >= 0;
    });
  }, [debounced, customers]);

  const onCreateCustomer = () => {
    setFirstName(''); setLastName('');
    setAddresses(['']); setPhones(['']);
    setAfm(''); setReceiptNo(''); setPricePerSqm(''); setDescription('');
    setOpenForm(true);
  };

  function openCustomerCard(customer: Customer) {
    Alert.alert('Καρτέλα Πελάτη', `${customer.firstName} ${customer.lastName}`);
  }

  const addAddress = () => setAddresses(prev => [...prev, '']);
  const addPhone = () => setPhones(prev => [...prev, '']);
  const updateAddress = (idx: number, val: string) =>
    setAddresses(prev => prev.map((a, i) => (i === idx ? val : a)));
  const updatePhone = (idx: number, val: string) =>
    setPhones(prev => prev.map((p, i) => (i === idx ? val : p)));
  const removeAddress = (idx: number) => setAddresses(prev => prev.filter((_, i) => i !== idx));
  const removePhone = (idx: number) => setPhones(prev => prev.filter((_, i) => i !== idx));

  // save costumer --> (σε μνήμη + δίσκο)
  async function handleSaveCustomer() {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Σφάλμα', 'Το όνομα και το επώνυμο είναι υποχρεωτικά.');
      return;
    }
    const cleanPhones = phones.map(p => p.trim()).filter(Boolean);
    const cleanAddresses = addresses.map(a => a.trim()).filter(Boolean);
    if (cleanPhones.length === 0) {
      Alert.alert('Σφάλμα', 'Πρέπει να προσθέσεις τουλάχιστον ένα τηλέφωνο.');
      return;
    }
    if (cleanAddresses.length === 0) {
      Alert.alert('Σφάλμα', 'Πρέπει να προσθέσεις τουλάχιστον μία διεύθυνση.');
      return;
    }
    if (!receiptNo.trim()) {
      Alert.alert('Σφάλμα', 'Το πεδίο "Αρ. Δελτίου Παραλαβής" είναι υποχρεωτικό.');
      return;
    }

    const now = new Date().toISOString();
    const newCustomer: Customer = {
      id: uid(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      addresses: cleanAddresses,
      phones: cleanPhones,
      afm: afm.trim() || undefined,
      receiptNo: receiptNo.trim(),
      pricePerSqm: pricePerSqm.trim() || undefined,
      description: description.trim() || '—',
      createdAt: now,
      updatedAt: now,
      pendingSync: true,
    };

    const next = [newCustomer, ...customers];
    setCustomers(next);
    await saveCustomersToStorage(next);

    // ⬇️ ΝΕΟ: Ενημέρωσε την προεπισκόπηση για το Dashboard
    setCustomersPreview({
      count: next.length,
      names: next
        .slice(0, 2)
        .map((c) => (`${c.firstName ?? ''} ${c.lastName ?? ''}`).trim() || '—'),
    });

    setOpenForm(false);
    Alert.alert('OK', 'Ο πελάτης προστέθηκε στη λίστα.');
  }

  return (
    <Page>
      <AppHeader showBack onLogout={() => router.replace('/')} />

      {/* Ενέργειες */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onCreateCustomer}
          activeOpacity={0.9}
        >
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

      {/* ΚΟΥΤΙ ΛΙΣΤΑΣ */}
      <View style={{ flex: 1, marginTop: 10 }}>
        <View style={styles.panel}>
          {/* Τίτλος επάνω στο κουτί */}
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
                const fullName = `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim();
                return (
                  <TouchableOpacity style={styles.row} onPress={() => openCustomerCard(item)}>
                    {/* avatar ΑΡΙΣΤΕΡΑ */}
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(item.firstName?.[0] || item.lastName?.[0] || 'Π').toUpperCase()}
                      </Text>
                    </View>

                    {/* κέντρο: όνομα πάνω, από κάτω τηλέφωνο + κατοικία */}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>
                        <Highlight text={fullName || '—'} query={debounced} />
                      </Text>

                      <View style={styles.detailsColumn}>
                        <Text style={styles.detailText}>
                          {item.phones?.[0] ? `☎ ${item.phones[0]}` : '☎ —'}
                        </Text>
                        <Text
                          style={styles.detailText}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {item.addresses?.[0] ? `📍 ${item.addresses[0]}` : '📍 —'}
                        </Text>
                      </View>
                    </View>

                    {/* δεξιά: (κενό προς το παρόν) */}
                    <View style={{ width: 6 }} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>

      {/*   Φόρμα δημιουργίας Νέου Πελάτη  */}
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
              {/*  Όνομα | Επώνυμο */}
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

              {/*  Διευθύνσεις */}
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

              {/*  Αρ. Δελτίου Παραλαβής | Τιμή/τ.μ */}
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

              {/* περιγραφή (text) */}
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

            {/* Actions (center) */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => {
                  setOpenForm(false);
                  router.push('/dashboard');
                }}
                style={styles.secondaryBtn}
              >
                <Text style={styles.secondaryBtnText}>Ακύρωση</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveCustomer}
                style={[styles.primaryBtn, { marginLeft: 12 }]}
              >
                <Text style={styles.primaryBtnText}>Αποθήκευση</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.requiredNote}>Τα πεδία με * είναι υποχρεωτικά</Text>
          </View>
        </View>
      </Modal>
    </Page>
  );
}

// ----------------- Styles -----------------
const styles = StyleSheet.create({
  actionsRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 1 },
      web: {},
    }) as object),
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },

  searchBox: {
    flexBasis: 380,
    height: 40,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
    paddingHorizontal: 6,
    textAlignVertical: 'center',
    fontWeight: '500',
  },

  countText: { marginTop: 10, fontSize: 12, color: colors.muted },

  // «κουτί» λίστας
  panel: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 12,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: '#F1F1F3',
  },

  // avatar ΑΡΙΣΤΕΡΑ
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E9F2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#1F2A44', fontWeight: '800', fontSize: 16 },

  // όνομα πάνω
  rowTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
    marginBottom: 6,
  },

  // τηλέφωνο + κατοικία από κάτω (σε 2 γραμμές)
  detailsColumn: {
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    color: colors.muted,
  },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  emptySubtitle: { marginTop: 6, fontSize: 13, color: colors.muted },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    width: '90%',
    maxWidth: 630,
    minHeight: 580,
    maxHeight: '97%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 34,
    ...(Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 4 },
      web: {},
    }) as object),
  },
  modalHeader: { marginBottom: 12, alignItems: 'center' },
  modalTitle: { fontSize: 20, color: '#000', fontWeight: '400', textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 4 },

  label: { fontSize: 12, color: colors.text, marginBottom: 6, fontWeight: '700' },
  inputWrap: { marginBottom: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  textarea: { minHeight: 120, textAlignVertical: 'top' },

  row2: { flexDirection: 'row', gap: 12 },
  flex1: { flex: 1 },

  group: { marginBottom: 12 },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  linkBtn: { paddingVertical: 6, paddingHorizontal: 8 },
  linkBtnText: { color: colors.primary, fontWeight: '800', fontSize: 13 },
  removeBtn: {
    backgroundColor: '#F2F2F2',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  removeBtnText: { color: '#666', fontWeight: '800' },

  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -10,
    paddingHorizontal: -5,
  },
  secondaryBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  secondaryBtnText: { color: '#374151', fontWeight: '800', fontSize: 14 },

  requiredNote: {
    marginTop: 8,
    fontSize: 11,
    color: colors.muted,
    textAlign: 'center',
  },

  backgroundArea: {
    flex: 1,
    backgroundColor: '#F5F5F6',
    paddingTop: 12,
    paddingHorizontal: 12,
  },

  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start', 
    marginBottom: 12,
    paddingLeft: 4, 
  },

  panelIcon: {
    fontSize: 20,
    marginRight: 6,
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: colors.text,
  },
});
