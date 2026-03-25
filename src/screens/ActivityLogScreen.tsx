import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import { database } from '../database/initializeDatabase';
import ActivityLog from '../database/models/ActivityLog';
import { useAuth } from '../state/AuthProvider';


LocaleConfig.locales['el'] = {
  monthNames: [
    'Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος',
    'Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'
  ],
  monthNamesShort: [
    'Ιαν','Φεβ','Μαρ','Απρ','Μαϊ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'
  ],
  dayNames: [
    'Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'
  ],
  dayNamesShort: ['Κυρ','Δευ','Τρι','Τετ','Πεμ','Παρ','Σαβ'],
  today: 'Σήμερα',
};
LocaleConfig.defaultLocale = 'el';

// Helper για κοινό padding ανάλογα με το πλάτος
const edgePaddingForWidth = (w: number) => {
  if (w >= 1200) return 56;  // desktop
  if (w >= 768) return 32;   // tablet/web
  return 20;                 // mobile
};

interface ActivityLogEntry {
  id: string;
  action: string;
  details: string;
  category: 'authentication' | 'customers' | 'orders' | 'items' | 'shelves' | 'history' | 'system';
  status: 'success' | 'update' | 'error';
  user: string;
  userId?: string;
  timestamp: string;
}

interface SummaryStats {
  total: number;
  successes: number;
  updates: number;
  errors: number;
}

// color pallete
const PALETTE = {
  authentication: { from: '#8B73E6', to: '#6D35D0' }, 
  customers:      { from: '#3B82F6', to: '#2563EB' }, 
  orders:         { from: '#DFAE1A', to: '#C18407' }, 
  items:          { from: '#22C07A', to: '#059669' }, 
  shelves:        { from: '#E0629E', to: '#DB2777' },
  history:        { from: '#6366F1', to: '#4F46E5' }, 
  system:         { from: '#DC5A5A', to: '#B91C1C' },

  // Status gradients
  success:        { from: '#22C07A', to: '#059669' },
  update:         { from: '#3B82F6', to: '#2563EB' },
  error:          { from: '#DC5A5A', to: '#B91C1C' },
};




// for categories
const getCategoryGradient = (category: string) =>
  // @ts-ignore
  PALETTE[category] || { from: '#9CA3AF', to: '#6B7280' };

//  status tags (SUCCESS / UPDATE / ERROR)
const getStatusGradient = (status: string) => {
  switch (status) {
    case 'success':
      return PALETTE.success;
    case 'update':
      return PALETTE.update;
    case 'error':
      return PALETTE.error;
    default:
      return { from: '#9CA3AF', to: '#6B7280' };
  }
};


