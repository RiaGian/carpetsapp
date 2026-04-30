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
  const [selectOpen, setSelectOpen] = useState(false);
  const [query, setQuery] = useState('');



  const [freeItems, setFreeItems] = useState<any[]>([])
  const [loadingFree, setLoadingFree] = useState(false)
  const [assigning, setAssigning] = useState(false) 
  const [selectedItem, setSelectedItem] = useState<any | null>(null)

  const canSubmit = !!selectedItem && activeTab === 'free'
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


  // onSubmit
const onSubmit = async () => {
  if (!selectedItem || !shelfId || assigning) return
  try {
    setAssigning(true)
    await assignItemToShelf({ orderItemId: selectedItem.id, shelfId, userId: actorId })
    setFreeItems(prev => prev.filter(x => x.id !== selectedItem.id))
    setSelectedItem(null)
    router.back()
  } catch (e: any) {
    console.error('assign to shelf failed:', e)
    alert(e?.message || 'Αποτυχία τοποθέτησης τεμαχίου στο ράφι.')
  } finally {
    setAssigning(false)
  }
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

// not un-washed items on shelves
const filtered = React.useMemo(() => {
  // not un-washed 
  const washedOnly = freeItems.filter((it: any) => !isUnwashedStatus(it.status))

  // search
  const q = (query || '').trim().toLowerCase()
  if (!q) return washedOnly

  return washedOnly.filter((it: any) => {
    const hay = [
      it.item_code, it.category, it.color, it.customer_name, it.order_id
    ].map(x => String(x || '').toLowerCase()).join(' | ')
    return hay.includes(q)
  })
}, [query, freeItems])


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

              <Pressable
                style={[
                  styles.select,
                  shelfMissing && { opacity: 0.6 } // οπτική ένδειξη ότι είναι κλειδωμένο
                ]}
                onPress={() => {
                  if (shelfMissing) return
                  setSelectOpen(true)
                }}
                disabled={shelfMissing}
              >
                <Ionicons name="search-outline" size={18} color="#9CA3AF" />
                <Text
                  style={[styles.selectText, { color: selectedItem ? '#111827' : '#9CA3AF' }]}
                  numberOfLines={1}
                >
                  {selectedItem
                    ? itemLabel(selectedItem)
                    : 'Επιλέξτε τεμάχιο για προσθήκη στο ράφι...'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#9CA3AF" />
              </Pressable>

              {/* helper κειμενάκι (προαιρετικό) */}
              {!selectedItem && !shelfMissing && (
                <Text style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>
                  Πάτησε για αναζήτηση και επιλογή τεμαχίου.
                </Text>
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

            {typeof itemCount === 'number' && (
              <Pressable onPress={() => {}} hitSlop={8}>
                <Text style={styles.destCountLink}>{itemCount} τεμάχια</Text>
              </Pressable>
            )}
          </View>

          {/* Footer actions */}
          {activeTab === 'free' && (
            <View style={styles.footer}>
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
                  {assigning ? 'Προσθήκη...' : 'Προσθήκη Τεμαχίου'}
                </Text>
              </Pressable>
            </View>
          )}

        </View>
      </View>

      {/* Select Modal (χωρίς δεδομένα προς το παρόν) */}
      <Modal visible={selectOpen} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setSelectOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.selectModal}>
            <View style={styles.selectHeader}>
              <Ionicons name="checkbox-outline" size={18} color={PURPLE} />
              <Text style={styles.selectHeaderText}>Επιλέξτε Τεμάχιο</Text>
            </View>

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


           {/* Body του modal */}
                {/* Body του modal */}
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
  <View style={{ flex: 1, maxHeight: 420, marginTop: 6 }}>
    <ScrollView
      contentContainerStyle={{ paddingBottom: 12 }}
      showsVerticalScrollIndicator
      persistentScrollbar
    >
      {filtered.map((it: any) => {
        const code = it.item_code || `#${String(it.id).slice(0,6).toUpperCase()}`
        const normStatus = String(it.status || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu,'')
          .trim()
        const isWashed = normStatus === 'πλυμενο'
        const isUnwashed = normStatus === 'απλυτο'

        return (
          <Pressable
            key={it.id}
            onPress={() => setSelectedItem(it)}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 12,
                marginBottom: 8,
                backgroundColor: '#FFF',
              },
              selectedItem?.id === it.id && { borderColor: PURPLE },
            ]}
          >
            {/* Αριστερά: pill κωδικού + στοιχεία */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 }}>
              <View style={styles.codePill}>
                <Text style={styles.codePillText}>{code}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '800', color: '#111827' }} numberOfLines={1}>
                  {(it.category || '—')} <Text style={{ color:'#6B7280', fontWeight: '900' }}>·</Text> {(it.color || '—')}
                </Text>
                {it.customer_name ? (
                  <Text style={{ color: '#6B7280', fontSize: 12 }} numberOfLines={1}>
                    Πελάτης: {it.customer_name}
                  </Text>
                ) : null}

                {/* chips (ΧΩΡΙΣ ράφι εδώ) */}
                <View style={{ flexDirection:'row', gap:8, marginTop:8 }}>
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
              </View>
            </View>

            {selectedItem?.id === it.id && (
              <Ionicons name="checkmark-circle" size={20} color={PURPLE} />
            )}
          </Pressable>
        )
      })}
    </ScrollView>
  </View>
)}



            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setSelectOpen(false)}>
                <Text style={styles.modalCancelText}>Κλείσιμο</Text>
              </Pressable>
              <Pressable
                style={[styles.modalPick, !selectedItem && { opacity: 0.6 }]}
                disabled={!selectedItem}
                onPress={() => {
                  if (!selectedItem) return
                  setSelectOpen(false)
                }}
              >
                <Text style={styles.modalPickText}>Χρήση επιλεγμένου</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
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

  fieldGroup: { marginBottom: 14 },
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

  footer: { flexDirection: 'row', gap: 12, marginTop: 16 },
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
  },
  cancelText: { color: '#374151', fontSize: 14, fontWeight: '400' },
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
  },
  primaryBtnDisabled: { opacity: 1 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '400' },

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
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },

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
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 12,
  alignSelf: 'center',
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 6,
  elevation: 2,
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


});
