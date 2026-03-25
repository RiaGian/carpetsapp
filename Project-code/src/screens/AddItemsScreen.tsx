import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import { database } from '../database/initializeDatabase';
import { listFreeOrderItems } from '../services/orderItems';
import { assignItemToShelf, listActiveItemsOnShelf, transferItemShelf } from '../services/warehouseItems';
import { useAuth } from '../state/AuthProvider';
import { colors } from '../theme/colors';
const PURPLE = '#8B5CF6';
const PURPLE_LIGHT = '#EDE9FE';
const PURPLE_BG = 'rgba(139,92,246,0.06)'; 
const BORDER = '#E5E7EB';


export default function AddItemsScreen() {
  const { user } = useAuth()
  const actorId = String(user?.id || 'system')

  const params = useLocalSearchParams<{ shelfId?: string; shelfCode?: string; itemCount?: string }>();
  const shelfId = String(params.shelfId ?? '');
  const shelfCode = String((params.shelfCode ?? shelfId) ?? '');
  const itemCount = useMemo(() => {
    const n = Number(params.itemCount ?? '');
    return Number.isFinite(n) ? n : undefined;
  }, [params.itemCount]);

  const [activeTab, setActiveTab] = useState<'free' | 'onshelf'>('free');
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;



  const [freeItems, setFreeItems] = useState<any[]>([])
  const [loadingFree, setLoadingFree] = useState(false)
  const [assigning, setAssigning] = useState(false) 
  const [selectedItems, setSelectedItems] = useState<string[]>([]) // Array of item IDs

  const canSubmit = selectedItems.length > 0 && activeTab === 'free'
  const shelfMissing = !shelfId

  const [onShelfItems, setOnShelfItems] = useState<any[]>([])
  const [loadingOnShelf, setLoadingOnShelf] = useState(false)

  const [moveOpen, setMoveOpen] = useState(false)
  const [movingItem, setMovingItem] = useState<any | null>(null)
  const [shelves, setShelves] = useState<any[]>([])
  const [shelvesLoading, setShelvesLoading] = useState(false)
  const [shelfSearch, setShelfSearch] = useState('')
  const [pickedShelf, setPickedShelf] = useState<any | null>(null)
  const [transferring, setTransferring] = useState(false)


  // Toggle item selection
  const toggleItemSelection = (itemId: string) => {
    setSelectedItems(prev => {
      if (prev.includes(itemId)) {
        return prev.filter(id => id !== itemId)
      } else {
        return [...prev, itemId]
      }
    })
  }

  // Deselect all items
  const deselectAllItems = () => {
    setSelectedItems([])
  }

const itemLabel = (it: any) => {
  const code = it.item_code || `#${String(it.id).slice(0,6).toUpperCase()}`
  const cat  = (it.category || '').trim()
  const col  = (it.color || '').trim()
  const customer = (it.customer_name || '').trim() 
  const parts = [code, cat, col, customer, it.order_id && `(${String(it.order_id).slice(0,6)})`].filter(Boolean)
  return parts.join(' · ')
}

const reloadOnShelf = React.useCallback(async () => {
  if (!shelfId) return
  try {
    setLoadingOnShelf(true)
    const rows = await listActiveItemsOnShelf(shelfId)
    setOnShelfItems(rows)
  } catch (err) {
    console.error('reload shelf items failed:', err)
  } finally {
    setLoadingOnShelf(false)
  }
}, [shelfId])

const isUnwashedStatus = (s: any) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim() === 'απλυτο'

React.useEffect(() => {
  let cancelled = false
  ;(async () => {
    try {
      setLoadingFree(true)
      const rows = await listFreeOrderItems({ limit: 1000 })
      if (cancelled) return
      setFreeItems(rows)
    } catch (e) {
      console.error('load free items failed:', e)
    } finally {
      if (!cancelled) setLoadingFree(false)
    }
  })()
  return () => { cancelled = true }
}, [])

// All items that haven't been assigned to a shelf
const filtered = React.useMemo(() => {
  // search
  const q = (query || '').trim().toLowerCase()
  if (!q) return freeItems

  return freeItems.filter((it: any) => {
    const hay = [
      it.item_code, it.category, it.color, it.customer_name, it.order_id
    ].map(x => String(x || '').toLowerCase()).join(' | ')
    return hay.includes(q)
  })
}, [query, freeItems])

// Paginated results
const paginatedResults = React.useMemo(() => {
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  return filtered.slice(startIndex, endIndex)
}, [filtered, currentPage, itemsPerPage])

// Calculate total pages
const totalPages = Math.ceil(filtered.length / itemsPerPage)

// Reset to page 1 and clear selections when search query changes
React.useEffect(() => {
  setCurrentPage(1)
  setSelectedItems([])
}, [query])

// Select all filtered items that are washed (πλυμένο) - defined after filtered
const selectAllItems = React.useCallback(() => {
  // Only select items that are washed (πλυμένο), not unwashed (άπλυτο)
  const washedItems = filtered.filter((it: any) => {
    const status = String(it.status || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
    return status === 'πλυμενο'
  })
  const washedIds = washedItems.map((it: any) => it.id)
  setSelectedItems(washedIds)
}, [filtered])

// Check if all washed (πλυμένο) filtered items are selected (defined after filtered)
const allSelected = React.useMemo(() => {
  const washedItems = filtered.filter((it: any) => {
    const status = String(it.status || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
    return status === 'πλυμενο'
  })
  return washedItems.length > 0 && washedItems.every((it: any) => selectedItems.includes(it.id))
}, [filtered, selectedItems])

// Check if item is unwashed (άπλυτο)
const isUnwashedItem = (item: any) => {
  const status = String(item.status || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
  return status === 'απλυτο'
}

// onSubmit - add all selected items
const onSubmit = React.useCallback(async () => {
  if (selectedItems.length === 0 || !shelfId || assigning) return
  
  // Check if any selected item is unwashed (άπλυτο)
  const selectedItemsData = freeItems.filter((item: any) => selectedItems.includes(item.id))
  const unwashedItems = selectedItemsData.filter(isUnwashedItem)
  
  if (unwashedItems.length > 0) {
    const unwashedCodes = unwashedItems.map((it: any) => it.item_code || `#${String(it.id).slice(0, 6).toUpperCase()}`).join(', ')
    alert(
      `Δεν μπορείτε να προσθέσετε άπλυτα τεμάχια στο ράφι.\n\n` +
      `Τα παρακάτω τεμάχια είναι άπλυτα:\n${unwashedCodes}\n\n` +
      `Παρακαλώ πρώτα ορίστε την κατάσταση τους ως "πλυμένο" και μετά προσπαθήστε ξανά.`
    )
    return
  }
  
  try {
    setAssigning(true)
    
    // Assign all selected items to shelf
    for (const itemId of selectedItems) {
      await assignItemToShelf({ orderItemId: itemId, shelfId, userId: actorId })
    }
    
    // Remove added items from freeItems
    setFreeItems(prev => prev.filter(x => !selectedItems.includes(x.id)))
    setSelectedItems([])
    router.back()
  } catch (e: any) {
    console.error('assign to shelf failed:', e)
    alert(e?.message || 'Αποτυχία τοποθέτησης τεμαχίου στο ράφι.')
  } finally {
    setAssigning(false)
  }
}, [selectedItems, shelfId, assigning, actorId, freeItems])


React.useEffect(() => {
if (!shelfId || activeTab !== 'onshelf') return
let cancelled = false
;(async () => {
  try {
    setLoadingOnShelf(true)
    const rows = await listActiveItemsOnShelf(shelfId)
    if (cancelled) return
    setOnShelfItems(rows)
  } catch (e) {
    console.error('load shelf items failed:', e)
    if (!cancelled) setOnShelfItems([])
  } finally {
    if (!cancelled) setLoadingOnShelf(false)
  }
})()
return () => { cancelled = true }
}, [activeTab, shelfId])

React.useEffect(() => {
  if (!moveOpen) return
  let cancelled = false
  ;(async () => {
    try {
      setShelvesLoading(true)
      const rows = await database.get('shelves').query().fetch()
      const list = rows
        .map((r: any) => ({
          id: r.id,
          code: r.code || '',
          item_count: Number(r.item_count ?? 0),
          capacity: Number(r.capacity ?? 0),
        }))
        .filter(s => s.id !== shelfId) 
        .sort((a, b) => a.code.localeCompare(b.code, 'el'))
      if (!cancelled) setShelves(list)
    } catch (e) {
      console.error('load shelves for move failed:', e)
      if (!moveOpen) return
      if (!cancelled) setShelves([])
    } finally {
      if (!cancelled) setShelvesLoading(false)
    }
  })()
  return () => { cancelled = true }
}, [moveOpen, shelfId])

const shelvesFiltered = React.useMemo(() => {
  const q = shelfSearch.trim().toLowerCase()
  if (!q) return shelves
  return shelves.filter(s => s.code.toLowerCase().includes(q))
}, [shelfSearch, shelves])


const openMove = (it: any) => {
  setMovingItem(it)
  setPickedShelf(null)
  setShelfSearch('')
  setMoveOpen(true)
}

const confirmMove = async () => {
  if (!movingItem || !pickedShelf) return
  try {
    setTransferring(true)

    await transferItemShelf({
      orderItemId: movingItem.id,  // id from order_items
      toShelfId: pickedShelf.id,
      userId: actorId,
    })

    setMoveOpen(false)

    await reloadOnShelf()

  } catch (e: any) {
    console.error('transfer failed:', e)
    alert(e?.message || 'Αποτυχία μετακίνησης.')
  } finally {
    setTransferring(false)
  }
}




function StatusChip({ status }: { status?: string }) {
  const s = (status || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').trim()
  if (s === 'πλυμενο') {
    return (
      <View style={[styles.chip, styles.chipGreen]}>

        <Text style={[styles.chipText, styles.chipGreenText]}>Πλυμένο</Text>
      </View>
    )
  }
  if (s === 'απλυτο') {
    return (
      <View style={[styles.chip, styles.chipOrange]}>
        <Text style={[styles.chipText, styles.chipOrangeText]}>Άπλυτο</Text>
      </View>
    )
  }
  return null
}

function ShelfChip({ code }: { code?: string }) {
  return (
    <View style={[styles.chip, styles.chipShelf]}>
      <Ionicons name="layers-outline" size={14} color="#D97706" style={{ marginRight: 4 }} />
      <Text style={[styles.chipText, styles.chipShelfText]}>Ράφι: {code || '—'}</Text>
    </View>
  )
}


  return (
    <Page>
      <AppHeader showBack />

      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        {/* Τίτλος/Υπότιτλος */}
        <View style={{ alignItems: 'center', paddingVertical: 12 }}>
          <Text style={{ fontSize: 18, fontWeight: '400', color: '#111827' }}>
            Προσθήκη/Μετακίνηση Τεμαχίου
          </Text>
          {!!shelfCode && (
            <Text style={{ marginTop: 4, fontSize: 12, color: '#6B7280' }}>
              Ράφι {shelfCode}{typeof itemCount === 'number' ? ` · ${itemCount} τεμάχια` : ''}
            </Text>
          )}
        </View>

        <View style={styles.screenWrap}>
        {/* Tabs με “pill” ενεργό */}
        <View style={styles.tabsWrap}>
          <Pressable
            style={[styles.tabBtn, activeTab === 'free' && styles.tabBtnActive]}
            onPress={() => setActiveTab('free')}
          >
            <Ionicons
              name="cube"
              size={16}
              color={activeTab === 'free' ? '#FFFFFF' : PURPLE}
            />
            <Text style={[styles.tabText, activeTab === 'free' && styles.tabTextActive]}>
              Ελεύθερα Τεμάχια
            </Text>
          </Pressable>

          <Pressable
            style={[styles.tabBtn, activeTab === 'onshelf' && styles.tabBtnActive]}
            onPress={() => setActiveTab('onshelf')}
          >
            <Ionicons
              name="layers-outline"
              size={16}
              color={activeTab === 'onshelf' ? '#FFFFFF' : '#6B7280'}
            />
            <Text style={[styles.tabText, activeTab === 'onshelf' && styles.tabTextActive]}>
              Τεμάχια σε Ράφι
            </Text>
          </Pressable>
        </View>

        {/* Section container */}
        <View style={styles.sectionCard}>
          

          {/* if not shelfId */}
          {shelfMissing && (
            <View style={{ backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1, padding: 8, borderRadius: 8, marginTop: 8 }}>
              <Text style={{ color: '#92400E' }}>
                Λείπει αναγνωριστικό ραφιού. Επιστρέψτε πίσω και ανοίξτε ξανά από συγκεκριμένο ράφι.
              </Text>
            </View>
          )}


          {/* Πεδίο: Διαθέσιμα Ελεύθερα Τεμάχια */}
         {activeTab === 'free' && (
            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <View style={styles.dot} />
                <Text style={styles.fieldLabel}>Διαθέσιμα Ελεύθερα Τεμάχια</Text>
                <Text style={styles.required}>*</Text>
              </View>

              {/* Search Bar */}
              <View style={styles.searchRow}>
                <Ionicons name="search-outline" size={18} color="#6B7280" />
                <TextInput
                  style={[
                    styles.searchInput,
                    Platform.OS === 'web' && ({ outlineStyle: 'none', outlineWidth: 0 } as any),
                  ]}
                  placeholder="Αναζήτηση κωδικού/περιγραφής/πελάτη..."
                  placeholderTextColor="#9CA3AF"
                  value={query}
                  onChangeText={setQuery}
                />
              </View>

              {/* Select All Button */}
              {filtered.length > 0 && (
                <View
                  style={{
                    marginBottom: Platform.OS !== 'web' ? 1 : 8, // πιο μικρό κενό για κινητά
                    alignItems: 'flex-end',
                  }}
                >
                  <Pressable
                    onPress={allSelected ? deselectAllItems : selectAllItems}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      backgroundColor: allSelected ? PURPLE : '#FFFFFF',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: allSelected ? PURPLE : BORDER,
                    }}
                  >
                    <Ionicons 
                      name={allSelected ? "checkbox" : "square-outline"} 
                      size={18} 
                      color={allSelected ? '#FFFFFF' : PURPLE} 
                    />
                    <Text style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: allSelected ? '#FFFFFF' : PURPLE,
                    }}>
                      {allSelected ? 'Αποεπιλογή Όλων' : 'Επιλογή Όλων'}
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Items List */}
              {loadingFree ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="sync" size={36} color="#9CA3AF" />
                  <Text style={styles.emptyText}>Φόρτωση…</Text>
                </View>
              ) : filtered.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="file-tray-outline" size={36} color="#9CA3AF" />
                  <Text style={styles.emptyText}>Δεν βρέθηκαν διαθέσιμα τεμάχια.</Text>
                </View>
              ) : (
                <>
                  <View style={[
                      { marginTop: 6 },
                      Platform.OS !== 'web'
                        ? { height: 380, maxHeight: 380 }   // 👉 bounded ύψος σε mobile
                        : { flex: 1, maxHeight: 420 }       // web όπως ήταν
                    ]}
                  >
                    <ScrollView
                      contentContainerStyle={{ paddingBottom: 12 }}
                      showsVerticalScrollIndicator
                      persistentScrollbar
                    >
                      {paginatedResults.map((it: any) => {
                      const code = it.item_code || `#${String(it.id).slice(0,6).toUpperCase()}`
                      const normStatus = String(it.status || '')
                        .toLowerCase()
                        .normalize('NFD')
                        .replace(/\p{Diacritic}/gu,'')
                        .trim()
                      const isWashed = normStatus === 'πλυμενο'
                      const isUnwashed = normStatus === 'απλυτο'
                      const isSelected = selectedItems.includes(it.id)
                      const isItemUnwashed = isUnwashed

                      return (
                        <Pressable
                          key={it.id}
                          onPress={() => {
                            // Don't allow selection of unwashed items - do nothing
                            if (isItemUnwashed) {
                              return
                            }
                            toggleItemSelection(it.id)
                          }}
                          style={[
                            {
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 12,
                              paddingHorizontal: 12,
                              borderWidth: 1,
                              borderColor: isSelected ? PURPLE : (isItemUnwashed ? '#FCA5A5' : BORDER),
                              borderRadius: 12,
                              backgroundColor: isSelected ? PURPLE_LIGHT : (isItemUnwashed ? '#FEF2F2' : '#FFFFFF'),
                              marginBottom: 8,
                              opacity: isItemUnwashed ? 0.7 : 1,
                            },
                            shelfMissing && { opacity: 0.6 }
                          ]}
                          disabled={shelfMissing || isItemUnwashed}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>
                                {code}
                              </Text>
                              {isWashed && (
                                <View style={[styles.chip, styles.chipGreen]}>
                                  <Text style={[styles.chipText, styles.chipGreenText]}>Πλυμένο</Text>
                                </View>
                              )}
                              {isUnwashed && (
                                <View style={[styles.chip, styles.chipOrange]}>
                                  <Text style={[styles.chipText, styles.chipOrangeText]}>Άπλυτο</Text>
                                </View>
                              )}
                            </View>
                            <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 2 }}>
                              {it.category || '—'} · {it.color || '—'}
                            </Text>
                            {it.customer_name ? (
                              <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                                {it.customer_name}
                              </Text>
                            ) : null}
                            <Text style={{ fontSize: 12, color: '#059669', marginTop: 4, fontWeight: '500' }}>
                              {it.price.toFixed(2)} €
                            </Text>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={24} color={PURPLE} />
                          )}
                        </Pressable>
                      )
                      })}
                    </ScrollView>
                  </View>
                  
                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <View
                      style={[
                        styles.paginationContainer,
                        Platform.OS !== 'web' && {
                          paddingVertical: 6,
                          marginTop: 2,
                          marginBottom: 1,   // <- κόβει κενό κάτω από τα κουμπιά
                          borderTopWidth: 0,
                        },
                      ]}
                    >
                      <Pressable
                        onPress={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        style={[
                          styles.paginationButton,
                          currentPage === 1 && styles.paginationButtonDisabled
                        ]}
                      >
                        <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? '#9CA3AF' : PURPLE} />
                        <Text style={[
                          styles.paginationButtonText,
                          currentPage === 1 && styles.paginationButtonTextDisabled
                        ]}>
                          {Platform.OS !== 'web' ? 'Πίσω' : 'Προηγούμενη'}
                        </Text>
                      </Pressable>

                      <View style={styles.paginationInfo}>
                        <Text style={styles.paginationText}>
                          Σελίδα {currentPage} από {totalPages}
                        </Text>
                        <Text style={styles.paginationSubtext}>
                          ({filtered.length} {filtered.length === 1 ? 'τεμάχιο' : 'τεμάχια'})
                        </Text>
                      </View>

                      <Pressable
                        onPress={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        style={[
                          styles.paginationButton,
                          currentPage === totalPages && styles.paginationButtonDisabled
                        ]}
                      >
                        <Text style={[
                          styles.paginationButtonText,
                          currentPage === totalPages && styles.paginationButtonTextDisabled
                        ]}>
                          Επόμενη
                        </Text>
                        <Ionicons name="chevron-forward" size={20} color={currentPage === totalPages ? '#9CA3AF' : PURPLE} />
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* === TAB: Τεμάχια σε Ράφι === */}
          {activeTab === 'onshelf' && (
            <>
              <View style={styles.sectionBar}>
                <Ionicons name="layers-outline" size={18} color={PURPLE} />
                <Text style={styles.sectionBarText}>Τεμάχια στο Ράφι</Text>
              </View>

              {loadingOnShelf ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="sync" size={36} />
                  <Text style={styles.emptyText}>Φόρτωση…</Text>
                </View>
              ) : onShelfItems.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="file-tray-outline" size={36} />
                  <Text style={styles.emptyText}>Το ράφι δεν έχει τεμάχια.</Text>
                </View>
              ) : (
                <View style={{ gap: 16 }}>
                  {onShelfItems.map((it: any) => (
                    <View key={it.id} style={styles.itemRow}>
                      {/* Αριστερά: κώδικας + στοιχεία */}
                      <View style={styles.itemLeft}>
                        <View style={styles.codePill}>
                          <Text style={styles.codePillText}>
                            {it.item_code || `#${String(it.id).slice(0,6).toUpperCase()}`}
                          </Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemTitle}>
                            {(it.category || '—')} <Text style={styles.dotSep}>·</Text> {(it.color || '—')}
                          </Text>
                          <Text style={styles.itemSub}>Πελάτης: {it.customer_name || '—'}</Text>

                          <View style={styles.chipsRow}>
                            <View style={[styles.chip, styles.chipShelf]}>
                              <Ionicons name="layers-outline" size={14} color="#D97706" style={{ marginRight: 4 }} />
                              <Text style={[styles.chipText, styles.chipShelfText]}>Ράφι: {shelfCode || '—'}</Text>
                            </View>

                            {/* Status chip */}
                            {(() => {
                              const s = (it.status || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').trim()
                              if (s === 'πλυμενο') {
                                return <View style={[styles.chip, styles.chipGreen]}><Text style={[styles.chipText, styles.chipGreenText]}>Πλυμένο</Text></View>
                              }
                              if (s === 'απλυτο') {
                                return <View style={[styles.chip, styles.chipOrange]}><Text style={[styles.chipText, styles.chipOrangeText]}>Άπλυτο</Text></View>
                              }
                              return null
                            })()}
                          </View>
                        </View>
                      </View>

                      {/* Δεξιά: Μετακίνηση (UI μόνο προς το παρόν) */}
                      <Pressable style={styles.moveBtn} onPress={() => openMove(it)}>
                        <Ionicons name="swap-horizontal-outline" size={16} color="#fff" />
                        <Text style={styles.moveBtnText}>Μετακίνηση</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}


          {/* Κάρτα Προορισμού */}
          <View style={styles.destinationCard}>
            {Platform.OS !== 'web' ? (
              // 👉 mobile: "Προορισμός Ράφι A7" στην ίδια γραμμή
              <View style={[styles.destLeft, { gap: 8 }]}>
                <View style={styles.destIcon}>
                  <Ionicons name="cube" size={16} color={PURPLE} />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', flexShrink: 1 }}>
                  <Text style={[styles.destTitle, { marginRight: 6 }]}>Προορισμός</Text>

                  {shelfCode ? (
                    <Text
                      numberOfLines={1}
                      style={[styles.destSubtitle, { fontWeight: '600' }]}
                    >
                      Ράφι {shelfCode}
                    </Text>
                  ) : (
                    <Text
                      numberOfLines={1}
                      style={[styles.destSubtitle, { color: '#9CA3AF', fontStyle: 'italic' }]}
                    >
                      Δεν έχει επιλεγεί ράφι
                    </Text>
                  )}
                </View>
              </View>
            ) : (

            <View style={styles.destLeft}>
              <View style={styles.destIcon}>
                <Ionicons name="cube" size={16} color={PURPLE} />
              </View>
              <View>
                <Text style={styles.destTitle}>Προορισμός</Text>
                {shelfCode ? (
                  <Text style={styles.destSubtitle}>Ράφι {shelfCode}</Text>
                ) : (
                  <Text style={[styles.destSubtitle, { color: '#9CA3AF', fontStyle: 'italic' }]}>
                    Δεν έχει επιλεγεί ράφι
                  </Text>
                )}
              </View>
            </View>
            )}

            {typeof itemCount === 'number' && (
              <Pressable onPress={() => {}} hitSlop={8}>
                <Text style={styles.destCountLink}>{itemCount} τεμάχια</Text>
              </Pressable>
            )}
          </View>

          {/* Footer actions */}
          {activeTab === 'free' && (
            <View
              style={[
                styles.footer,
                Platform.OS !== 'web' && { marginTop: 6 }  
              ]}
            >
              <Pressable style={styles.cancelBtn} onPress={() => router.back()}>
                <Ionicons name="arrow-back" size={16} color="#374151" />
                <Text style={styles.cancelText}>Ακύρωση</Text>
              </Pressable>

              <Pressable
                style={[styles.primaryBtn, (!canSubmit || assigning) && styles.primaryBtnDisabled]}
                disabled={!canSubmit || assigning || shelfMissing}
                onPress={onSubmit}
              >
                <Ionicons name="document-text-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryText}>
                  {assigning 
                    ? `Προσθήκη ${selectedItems.length} τεμαχίων...` 
                    : selectedItems.length > 0 
                      ? `Προσθήκη ${selectedItems.length} ${selectedItems.length === 1 ? 'Τεμαχίου' : 'Τεμαχίων'}`
                      : 'Προσθήκη Τεμαχίου'
                  }
                </Text>
              </Pressable>
            </View>
          )}

        </View>
      </View>
      </ScrollView>

      {/* Move Modal */}
      <Modal visible={moveOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setMoveOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.moveModal}>
            {/* Header */}
            <View style={styles.moveHeader}>
              <View style={styles.moveIcon}>
                <Ionicons name="swap-horizontal-outline" size={20} color={colors.primary} />
              </View>
              <Text style={styles.moveTitle}>Επιβεβαίωση Μετακίνησης</Text>
            </View>

            {/* Item + From/To */}
            <View style={styles.moveCard}>
              <View style={styles.itemBadge}>
                <Text style={styles.itemBadgeText}>
                  {movingItem?.item_code || (movingItem ? `#${String(movingItem.id).slice(0,6).toUpperCase()}` : '')}
                </Text>
              </View>

              <View style={styles.rowKV}>
                <Text style={styles.kLabel}>Από:</Text>
                <View style={[styles.kPill, { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }]}>
                  <Text style={[styles.kPillText, { color: '#B45309' }]}>Ράφι {shelfCode || '—'}</Text>
                </View>
              </View>

              <View style={styles.rowKV}>
                <Text style={styles.kLabel}>Προς:</Text>
                {pickedShelf ? (
                  <View style={[styles.kPill, { borderColor: '#22C55E', backgroundColor: '#ECFDF5' }]}>
                    <Text style={[styles.kPillText, { color: '#16A34A' }]}>Ράφι {pickedShelf.code}</Text>
                  </View>
                ) : (
                  <Text style={{ color: '#6B7280', fontStyle: 'italic' }}>— επιλέξτε ράφι —</Text>
                )}
              </View>
            </View>

            {/* Search input */}
            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={18} color="#6B7280" />
              <TextInput
                style={[
                  styles.searchInput,
                  Platform.OS === 'web' && ({ outlineStyle: 'none', outlineWidth: 0 } as any),
                ]}
                placeholder="Αναζήτηση ραφιού (π.χ. A1, B2)..."
                placeholderTextColor="#9CA3AF"
                value={shelfSearch}
                onChangeText={setShelfSearch}
              />
            </View>

            {/* Λίστα ραφιών */}
            {shelvesLoading ? (
              <View style={styles.emptyBox}>
                <Ionicons name="sync" size={28} color="#9CA3AF" />
                <Text style={styles.emptyText}>Φόρτωση ραφιών…</Text>
              </View>
            ) : shelvesFiltered.length === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="file-tray-outline" size={28} color="#9CA3AF" />
                <Text style={styles.emptyText}>Δεν βρέθηκαν ράφια.</Text>
              </View>
            ) : (
              <View style={{ maxHeight: 320 }}>
                {shelvesFiltered.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setPickedShelf(s)}
                    style={[
                      styles.shelfRow,
                      pickedShelf?.id === s.id && { borderColor: colors.primary },
                    ]}
                  >
                    <Text style={styles.shelfCodeText}>Ράφι {s.code}</Text>
                    <Text style={styles.shelfMeta}>
                      {s.capacity > 0 ? `${s.item_count}/${s.capacity}` : `${s.item_count}`} τεμ.
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Actions */}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setMoveOpen(false)}>
                <Text style={styles.modalCancelText}>Ακύρωση</Text>
              </Pressable>
              <Pressable
                style={[styles.modalPick, (!pickedShelf || transferring) && { opacity: 0.6 }]}
                disabled={!pickedShelf || transferring}
                onPress={confirmMove}
              >
                <Text style={styles.modalPickText}>{transferring ? 'Μετακίνηση…' : 'Επιβεβαίωση'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </Page>
  );
}

const styles = StyleSheet.create({
  screenWrap: {
    paddingHorizontal: 16,
  },

  /* Tabs container */
  tabsWrap: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E9E7FF',
  },
  tabBtnActive: {
    backgroundColor: PURPLE,
    borderColor: PURPLE,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 3,
  },
  tabText: { color: '#6B7280', fontSize: 13, fontWeight: '400' },
  tabTextActive: { color: '#FFFFFF' },

  /* Section container με απαλό μωβ */
  sectionCard: {
    backgroundColor: PURPLE_BG,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3E8FF',
    padding: 14,
  },

  sectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PURPLE_LIGHT,
    borderColor: '#DDD6FE',
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 14,
  },
  sectionBarText: { color: '#6B21A8', fontWeight: '400' },

  fieldGroup: { 
    marginBottom: 14,
    ...(Platform.OS !== 'web' && {
    marginBottom: 2,   // <- μικρό κενό για mobile
  }),
   },

  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 99, backgroundColor: '#7C3AED' },
  fieldLabel: { fontSize: 13, color: '#111827', fontWeight: '400' },
  required: { color: '#EF4444', marginLeft: 2 },

  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
  },
  selectText: { flex: 1, fontSize: 14 },

  destinationCard: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
     ...(Platform.OS !== 'web' && {
    paddingVertical: 6, // 👉 πιο λεπτό για κινητό
    marginTop: 4,       // 👉 πιο κοντά στο pagination
  }),
  },
  destLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  destIcon: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: PURPLE_LIGHT, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  destTitle: { fontSize: 12, color: '#6B7280' },
  destSubtitle: { fontSize: 14, color: '#111827', fontWeight: '400' },
  destCountLink: { fontSize: 12, color: colors.primary, fontWeight: '400' },

  footer: { 
    flexDirection: 'row', 
    gap: 12, 
    marginTop: 16,
    ...(Platform.OS !== 'web' && {
    marginTop: 6,  
    gap: 8,
  }),
   },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    ...(Platform.OS !== 'web' && {
    paddingVertical: 3,  
    paddingHorizontal: 16,
    borderRadius: 10,
    minHeight: 40,
  }),
  },
  cancelText: { 
    color: '#374151', 
    fontSize: 14, 
    fontWeight: '400',
    ...(Platform.OS !== 'web' && { fontSize: 13 }),
   },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PURPLE,
    borderColor: PURPLE,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    ...(Platform.OS !== 'web' && {
    paddingVertical: 3,    
    paddingHorizontal: 16, 
    borderRadius: 10,
    minHeight: 40,
  }),
  },
  primaryBtnDisabled: { opacity: 1 },
  primaryText: { 
    color: '#FFFFFF', 
    fontSize: 14, 
    fontWeight: '400',
    ...(Platform.OS !== 'web' && { fontSize: 13 }),
   },


  /* Modal επιλογής */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  selectModal: {
    backgroundColor: '#FFFFFF',
    width: '98%',
    maxWidth: 760,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  selectHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  selectHeaderText: { fontWeight: '400', color: '#111827' },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
    ...(Platform.OS !== 'web' && {
    paddingVertical: 6,   // ↓ λιγότερος “αέρας”
    height: 42,           // ή 40–44 ανάλογα το γούστο
    marginBottom: 8,
  }),
  },

  searchInput: { 
    flex: 1, 
    fontSize: 14, 
    color: '#111827',
  ...(Platform.OS !== 'web' && {
    fontSize: 13,
    paddingVertical: 0,   // να μην “σπρώχνει” το ύψος
  }), },

  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 26,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
  },
  emptyText: { color: '#6B7280', marginTop: 8 },

  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    justifyContent: 'flex-end',
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  modalCancelText: { color: '#374151', fontWeight: '600' },
  modalPick: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: PURPLE,
    borderRadius: 10,
  },
  modalPickText: { color: '#FFFFFF', fontWeight: '400' },

  // items on shelf
  itemRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderWidth: 1,
  borderColor: '#BFDBFE',
  backgroundColor: '#F8FAFF',
  borderRadius: 16,
  padding: 12,
},
itemLeft: {
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: 10,
  flex: 1,
},
codePill: {
  backgroundColor: '#1D4ED8',
  borderRadius: 10,
  paddingVertical: 6,
  paddingHorizontal: 10,
  alignSelf: 'flex-start',
},
codePillText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.3 },
itemTitle: { fontWeight: '400', color: '#111827', marginBottom: 4 },
dotSep: { color: '#6B7280', fontWeight: '900' },
itemSub: { color: '#6B7280', fontSize: 12 },
chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },

chip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
chipText: { fontSize: 12, fontWeight: '400' },
chipShelf: { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' },
chipShelfText: { color: '#D97706' },
chipGreen: { borderColor: '#22C55E', backgroundColor: '#ECFDF5' },
chipGreenText: { color: '#16A34A' },
chipOrange: { borderColor: '#FB923C', backgroundColor: '#FFF7ED' },
chipOrangeText: { color: '#EA580C' },

moveBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  backgroundColor: '#3B82F6',
  borderRadius: 12,
  alignSelf: 'center',
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 6,
  elevation: 2,
   ...(Platform.OS !== 'web'
    ? { paddingHorizontal: 10, paddingVertical: 6 } 
    : { paddingHorizontal: 14, paddingVertical: 10 }),
},
moveBtnText: { color: '#fff', fontWeight: '400' },

moveModal: {
  backgroundColor: '#FFFFFF',
  width: '98%',
  maxWidth: 720,
  borderRadius: 16,
  padding: 16,
  borderWidth: 1,
  borderColor: '#E5E7EB',
},
moveHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
moveIcon: {
  width: 36, height: 36, borderRadius: 10,
  backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
},
moveTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },

moveCard: {
  borderWidth: 1, borderColor: '#DBEAFE', backgroundColor: '#EFF6FF',
  borderRadius: 12, padding: 12, marginBottom: 12,
},
itemBadge: {
  alignSelf: 'flex-start',
  backgroundColor: '#2563EB',
  paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, marginBottom: 8,
},
itemBadgeText: { color: '#fff', fontWeight: '800' },