export default function ActivityLogScreen() {
  const { user, loading: authLoading } = useAuth()
  const currentUserId = String(user?.id ?? 'system')
   

  const { width } = useWindowDimensions();
  const EDGE = edgePaddingForWidth(width);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showActionDropdown, setShowActionDropdown] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [startTime, setStartTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [summaryStats, setSummaryStats] = useState<SummaryStats>({
    total: 0,
    successes: 0,
    updates: 0,
    errors: 0
  });
  const [expandedSections, setExpandedSections] = useState({
    customers: false,
    orders: false,
    items: false,
    shelves: false,
    history: false,
    authentication: false,
    system: false
  });

  const [logsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState({
    customers: 1,
    orders: 1,
    items: 1,
    shelves: 1,
    history: 1,
    authentication: 1,
    system: 1
  });

  const loadActivityLogs = useCallback(async () => {
  try {
    const logsCollection = database.get<ActivityLog>('activity_logs');
    const logs = await logsCollection.query(Q.sortBy('timestamp', Q.desc)).fetch();

    const transformedLogs: ActivityLogEntry[] = await Promise.all(
      logs.map(async (log: any) => {
        // parse details
        let parsed: any = {}
        try { parsed = log.details ? JSON.parse(log.details) : {} } catch {}

        // 1) Προσπάθησε από details.username
        let username = parsed?.username || ''

        // 2) Αλλιώς, αν έχουμε details.userId -> φέρε name από users
        if (!username && parsed?.userId) {
          try {
            const u = await database.get('users').find(String(parsed.userId))
            username = (u as any)?.name || ''
          } catch {}
        }

        // 3) Αλλιώς, αν υπάρχει relation user -> fetch
        if (!username && (log as any).user) {
          try {
            const u = await (log as any).user.fetch()
            username = (u as any)?.name || ''
          } catch {}
        }

        return {
          id: log.id,
          action: log.action,
          details: log.details || '',
          category: (log.category as any) || getCategoryFromAction(log.action),
          status: (log.status as any) || getStatusFromAction(log.action),
          user: username || 'Unknown User',            // 👈 τώρα θα βρίσκει όνομα
          timestamp: log.timestamp || new Date().toISOString()
        }
      })
    )

    setActivityLogs(transformedLogs);
    calculateSummaryStats(transformedLogs);
  } catch (error) {
    console.error('❌ Error loading activity logs:', error);
  }
}, [])

  // === helpers για format ===
const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
const addMonthsStr = (ymStr: string, delta: number) => {
  const [y, m] = ymStr.split('-').map(Number);
  const d = new Date(y, (m - 1) + delta, 1);
  return ym(d);
};


  const [leftMonth, setLeftMonth] = useState(ym(new Date()));
  const rightMonth = addMonthsStr(leftMonth, 1);


  const buildMarkedDates = () => {
    const marked: Record<string, any> = {};
    if (!startDate) return marked;

    const startStr = toYMD(startDate);
    const end = endDate ? new Date(toYMD(endDate)) : new Date(startStr);
    const start = new Date(startStr);


    let d = new Date(start);
    while (d <= end) {
      const ds = toYMD(d);
      marked[ds] = { color: '#BFDBFE', textColor: '#111827' }; 
      d.setDate(d.getDate() + 1);
    }


    marked[startStr] = { ...(marked[startStr] || {}), startingDay: true, color: '#2563EB', textColor: '#fff' };
    const endStr = toYMD(end);
    marked[endStr] = { ...(marked[endStr] || {}), endingDay: true, color: '#2563EB', textColor: '#fff' };

    return marked;
  };

    // Button label helper 
  const formatRangeLabel = () => {
    const fmt = (iso?: string) => {
      if (!iso) return '';
      return new Date(iso).toLocaleDateString('el-GR'); // μόνο ημερομηνία
    };

    if (dateFrom && dateTo) return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
    if (dateFrom) return `${fmt(dateFrom)} – …`;
    return 'Ημερομηνία';
  };


  const onPickDay = (dateObj: { dateString: string }) => {
    const picked = new Date(dateObj.dateString);
   
    if (!startDate || (startDate && endDate)) {
      setStartDate(picked);
      setEndDate(undefined as any); 
      return;
    }

    if (picked < startDate) {

      setStartDate(picked);
    } else {
      setEndDate(picked);
    }
  };



  // Load activity logs from database
  useEffect(() => {
    loadActivityLogs();
  }, [loadActivityLogs]);

  const getCategoryFromAction = (action: string): 'authentication' | 'customers' | 'orders' | 'items' | 'shelves' | 'history' | 'system' => {
    if (action.includes('LOGIN') || action.includes('LOGOUT') || action.includes('PASSWORD') || action.includes('DEVICE') || action.includes('SESSION')) {
      return 'authentication';
    } else if (action.includes('CUSTOMER')) {
      return 'customers';
    } else if (action.includes('ORDER')) {
      return 'orders';
    } else if (action.includes('ITEM')) {
      return 'items';
    } else if (action.includes('SHELF')) {
      return 'shelves';
    } else if (action.includes('HISTORY') || action.includes('EXPORT') || action.includes('VIEW')) {
      return 'history';
    } else {
      return 'system';
    }
  };

  const getStatusFromAction = (action: string): 'success' | 'update' | 'error' => {
    if (action.includes('ERROR') || action.includes('FAILURE') || action.includes('UNAUTHORIZED') || action.includes('VALIDATION') || action.includes('DUPLICATE') || action.includes('NETWORK')) {
      return 'error';
    } else if (action.includes('UPDATE') || action.includes('CHANGE') || action.includes('TRANSFER') || action.includes('MOVE') || action.includes('REMOVE')) {
      return 'update';
    } else {
      return 'success';
    }
  };

  const calculateSummaryStats = (logs: ActivityLogEntry[]) => {
    const stats: SummaryStats = {
      total: logs.length,
      successes: logs.filter(log => log.status === 'success').length,
      updates: logs.filter(log => log.status === 'update').length,
      errors: logs.filter(log => log.status === 'error').length
    };
    setSummaryStats(stats);
  };

  const filteredLogs = activityLogs.filter(log => {
    const matchesCategory = selectedCategory === 'all' || log.category === selectedCategory;
    const matchesAction = selectedAction === 'all' || log.action === selectedAction;
    
    // Date filtering
    let matchesDate = true;
    if (dateFrom || dateTo) {
      const logDate = new Date(log.timestamp);
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        matchesDate = matchesDate && logDate >= fromDate;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999); // End of day
        matchesDate = matchesDate && logDate <= toDate;
      }
    }
    
    return matchesCategory && matchesAction && matchesDate;
  });

  const getLogsByCategory = (category: 'authentication' | 'customers' | 'orders' | 'items' | 'shelves' | 'history' | 'system') => {
    return filteredLogs.filter(log => log.category === category);
  };

  const getPaginatedLogs = (category: 'authentication' | 'customers' | 'orders' | 'items' | 'shelves' | 'history' | 'system') => {
    const categoryLogs = getLogsByCategory(category);
    const startIndex = (currentPage[category] - 1) * logsPerPage;
    const endIndex = startIndex + logsPerPage;
    return categoryLogs.slice(startIndex, endIndex);
  };

  const getTotalPages = (category: 'authentication' | 'customers' | 'orders' | 'items' | 'shelves' | 'history' | 'system') => {
    const categoryLogs = getLogsByCategory(category);
    return Math.ceil(categoryLogs.length / logsPerPage);
  };

  const goToPage = (category: 'authentication' | 'customers' | 'orders' | 'items' | 'shelves' | 'history' | 'system', page: number) => {
    setCurrentPage(prev => ({
      ...prev,
      [category]: page
    }));
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  const getActionIcon = (action: string, status: string) => {
    if (status === 'error') return 'close-circle';
    if (action.includes('login')) return 'log-in';
    if (action.includes('logout')) return 'log-out';
    if (action.includes('add') || action.includes('create')) return 'add-circle';
    if (action.includes('update') || action.includes('edit')) return 'create';
    return 'checkmark-circle';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return '#10B981';
      case 'update': return '#3B82F6';
      case 'error': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'authentication': return '#8B5CF6';
      case 'customers': return '#3B82F6';
      case 'orders': return '#F59E0B';
      case 'items': return '#10B981';
      case 'shelves': return '#EC4899';
      case 'history': return '#6366F1';
      case 'system': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'authentication': return 'lock-closed';
      case 'customers': return 'person';
      case 'orders': return 'cart';
      case 'items': return 'cube';
      case 'shelves': return 'library';
      case 'history': return 'time';
      case 'system': return 'warning';
      default: return 'document';
    }
  };

  const getCategoryTitle = (category: string) => {
    switch (category) {
      case 'authentication': return 'Πιστοποίηση';
      case 'customers': return 'Πελάτες';
      case 'orders': return 'Παραγγελίες';
      case 'items': return 'Τεμάχια';
      case 'shelves': return 'Ράφια';
      case 'history': return 'Ιστορικό';
      case 'system': return 'Σύστημα';
      default: return 'Άλλο';
    }
  };

  const getActionLabel = (action: string) => {
    const actionLabels: { [key: string]: string } = {
      'LOGIN_SUCCESS': 'Επιτυχής σύνδεση',
      'LOGIN_FAILURE': 'Αποτυχημένη σύνδεση',
      'LOGOUT': 'Αποσύνδεση',
      'PASSWORD_RESET_REQUESTED': 'Αίτημα επαναφοράς κωδικού',
      'PASSWORD_RESET_SUCCESS': 'Επαναφορά κωδικού',
      'DEVICE_REGISTERED': 'Εγγραφή συσκευής',
      'SESSION_EXPIRED': 'Λήξη session',
      'CREATE_CUSTOMER': 'Δημιουργία πελάτη',
      'UPDATE_CUSTOMER': 'Ενημέρωση πελάτη',
      'DELETE_CUSTOMER': 'Διαγραφή πελάτη',
      'ADD_CUSTOMER_PHONE': 'Προσθήκη τηλεφώνου',
      'UPDATE_CUSTOMER_PHONE': 'Ενημέρωση τηλεφώνου',
      'DELETE_CUSTOMER_PHONE': 'Διαγραφή τηλεφώνου',
      'ADD_CUSTOMER_ADDRESS': 'Προσθήκη διεύθυνσης',
      'UPDATE_CUSTOMER_ADDRESS': 'Ενημέρωση διεύθυνσης',
      'DELETE_CUSTOMER_ADDRESS': 'Διαγραφή διεύθυνσης',
      'CREATE_ORDER': 'Δημιουργία παραγγελίας',
      'UPDATE_ORDER': 'Ενημέρωση παραγγελίας',
      'DELETE_ORDER': 'Διαγραφή παραγγελίας',
      'ADD_ORDER_ITEM': 'Προσθήκη τεμαχίου',
      'UPDATE_ORDER_ITEM': 'Ενημέρωση τεμαχίου',
      'DELETE_ORDER_ITEM': 'Διαγραφή τεμαχίου',
      'ORDER_PAYMENT_UPDATED': 'Ενημέρωση πληρωμής',
      'ORDER_STATUS_CHANGED': 'Αλλαγή κατάστασης',
      'CREATE_ITEM': 'Δημιουργία τεμαχίου',
      'UPDATE_ITEM_STATUS': 'Αλλαγή κατάστασης τεμαχίου',
      'UPDATE_ITEM_DETAILS': 'Ενημέρωση στοιχείων τεμαχίου',
      'DELETE_ITEM': 'Διαγραφή τεμαχίου',
      'MOVE_ITEM_TO_SHELF': 'Μετακίνηση σε ράφι',
      'REMOVE_ITEM_FROM_SHELF': 'Αφαίρεση από ράφι',
      'TRANSFER_ITEM_SHELF': 'Μεταφορά ραφιού',
      'ITEM_STORAGE_STATUS_CHANGED': 'Αλλαγή κατάστασης φύλαξης',
      'CREATE_SHELF': 'Δημιουργία ραφιού',
      'UPDATE_SHELF': 'Ενημέρωση ραφιού',
      'DELETE_SHELF': 'Διαγραφή ραφιού',
      'SHELF_CAPACITY_UPDATED': 'Ενημέρωση χωρητικότητας',
      'SHELF_QR_SCANNED': 'Σάρωση QR ραφιού',
      'ITEMS_SCANNED_TO_SHELF': 'Μαζική προσθήκη τεμαχίων',
      'VIEW_CUSTOMER_HISTORY': 'Προβολή ιστορικού',
      'FILTER_HISTORY_APPLIED': 'Εφαρμογή φίλτρων',
      'EXPORT_HISTORY_PDF': 'Εξαγωγή PDF',
      'VIEW_WAREHOUSE_SUMMARY': 'Σύνοψη αποθήκης',
      'VALIDATION_ERROR': 'Σφάλμα επαλήθευσης',
      'DUPLICATE_ENTRY_DETECTED': 'Ανίχνευση διπλότυπου',
      'NETWORK_ERROR_RETRY': 'Επανάληψη δικτύου',
      'UNAUTHORIZED_ACCESS_ATTEMPT': 'Αυθαίρετη πρόσβαση'
    };
    return actionLabels[action] || action;
  };

  return (
     <Page>
        
        <AppHeader showBack />
        <View style={{ height: 4 }} />

        {/* Filter */}
        <View style={styles.searchSection}>
          
          <View style={styles.filterRow}>
            <View style={styles.categoryDropdownContainer}>
              <Pressable 
                style={styles.categoryDropdownButton}
                onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
              >
                <Ionicons name="filter" size={20} color="#6B7280" />
                <Text style={styles.categoryDropdownText}>
                  {selectedCategory === 'all' ? 'Όλες οι κατηγορίες' : getCategoryTitle(selectedCategory as any)}
                </Text>
                <Ionicons name={showCategoryDropdown ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
              </Pressable>
            </View>
            
            <View style={styles.advancedFilterContainer}>
              <Pressable
                style={styles.advancedFilterButton}
                onPress={() => setShowDatePicker(v => !v)}
              >
                <Ionicons name="calendar" size={20} color="#6B7280" />
                <Text style={styles.advancedFilterText}>{formatRangeLabel()}</Text>
                <Ionicons name={showDatePicker ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
              </Pressable>
            </View>

            <View style={styles.actionDropdownContainer}>
              <Pressable 
                style={styles.actionDropdownButton}
                onPress={() => setShowActionDropdown(!showActionDropdown)}
              >
                <Ionicons name="list" size={20} color="#6B7280" />
                <Text style={styles.actionDropdownText}>
                  {selectedAction === 'all' ? 'Όλες οι ενέργειες' : `${selectedAction} (${getActionLabel(selectedAction)})`}
                </Text>
                <Ionicons name={showActionDropdown ? "chevron-up" : "chevron-down"} size={16} color="#6B7280" />
              </Pressable>
            </View>
          </View>

          {showDatePicker && (
            <View style={styles.dateDropdownSmall}>
              <View style={styles.dateDropdownHeader}>
                <Text style={styles.dateDropdownTitle}>Επιλογή περιόδου</Text>
                <Pressable onPress={() => setShowDatePicker(false)}>
                  <Ionicons name="close" size={20} color="#6B7280" />
                </Pressable>
              </View>

              <View style={styles.dateDropdownCalendars}>
                <Calendar
                  firstDay={1}
                  key={leftMonth}
                  current={leftMonth}
                  markingType="period"
                  markedDates={buildMarkedDates()}
                  onDayPress={onPickDay}
                  enableSwipeMonths
                  onMonthChange={(m) => setLeftMonth(`${m.year}-${pad(m.month)}-01`)}
                  onPressArrowLeft={(subtractMonth) => {
                    const next = addMonthsStr(leftMonth, -1);
                    setLeftMonth(next);    
                    subtractMonth?.();     
                  }}
                  onPressArrowRight={(addMonth) => {
                    const next = addMonthsStr(leftMonth, +1);
                    setLeftMonth(next);
                    addMonth?.();          
                  }}
                  theme={{
                    textDayFontSize: Platform.OS !== 'web' ? 12 : 14,
                    textMonthFontSize: Platform.OS !== 'web' ? 13 : 15,
          
                    todayTextColor: '#3B82F6',
                    selectedDayBackgroundColor: '#2563EB',
                    monthTextColor: '#111827',
                    arrowColor: '#111827',
                  }}
                  style={{ width: 260 }}
                />

                <Calendar
                  firstDay={1}
                  key={`right-${rightMonth}`}
                  current={rightMonth} 
                  markingType="period"
                  markedDates={buildMarkedDates()}
                  onDayPress={onPickDay}
                  enableSwipeMonths={false}
                  onPressArrowLeft={(subtractMonth) => {
                    const next = addMonthsStr(leftMonth, -1);
                    setLeftMonth(next);
                    subtractMonth?.();
                  }}
                  onPressArrowRight={(addMonth) => {
                    const next = addMonthsStr(leftMonth, +1);
                    setLeftMonth(next);
                    addMonth?.();
                  }}
                  theme={{
                    textDayFontSize: 14,
                    textMonthFontSize: 15,
                    todayTextColor: '#3B82F6',
                    selectedDayBackgroundColor: '#2563EB',
                    monthTextColor: '#111827',
                    arrowColor: '#111827',
                  }}
                  style={{ width: 260 }}
                />
              </View>

              <View style={styles.dateDropdownButtons}>
                <Pressable
                  style={styles.clearBtn}
                  onPress={() => {
                    setDateFrom('');
                    setDateTo('');
                    setStartDate(new Date());
                    setEndDate(new Date());
                    setShowDatePicker(false);
                  }}
                >
                  <Text style={styles.clearText}>Καθαρισμός</Text>
                </Pressable>

                <Pressable
                  style={styles.applyBtn}
                  onPress={() => {
                    if (!startDate) return setShowDatePicker(false);
                    setDateFrom(startDate.toISOString());
                    setDateTo((endDate || startDate).toISOString());
                    setShowDatePicker(false);
                  }}
                >
                  <Text style={styles.applyText}>Εφαρμογή</Text>
                </Pressable>
              </View>
            </View>
          )}


        </View>


        {/* Summary Cards */}
        {Platform.OS === 'web' ? (
          <View style={styles.summaryCards}>
            <View style={[styles.summaryCard, styles.totalCard]}>
              <Text style={[styles.summaryNumber, { color: '#8B5CF6' }]}>{summaryStats.total}</Text>
              <Text style={styles.summaryLabel}>Σύνολο</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryNumber, { color: '#10B981' }]}>{summaryStats.successes}</Text>
              <Text style={styles.summaryLabel}>Επιτυχίες</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryNumber, { color: '#3B82F6' }]}>{summaryStats.updates}</Text>
              <Text style={styles.summaryLabel}>Ενημερώσεις</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={[styles.summaryNumber, { color: '#EF4444' }]}>{summaryStats.errors}</Text>
              <Text style={styles.summaryLabel}>Σφάλματα</Text>
            </View>
          </View>
        ) : (
          // Android/iOS
          <>
            <View style={[styles.summaryCards, { justifyContent: 'space-between', marginBottom: 4 }]}>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryNumber, { color: '#8B5CF6' }]}>{summaryStats.total}</Text>
                <Text style={styles.summaryLabel}>Σύνολο</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryNumber, { color: '#10B981' }]}>{summaryStats.successes}</Text>
                <Text style={styles.summaryLabel}>Επιτυχίες</Text>
              </View>
            </View>

            <View style={[styles.summaryCards, { justifyContent: 'space-between', marginTop: 2 }]}>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryNumber, { color: '#3B82F6' }]}>{summaryStats.updates}</Text>
                <Text style={styles.summaryLabel}>Ενημερώσεις</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={[styles.summaryNumber, { color: '#EF4444' }]}>{summaryStats.errors}</Text>
                <Text style={styles.summaryLabel}>Σφάλματα</Text>
              </View>
            </View>
          </>
        )}


        {/* Activity Log Sections */}
        <ScrollView 
          style={styles.logsContainer}
          showsVerticalScrollIndicator={false}
        >
          {(['customers', 'orders', 'items', 'shelves', 'history', 'authentication', 'system'] as const).map((category) => {
            const categoryLogs = getLogsByCategory(category);
            const paginatedLogs = getPaginatedLogs(category);
            const totalPages = getTotalPages(category);
            const isExpanded = expandedSections[category];
            
            return (
              <View key={category} style={styles.logSection}>
                {(() => {
                  const grad = getCategoryGradient(category);
                  return (
                    <LinearGradient
                      colors={[grad.from, grad.to]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={styles.sectionHeaderGradient}
                    >

                      <View style={styles.glossOverlay} pointerEvents="none" />

                      <Pressable
                        onPress={() => toggleSection(category)}
                        style={({ pressed }) => [
                          styles.sectionHeaderPressable,
                          pressed && { opacity: 0.95 } 
                        ]}
                      >
                        <View style={styles.sectionHeaderLeft}>
                          <Ionicons
                            name={getCategoryIcon(category) as any}
                            size={20}
                            color="white"
                          />
                          <Text style={styles.sectionTitle}>
                            {getCategoryTitle(category)} {categoryLogs.length}
                          </Text>
                        </View>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color="white"
                        />
                      </Pressable>
                    </LinearGradient>
                  );
                })()}

                {isExpanded && (
                  <View style={styles.sectionContent}>
                    {paginatedLogs.map((log) => {
                      const sg = getStatusGradient(log.status);
                      return (
                        <View key={log.id} style={styles.logEntry}>
                          <View style={styles.logEntryHeader}>
                            <Ionicons
                              name={getActionIcon(log.action, log.status) as any}
                              size={20}
                              color={getStatusColor(log.status)}
                            />
                            <Text style={styles.logAction}>{log.action}</Text>

                            {/* Gradient status tag */}
                            <LinearGradient
                              colors={[sg.from, sg.to]}
                              start={{ x: 0, y: 0.5 }}
                              end={{ x: 1, y: 0.5 }}
                              style={[
                                styles.statusTagGradient,
                                log.status === 'success' && { shadowColor: 'rgba(16,185,129,0.55)' },
                                log.status === 'update'  && { shadowColor: 'rgba(59,130,246,0.55)' },
                                log.status === 'error'   && { shadowColor: 'rgba(239,68,68,0.55)' },
                              ]}
                            >
                              <Text style={styles.statusTagText}>
                                {log.status.toUpperCase()}
                              </Text>
                            </LinearGradient>
                          </View>

                          <Text style={styles.logDetails}>
                            {(() => {
                              try {
                                const detailsObj = JSON.parse(log.details);
                                if (detailsObj.username && detailsObj.email) {
                                  return `${detailsObj.username} (${detailsObj.email})`;
                                } else if (detailsObj.username) {
                                  return detailsObj.username;
                                } else if (detailsObj.email) {
                                  return detailsObj.email;
                                }
                                return log.details;
                              } catch {
                                return log.details;
                              }
                            })()}
                          </Text>

                          <View style={styles.logMeta}>
                            <View style={styles.logMetaItem}>
                              <Ionicons name="person" size={14} color="#6B7280" />
                              <Text style={styles.logMetaText}>{log.user}</Text>
                            </View>
                            <View style={styles.logMetaItem}>
                              <Ionicons name="time" size={14} color="#6B7280" />
                              <Text style={styles.logMetaText}>{formatDate(log.timestamp)}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                      <View style={styles.paginationContainer}>
                        <Pressable
                          style={[
                            styles.paginationButton,
                            currentPage[category] === 1 && styles.paginationButtonDisabled,
                          ]}
                          onPress={() => goToPage(category, currentPage[category] - 1)}
                          disabled={currentPage[category] === 1}
                        >
                          <Text
                            style={[
                              styles.paginationButtonText,
                              currentPage[category] === 1 && styles.paginationButtonTextDisabled,
                            ]}
                          >
                            Προηγούμενο
                          </Text>
                        </Pressable>

                        <Text style={styles.paginationInfo}>
                          Σελίδα {currentPage[category]} από {totalPages}
                        </Text>

                        <Pressable
                          style={[
                            styles.paginationButton,
                            currentPage[category] === totalPages && styles.paginationButtonDisabled,
                          ]}
                          onPress={() => goToPage(category, currentPage[category] + 1)}
                          disabled={currentPage[category] === totalPages}
                        >
                          <Text
                            style={[
                              styles.paginationButtonText,
                              currentPage[category] === totalPages && styles.paginationButtonTextDisabled,
                            ]}
                          >
                            Επόμενο
                          </Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
</View>

            );
          })}
        </ScrollView>
      

      {/* Category Dropdown Modal */}
      <Modal visible={showCategoryDropdown} transparent animationType="fade">
        <Pressable 
          style={styles.categoryModalOverlay}
          onPress={() => setShowCategoryDropdown(false)}
        >
          <View style={styles.categoryModalContainer}>
            <View style={styles.categoryModalHeader}>
              <Text style={styles.categoryModalTitle}>Επιλογή Κατηγορίας</Text>
              <Pressable onPress={() => setShowCategoryDropdown(false)} style={styles.categoryModalCloseButton}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>
            
            <View style={styles.categoryModalContent}>
              {[
                { value: 'all', label: 'Όλες οι κατηγορίες', icon: 'checkmark' },
                { value: 'authentication', label: 'Πιστοποίηση', icon: 'lock-closed' },
                { value: 'customers', label: 'Πελάτες', icon: 'people' },
                { value: 'orders', label: 'Παραγγελίες', icon: 'document-text' },
                { value: 'items', label: 'Τεμάχια', icon: 'cube' },
                { value: 'shelves', label: 'Ράφια', icon: 'library' },
                { value: 'history', label: 'Ιστορικό & Αναφορές', icon: 'bar-chart' },
                { value: 'system', label: 'Σφάλματα Συστήματος', icon: 'warning' }
              ].map((category) => (
                <Pressable
                  key={category.value}
                  style={styles.categoryModalItem}
                  onPress={() => {
                    setSelectedCategory(category.value);
                    setSelectedAction('all');
                    setShowCategoryDropdown(false);
                  }}
                >
                  <Ionicons 
                    name={category.icon as any} 
                    size={20} 
                    color={selectedCategory === category.value ? '#3B82F6' : '#6B7280'} 
                  />
                  <Text style={[
                    styles.categoryModalItemText,
                    selectedCategory === category.value && styles.categoryModalItemTextActive
                  ]}>
                    {category.label}
                  </Text>
                  {selectedCategory === category.value && (
                    <Ionicons name="checkmark" size={20} color="#3B82F6" />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        </Pressable>
      </Modal>

     

      {/* Action Dropdown Modal */}
      <Modal visible={showActionDropdown} transparent animationType="fade">
        <Pressable 
          style={styles.actionModalOverlay}
          onPress={() => setShowActionDropdown(false)}
        >
          <View style={styles.actionModalContainer}>
            <View style={styles.actionModalHeader}>
              <Text style={styles.actionModalTitle}>Επιλογή Ενέργειας</Text>
              <Pressable onPress={() => setShowActionDropdown(false)} style={styles.actionModalCloseButton}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </Pressable>
            </View>
            
            <View style={styles.actionModalContent}>
              <ScrollView
                showsVerticalScrollIndicator={true}     
                persistentScrollbar={true}             
                indicatorStyle="default"    
                contentContainerStyle={{ paddingBottom: 8 }}
                style={{ maxHeight: 420 }}          
              >
                {[
                  { value: 'all', label: 'Όλες οι ενέργειες' },
                  // Authentication
                  { value: 'LOGIN_SUCCESS', label: 'Επιτυχής σύνδεση' },
                  { value: 'LOGIN_FAILURE', label: 'Αποτυχημένη σύνδεση' },
                  { value: 'LOGOUT', label: 'Αποσύνδεση' },
                  { value: 'PASSWORD_RESET_REQUESTED', label: 'Αίτημα επαναφοράς κωδικού' },
                  { value: 'PASSWORD_RESET_SUCCESS', label: 'Επαναφορά κωδικού' },
                  { value: 'DEVICE_REGISTERED', label: 'Εγγραφή συσκευής' },
                  { value: 'SESSION_EXPIRED', label: 'Λήξη session' },
                  // Customers
                  { value: 'CREATE_CUSTOMER', label: 'Δημιουργία πελάτη' },
                  { value: 'UPDATE_CUSTOMER', label: 'Ενημέρωση πελάτη' },
                  { value: 'DELETE_CUSTOMER', label: 'Διαγραφή πελάτη' },
                  { value: 'ADD_CUSTOMER_PHONE', label: 'Προσθήκη τηλεφώνου' },
                  { value: 'UPDATE_CUSTOMER_PHONE', label: 'Ενημέρωση τηλεφώνου' },
                  { value: 'DELETE_CUSTOMER_PHONE', label: 'Διαγραφή τηλεφώνου' },
                  { value: 'ADD_CUSTOMER_ADDRESS', label: 'Προσθήκη διεύθυνσης' },
                  { value: 'UPDATE_CUSTOMER_ADDRESS', label: 'Ενημέρωση διεύθυνσης' },
                  { value: 'DELETE_CUSTOMER_ADDRESS', label: 'Διαγραφή διεύθυνσης' },
                  // Orders
                  { value: 'CREATE_ORDER', label: 'Δημιουργία παραγγελίας' },
                  { value: 'UPDATE_ORDER', label: 'Ενημέρωση παραγγελίας' },
                  { value: 'DELETE_ORDER', label: 'Διαγραφή παραγγελίας' },
                  { value: 'ADD_ORDER_ITEM', label: 'Προσθήκη τεμαχίου' },
                  { value: 'UPDATE_ORDER_ITEM', label: 'Ενημέρωση τεμαχίου' },
                  { value: 'DELETE_ORDER_ITEM', label: 'Διαγραφή τεμαχίου' },
                  { value: 'ORDER_PAYMENT_UPDATED', label: 'Ενημέρωση πληρωμής' },
                  { value: 'ORDER_STATUS_CHANGED', label: 'Αλλαγή κατάστασης' },
                  // Items
                  { value: 'CREATE_ITEM', label: 'Δημιουργία τεμαχίου' },
                  { value: 'UPDATE_ITEM_STATUS', label: 'Αλλαγή κατάστασης τεμαχίου' },
                  { value: 'UPDATE_ITEM_DETAILS', label: 'Ενημέρωση στοιχείων τεμαχίου' },
                  { value: 'DELETE_ITEM', label: 'Διαγραφή τεμαχίου' },
                  { value: 'MOVE_ITEM_TO_SHELF', label: 'Μετακίνηση σε ράφι' },
                  { value: 'REMOVE_ITEM_FROM_SHELF', label: 'Αφαίρεση από ράφι' },
                  { value: 'TRANSFER_ITEM_SHELF', label: 'Μεταφορά ραφιού' },
                  { value: 'ITEM_STORAGE_STATUS_CHANGED', label: 'Αλλαγή κατάστασης φύλαξης' },
                  // Shelves
                  { value: 'CREATE_SHELF', label: 'Δημιουργία ραφιού' },
                  { value: 'UPDATE_SHELF', label: 'Ενημέρωση ραφιού' },
                  { value: 'DELETE_SHELF', label: 'Διαγραφή ραφιού' },
                  { value: 'SHELF_CAPACITY_UPDATED', label: 'Ενημέρωση χωρητικότητας' },
                  { value: 'SHELF_QR_SCANNED', label: 'Σάρωση QR ραφιού' },
                  { value: 'ITEMS_SCANNED_TO_SHELF', label: 'Μαζική προσθήκη τεμαχίων' },
                  // History
                  { value: 'VIEW_CUSTOMER_HISTORY', label: 'Προβολή ιστορικού' },
                  { value: 'FILTER_HISTORY_APPLIED', label: 'Εφαρμογή φίλτρων' },
                  { value: 'EXPORT_HISTORY_PDF', label: 'Εξαγωγή PDF' },
                  { value: 'VIEW_WAREHOUSE_SUMMARY', label: 'Σύνοψη αποθήκης' },
                  // System
                  { value: 'VALIDATION_ERROR', label: 'Σφάλμα επαλήθευσης' },
                  { value: 'DUPLICATE_ENTRY_DETECTED', label: 'Ανίχνευση διπλότυπου' },
                  { value: 'NETWORK_ERROR_RETRY', label: 'Επανάληψη δικτύου' },
                  { value: 'UNAUTHORIZED_ACCESS_ATTEMPT', label: 'Αυθαίρετη πρόσβαση' }
                ].map((action) => (
                  <Pressable
                    key={action.value}
                    style={styles.actionModalItem}
                    onPress={() => {
                      setSelectedAction(action.value);
                      setShowActionDropdown(false);
                    }}
                  >
                    <Text style={[
                      styles.actionModalItemText,
                      selectedAction === action.value && styles.actionModalItemTextActive
                    ]}>
                      {action.value === 'all' ? action.label : `${action.value} (${action.label})`}
                    </Text>
                    {selectedAction === action.value && (
                      <Ionicons name="checkmark" size={20} color="#3B82F6" />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Pressable>
      </Modal>


  </Page>
  );
}


const styles = StyleSheet.create({

  sectionHeaderGradient: {
  borderRadius: 12,
  marginBottom: 8,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.15,
  shadowRadius: 10,
  elevation: 6,
},
sectionHeaderPressable: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderRadius: 12,
},
statusTagGradient: {
  paddingHorizontal: 10,
  paddingVertical: 5,
  borderRadius: 8,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.6,
  shadowRadius: 10,
  elevation: 4,
},


  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
  },
  header: {
    paddingVertical: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backText: {
    fontSize: 16,
    color: '#374151',
    marginLeft: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  searchSection: {
    flexDirection: 'row',
    marginBottom: 24,
    gap: 12,
    position: 'relative',
  zIndex: 9000,   
  },
  summaryCards: {
    flexDirection: 'row',
    marginBottom: 24,
    flexWrap: 'wrap',
    gap: 12,
      ...(Platform.OS !== 'web' && {
      marginTop: 10,        
      marginBottom: 18,     
      gap: 10,
      rowGap: 4, 
      columnGap: 6,
    }),
  },

  summaryCard: {
  flex: 1,
  backgroundColor: '#F9FAFB',
  borderRadius: 16,
  paddingVertical: 20,
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 4, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 12,
  elevation: 6,
  borderWidth: 1,
  borderColor: '#E5E7EB',
  ...(Platform.OS !== 'web' && {
     width: '50%',        
    marginBottom: 0,    
    paddingVertical: 6, 
  }),
},
  totalCard: {
    flex: 1.2,
  },
  summaryNumber: {
  fontSize: 26,
  fontWeight: '500',
  textShadowColor: 'rgba(0, 0, 0, 0.1)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 2,
  marginBottom: 6,
},
  summaryLabel: {
  fontSize: 15,
  fontWeight: '500',
  color: '#6B7280',
  letterSpacing: 0.3,
},
  logsContainer: {
    flex: 1,
  },
  logSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 8,
    zIndex: 1,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 12,
  },
  sectionContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  logEntry: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  logEntryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  logAction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 12,
    flex: 1,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
  },
  logDetails: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  logMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  logMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logMetaText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  paginationButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  paginationButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  paginationButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
  },
  paginationButtonTextDisabled: {
    color: '#9CA3AF',
  },
  paginationInfo: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
     ...(Platform.OS !== 'web' && {
    flexDirection: 'column',   // κάθετα στη στοίχιση
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',             // 🔹 να πιάνουν όλο το πλάτος
    gap: 50,
    marginVertical: 15,
  }),
  },

  advancedFilterText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    marginLeft: 4,
  },
  filterGroup: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '600',
    marginBottom: 8,
  },
  dateInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    fontSize: 14,
    color: '#374151',
  },
  filterActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  clearFiltersButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#EF4444',
    borderRadius: 8,
  },
  clearFiltersText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  applyFiltersButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#10B981',
    borderRadius: 8,
    marginLeft: 8,
  },
  applyFiltersText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  categoryDropdownContainer: {
    flex: 1,
    marginRight: 12,
    position: 'relative',
    ...(Platform.OS !== 'web' && {
    marginRight: 0,
    width: '100%',
  }),
  },
  categoryDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 8,
    width: '100%', 
    minHeight: 40,
    ...(Platform.OS !== 'web' && {
    minHeight: 44,      
    paddingVertical: 8,   
    justifyContent: 'center',


  }),
  },
  categoryDropdownText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    textAlign: Platform.OS !== 'web' ? 'center' : 'left', ...(Platform.OS !== 'web' && {
    flex: 0,
     }),
  },
  categoryModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  categoryModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  categoryModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  categoryModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  categoryModalCloseButton: {
    padding: 4,
  },
  categoryModalContent: {
    padding: 20,
  },
  categoryModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  categoryModalItemText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  categoryModalItemTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },


  actionFilterContainer: {
    marginTop: 8,
  },
  actionFilterScroll: {
    maxHeight: 120,
  },
  actionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  actionChipSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  actionChipText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  actionChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  actionDropdownContainer: {
    flex: 1,
    marginLeft: 12,
    ...(Platform.OS !== 'web' && {
    marginLeft: 0,
    width: '100%',
    marginTop: 6,
  }),
  },
  actionDropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 8,
    width: '100%', 
    minHeight: 44,
    ...(Platform.OS !== 'web' && {
    minHeight: 44,
    paddingVertical: 8,justifyContent: 'center',
  }),
  },
  actionDropdownText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    textAlign: Platform.OS !== 'web' ? 'center' : 'left',
    ...(Platform.OS !== 'web' && {
    flex: 0,                    // ✅ να κάτσει δίπλα στο icon
    marginHorizontal: 6,
  }),
  },
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  actionModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  actionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  actionModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
  },
  actionModalCloseButton: {
    padding: 4,
  },
  actionModalContent: {
    padding: 20,
    maxHeight: 400,
  },
  actionModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  actionModalItemText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  actionModalItemTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },

  glossOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '50%',
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
  backgroundColor: 'rgba(255,255,255,0.25)',
  opacity: 0.25,
},

advancedFilterContainer: {
  flex: 1,   
  ...(Platform.OS !== 'web' && {
    width: '100%',
    marginTop: 6,
  }),           // κάνει το κουμπί να έχει ίδιο πλάτος με τα άλλα δύο
},

advancedFilterButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 16,
  paddingVertical: 12,
  backgroundColor: '#FFFFFF',
  borderRadius: 8,
  borderWidth: 1,
  borderColor: '#D1D5DB',
  gap: 8,
  width: '100%',
  minHeight: 58,
   ...(Platform.OS !== 'web' && {
    minHeight: 44,
    paddingVertical: 8,
  }),
},


doubleCalendarRow: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    flexWrap: 'nowrap', 
    marginBottom: 12,
  },
  calendar: {
    borderRadius: 12,
     width: 300,     
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    padding: 6,
    flexGrow: 1,
    minWidth: 300, // για tablet/web· σε κινητό θα στοιχίσει κάθετα λόγω wrap
  },
  timePickersWrap: {
    flexDirection: 'row',
    gap: 24,
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    marginTop: 8,
  },


  datePickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  datePickerModalContainer: {
    width: '95%',
    maxWidth: 830,  
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
  },
  datePickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  datePickerModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  datePickerModalCloseButton: {
    padding: 6,
  },
  datePickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 12,
  },
  datePickerClearButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  datePickerApplyButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  datePickerClearText: { color: '#111827', fontWeight: '600' },
  datePickerApplyText: { color: 'white', fontWeight: '600' },

  // time inputs (αν δεν υπάρχουν ήδη)
  datePickerSection: { minWidth: 260 },
  datePickerLabel: { color: '#4B5563', marginBottom: 4, fontWeight: '600' },
  datePickerValue: { color: '#111827', marginBottom: 8 },
  timePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timePickerLabel: { color: '#6B7280' },
  timeInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 80,
    color: '#111827',
  },

  dateDropdown: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E7EB',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },

  dateDropdownSmall: {
  position: 'absolute',
  top: 72, 
  right: 720,
  zIndex: 1000,
  backgroundColor: '#fff',
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#E5E7EB',
  padding: 10,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.15,
  shadowRadius: 10,
  elevation: 6,
  width: 540,
  ...(Platform.OS !== 'web' && {
    right: 'auto',
    left: '50%',
    top: '50%',
    width: 270,                         
    padding: 4,                        
    transform: [{ translateX: -120 }, { translateY: -100 }],
    borderRadius: 10,
    shadowOpacity: 0.2,
  }),
},
dateDropdownHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 6,
},
dateDropdownTitle: {
  fontSize: 14,
  fontWeight: '600',
  color: '#111827',
},
dateDropdownCalendars: {
  flexDirection: 'row',
  justifyContent: 'space-between',
   ...(Platform.OS !== 'web' && {
    flexDirection: 'column',   // 📱 στοιχίζει κάθετα
    gap: 8,                    // μικρό κενό μεταξύ τους
  }),
},
dateDropdownButtons: {
  flexDirection: 'row',
  justifyContent: 'flex-end',
  marginTop: 8,
  gap: 6,
},
clearBtn: {
  paddingVertical: 6,
  paddingHorizontal: 12,
  backgroundColor: '#F3F4F6',
  borderRadius: 8,
},
clearText: {
  fontSize: 13,
  color: '#374151',
  fontWeight: '600',
},
applyBtn: {
  paddingVertical: 6,
  paddingHorizontal: 12,
  backgroundColor: '#3B82F6',
  borderRadius: 8,
},
applyText: {
  fontSize: 13,
  color: 'white',
  fontWeight: '700',
},


});