rowKV: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
kLabel: { width: 40, color: '#374151', fontWeight: '600' },
kPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
kPillText: { fontWeight: '800' },

shelfRow: {
  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  paddingVertical: 10, paddingHorizontal: 12,
  borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
  backgroundColor: '#FFF', marginBottom: 8,
},
shelfCodeText: { fontWeight: '800', color: '#111827' },
shelfMeta: { color: '#6B7280', fontSize: 12 },

  // Pagination styles
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 0,
    ...(Platform.OS !== 'web' && {
    paddingVertical: 8, 
    marginTop: 1, 
    marginBottom: 1,     
  }),
  },
  paginationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
     ...(Platform.OS !== 'web' && {
    paddingVertical: 4, // ↓ πιο λεπτά κουμπιά
    paddingHorizontal: 10,
  }),
  },
  paginationButtonDisabled: {
    opacity: 0.5,
    ...(Platform.select({
      web: { cursor: 'not-allowed' } as any,
    }) as object),
  },
  paginationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: PURPLE,
    ...(Platform.OS !== 'web' && {
    fontSize: 13,
  }),
  },
  paginationButtonTextDisabled: {
    color: '#9CA3AF',
  },
  paginationInfo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  paginationText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2A44',
    marginBottom: 2,
    ...(Platform.OS !== 'web' && {
    fontSize: 13, // ↓ μικρότερη γραμματοσειρά
  }),
  },
  paginationSubtext: {
    fontSize: 12,
    color: '#6B7280',
  },

});
