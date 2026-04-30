import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import AppHeader from '../components/AppHeader';
import Page from '../components/Page';
import { database } from '../database/initializeDatabase';
import Shelf from '../database/models/Shelf';
import { logCreateShelf, logDeleteShelf, logItemStorageStatusChanged, logUpdateShelf } from '../services/activitylog';
import { updateOrderItem } from '../services/orderItems';
import { listActiveItemsOnShelf, listAllActiveWarehouseItems, removeItemFromShelf } from '../services/warehouseItems';
import { useAuth } from '../state/AuthProvider';
import { colors } from '../theme/colors';



// Helper για κοινό padding ανάλογα με το πλάτος  
const edgePaddingForWidth = (w: number) => {
  if (w >= 1200) return 56;  // desktop
  if (w >= 768) return 32;   // tablet/web
  return 20;                 // mobile
};

interface ShelfData {
  id: string;
  code: string;
  barcode: string;
  floor: number;
  capacity: number;
  notes?: string;
  item_count: number;
  created_at: number;
}

export default function WarehouseScreen() {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const EDGE = edgePaddingForWidth(width);
  const isWide = width >= 768;

  // Get user info from route params
  const params = useLocalSearchParams<{ name?: string; email?: string }>();
  const currentUser = {
    name: (params.name ?? '').toString(),
    email: (params.email ?? '').toString(),
  };

  const [shelves, setShelves] = useState<ShelfData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedShelf, setSelectedShelf] = useState<ShelfData | null>(null);
  const [shelfToDelete, setShelfToDelete] = useState<ShelfData | null>(null);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showShelfDetail, setShowShelfDetail] = useState(false);
  const [selectedShelfDetail, setSelectedShelfDetail] = useState<ShelfData | null>(null);
  const [showOverview, setShowOverview] = useState(false)
  const [showItemsModal, setShowItemsModal] = useState(false);

  const [shelfSearchIndexById, setShelfSearchIndexById] = useState<Record<string, string>>({});
  const [shelfSearchIndexByCode, setShelfSearchIndexByCode] = useState<Record<string, string>>({});

  
  // Get current user ID for logging
  const getCurrentUserId = async () => {
    try {
      // logged-in user  Auth
      if (user?.id) {
        return String(user.id)
      }

      // else find from email
      if (currentUser.email) {
        const users = await database.get('users').query().fetch()
        const found = users.find((u: any) => (u as any).email === currentUser.email)
        if (found?.id) return found.id
      }

      // Fallback
      const users = await database.get('users').query().fetch()
      return users.length > 0 ? users[0].id : 'system'
    } catch (error) {
      console.error('❌ Error getting current user:', error)
      return 'system'
    }
  }


  // Load shelves from database
  const loadShelves = useCallback(async () => {
  try {
    const shelvesCollection = database.get<Shelf>('shelves');
    const shelvesData = await shelvesCollection.query().fetch();
    
    // Transform shelves to match our interface
    const transformedShelves: ShelfData[] = shelvesData.map((shelf: any) => ({
      id: shelf.id,
      code: shelf.code || '',
      barcode: shelf.barcode || shelf.code || '',
      floor: shelf.floor || 1,
      capacity: shelf.capacity || 0,
      notes: shelf.notes || '',
      item_count: shelf.item_count || 0,
      created_at: shelf.created_at || Date.now()
    }));


    transformedShelves.sort((a, b) => b.created_at - a.created_at);

    setShelves(transformedShelves);

    try {
      const allItems = await listAllActiveWarehouseItems();

      const byId: Record<string, string> = {};
      const byCode: Record<string, string> = {};

      for (const it of allItems) {

        const sid   = (it as any)?.shelf_id   != null ? String((it as any).shelf_id)   : '';
        const scode = (it as any)?.shelf_code ? String((it as any).shelf_code)         : '';


        const tokens = [
          it.item_code,
          it.customer_name,
          it.color,
          it.category,
          it.status,
          it.storage_status,
          it.order_date,
        ]
          .filter((x): x is string => !!x) 
          .map(x => x.toString().toLowerCase());

        const blob = ' ' + tokens.join(' ');

        if (sid)   byId[sid]     = (byId[sid]     || '') + blob;
        if (scode) byCode[scode] = (byCode[scode] || '') + blob;
      }

      setShelfSearchIndexById(byId);
      setShelfSearchIndexByCode(byCode);
    } catch (e) {
      console.error(' building shelf search index failed', e);
      setShelfSearchIndexById({});
      setShelfSearchIndexByCode({});
    }
  } catch (error) {
    console.error(' Error loading shelves:', error);
  }
}, []);


  useFocusEffect(
    useCallback(() => {
      loadShelves()
    }, [loadShelves])
  )

  // Filter shelves based on search query
  const filteredShelves = shelves.filter((shelf) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;

    // Αναζήτηση στα πεδία του ραφιού
    const inShelfFields =
      shelf.code.toLowerCase().includes(q) ||
      (shelf.notes ?? '').toLowerCase().includes(q) ||
      (shelf.barcode ?? '').toLowerCase().includes(q);

    const itemsBlob = (
      shelfSearchIndexById[shelf.id] ||
      shelfSearchIndexByCode[shelf.code] ||
      ''
    ).toLowerCase();

    const inItemsOnShelf = itemsBlob.includes(q);

    return inShelfFields || inItemsOnShelf;
  });


  const goBack = () => router.push('/dashboard');

  const handleAddShelf = () => {
    setSelectedShelf(null);
    setShowAddModal(true);
  };

  const handleEditShelf = (shelf: ShelfData) => {
    setSelectedShelf(shelf);
    setShowEditModal(true);
  };

  const handleShelfClick = (shelf: ShelfData) => {
    setSelectedShelfDetail(shelf);
    setShowShelfDetail(true);
  };

  const noWebOutline = Platform.select({
    web: {
      outlineStyle: 'none',
      outlineWidth: 0,
      outlineColor: 'transparent',
      boxShadow: 'none',
    },
  }) as any

  const handleDeleteShelf = (shelfId: string) => {
    // Find the shelf to get its details for confirmation
    const shelf = shelves.find(s => s.id === shelfId);
    if (!shelf) {
      alert('Το ράφι δεν βρέθηκε');
      return;
    }

    // Set shelf to delete and show modal
    setShelfToDelete(shelf);
    setShowDeleteModal(true);
  };

  const confirmDeleteShelf = async () => {
    if (!shelfToDelete) return;

    try {
      // Log shelf deletion before deleting
      const userId = await getCurrentUserId();
      console.log('📝 DELETE_SHELF - User ID:', userId);
      console.log('📝 DELETE_SHELF - Shelf ID:', shelfToDelete.id);
      console.log('📝 DELETE_SHELF - Shelf Data:', {
        code: shelfToDelete.code,
        barcode: shelfToDelete.barcode,
        floor: shelfToDelete.floor,
        capacity: shelfToDelete.capacity,
        notes: shelfToDelete.notes,
        item_count: shelfToDelete.item_count
      });
      await logDeleteShelf(userId, shelfToDelete.id, {
        code: shelfToDelete.code,
        barcode: shelfToDelete.barcode,
        floor: shelfToDelete.floor,
        capacity: shelfToDelete.capacity,
        notes: shelfToDelete.notes,
        item_count: shelfToDelete.item_count
      });

      // Delete from database
      await database.write(async () => {
        const shelfRecord = await database.get<Shelf>('shelves').find(shelfToDelete.id);
        await shelfRecord.destroyPermanently();
      });

      // Reload shelves from database
      await loadShelves();

      // Show success message
      setShowDeleteSuccess(true);

      // Auto-close modal after 2 seconds
      setTimeout(() => {
        setShowDeleteSuccess(false);
        setShowDeleteModal(false);
        setShelfToDelete(null);
      }, 2000);
    } catch (error) {
      console.error('Error deleting shelf:', error);
      alert('Σφάλμα κατά τη διαγραφή του ραφιού');
    }
  };

  return (
  <Page>
    {/* Ίδιο header όπως στο History */}
    <AppHeader showBack />

    {/* Περιεχόμενο */}
    <ScrollView
      contentContainerStyle={[styles.pageContainer, { paddingHorizontal: EDGE }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Section header (εικονίδιο + τίτλος + CTA) */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="cube" size={22} color={colors.primary} />
          </View>
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.title}>Αποθήκη</Text>
            <Text style={styles.subtitle}>{shelves.length} ράφια συνολικά</Text>
          </View>
        </View>

        {/* Κουμπιά δεξιά */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>

          <Pressable
            style={styles.previewBtn}
            onPress={() => setShowItemsModal(true)}
          >
            <Ionicons name="list" size={18} color={colors.primary} />
            <Text style={styles.previewBtnText}>Τεμάχια</Text>
          </Pressable>

          {/* κουμπί Προεπισκόπησης */}
          <Pressable
            style={styles.previewBtn}
            onPress={() => router.push('/warehouse-overview')}
          >
            <Ionicons name="cube-outline" size={18} color={colors.primary} />
            <Text style={styles.previewBtnText}>Προεπισκόπηση Αποθήκης</Text>
          </Pressable>

          {/* Ήδη υπάρχον κουμπί */}
          <Pressable style={styles.addButton} onPress={handleAddShelf}>
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Νέο Ράφι</Text>
          </Pressable>
        </View>
      </View>

      {/* Search Bar – ίδιο look με History */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color={colors.primary} style={styles.searchIcon} />
        <TextInput
          style={[styles.searchInput, noWebOutline]} 
          placeholder="Αναζήτηση ραφιού, κωδικού ή τεμαχίου..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Shelves Grid */}
      <View style={[styles.shelvesGrid, isWide ? styles.shelvesGridWide : undefined]}>
        {/* Add New Shelf Card */}
        <View style={isWide ? { width: '12%' } : { width: '48%' }}>
          <Pressable style={styles.addShelfCard} onPress={handleAddShelf}>
            <Ionicons name="add" size={isWide ? 20 : 32} color={colors.primary} />
            <Text style={[styles.addShelfText, isWide && styles.addShelfTextSmall]}>Νέο Ράφι</Text>
          </Pressable>
        </View>

        {/* Existing Shelves */}
        {filteredShelves.map((shelf) => (
          <View key={shelf.id} style={isWide ? { width: '20%' } : { width: '97%' }}>
            <ShelfCard
              shelf={shelf}
              onEdit={() => handleEditShelf(shelf)}
              onDelete={() => handleDeleteShelf(shelf.id)}
              onClick={() => handleShelfClick(shelf)}
            />
          </View>
        ))}
      </View>
    </ScrollView>

    {/* Modals  */}
    <ShelfModal
      visible={showAddModal || showEditModal}
      shelf={selectedShelf}
      onClose={() => {
        setShowAddModal(false);
        setShowEditModal(false);
        setSelectedShelf(null);
      }}
      onSave={async (shelfData) => {
        try {
          const userId = await getCurrentUserId();
          
          if (selectedShelf) {
            // EDIT MODE
            const oldValues = {
              code: selectedShelf.code,
              barcode: selectedShelf.barcode,
              floor: selectedShelf.floor,
              capacity: selectedShelf.capacity,
              notes: selectedShelf.notes
            };
            const newValues = {
              code: selectedShelf.code, 
              barcode: (shelfData.barcode  !== undefined) ? shelfData.barcode  : selectedShelf.barcode,
              floor:   (shelfData.floor    !== undefined) ? shelfData.floor    : selectedShelf.floor,
              capacity:(shelfData.capacity !== undefined) ? shelfData.capacity : selectedShelf.capacity,
              notes:   (shelfData.notes    !== undefined) ? shelfData.notes    : (selectedShelf.notes ?? '')
            };
            await database.write(async () => {
              const shelfRecord = await database.get<Shelf>('shelves').find(selectedShelf.id);
              await shelfRecord.update((s: any) => {
                if (shelfData.barcode  !== undefined) s.barcode  = newValues.barcode;
                if (shelfData.floor    !== undefined) s.floor    = newValues.floor;
                if (shelfData.capacity !== undefined) s.capacity = newValues.capacity;
                if (shelfData.notes    !== undefined) s.notes    = newValues.notes;
              });
            });
            await logUpdateShelf(userId, selectedShelf.id, oldValues, newValues);
          } else {
            // CREATE MODE
            const existingShelf = shelves.find(shelf =>
              shelf.code.toLowerCase() === shelfData.code?.toLowerCase()
            );
            if (existingShelf) {
              setErrorMessage(`Το ράφι με κωδικό "${shelfData.code}" υπάρχει ήδη!`);
              setShowError(true);
              return false;
            }
            let newShelfId = '';
            await database.write(async () => {
              const shelvesCollection = database.get<Shelf>('shelves');
              const newShelf = await shelvesCollection.create((shelf: any) => {
                shelf.code = shelfData.code || '';
                shelf.barcode = shelfData.barcode || shelfData.code || '';
                shelf.floor = shelfData.floor || 1;
                shelf.capacity = shelfData.capacity || 0;
                shelf.notes = shelfData.notes || '';
                shelf.item_count = 0;
                shelf.created_at = Date.now();
              });
              newShelfId = newShelf.id;
            });
            await logCreateShelf(userId, newShelfId, {
              code: shelfData.code,
              barcode: shelfData.barcode,
              floor: shelfData.floor,
              capacity: shelfData.capacity,
              notes: shelfData.notes
            });
          }
          await loadShelves();
          return true;
        } catch (error) {
          console.error('Error saving shelf:', error);
          setErrorMessage('Σφάλμα κατά την αποθήκευση του ραφιού');
          setShowError(true);
          return false;
        }
      }}
      showError={showError}
      errorMessage={errorMessage}
      onClearError={() => {
        setShowError(false);
        setErrorMessage('');
      }}
      onSetError={(message) => {
        setErrorMessage(message);
        setShowError(true);
      }}
    />

    <DeleteConfirmationModal
      visible={showDeleteModal}
      shelf={shelfToDelete}
      onClose={() => {
        setShowDeleteModal(false);
        setShelfToDelete(null);
        setShowDeleteSuccess(false);
      }}
      onConfirm={confirmDeleteShelf}
      showSuccess={showDeleteSuccess}
    />

    <ShelfDetailModal
      visible={showShelfDetail}
      shelf={selectedShelfDetail}
      onClose={() => {
        setShowShelfDetail(false);
        setSelectedShelfDetail(null);
      }}
    />

    <ItemsModal
      visible={showItemsModal}
      onClose={() => setShowItemsModal(false)}
    />
  </Page>
)


}

// Shelf Card Component
function ShelfCard({
  shelf,
  onEdit,
  onDelete,
  onClick,
}: {
  shelf: ShelfData;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  const isEmpty = shelf.item_count === 0;
  
  return (
    <Pressable 
      style={[styles.shelfCard, isEmpty && styles.shelfCardEmpty]}
      onPress={onClick}
    >
      <View style={styles.shelfHeader}>
        <Text style={styles.shelfCode}>{shelf.code}</Text>
        <View style={styles.shelfActions}>
          <Pressable onPress={(e) => {
            e.stopPropagation();
            onEdit();
          }} style={styles.shelfActionButton}>
            <Ionicons name="create" size={16} color="#6B7280" />
          </Pressable>
          {isEmpty && (
            <Pressable onPress={(e) => {
              e.stopPropagation();
              onDelete();
            }} style={styles.shelfActionButton}>
              <Ionicons name="trash" size={16} color="#EF4444" />
            </Pressable>
          )}
        </View>
      </View>
      
      <View style={styles.shelfContent}>
        <Ionicons name="cube" size={32} color="#9CA3AF" />
        <Text style={styles.shelfItemCount}>{shelf.item_count}</Text>
        <View style={styles.shelfTag}>
          <Ionicons name="barcode" size={12} color="#6B7280" />
          <Text style={styles.shelfTagText}>{shelf.barcode}</Text>
        </View>
      </View>
      
      {shelf.notes && (
        <Text style={styles.shelfNotes}>{shelf.notes}</Text>
      )}
    </Pressable>
  );
}

// Shelf Modal Component
function ShelfModal({
  visible,
  shelf,
  onClose,
  onSave,
  showError,
  errorMessage,
  onClearError,
  onSetError,
}: {
  visible: boolean;
  shelf: ShelfData | null;
  onClose: () => void;
  onSave: (shelfData: Partial<ShelfData>) => Promise<boolean>;
  showError: boolean;
  errorMessage: string;
  onClearError: () => void;
  onSetError: (message: string) => void;
}) {
  const [shelfName, setShelfName] = useState('');
  const [barcodeCode, setBarcodeCode] = useState('');
  const [floor, setFloor] = useState(1);
  const [capacity, setCapacity] = useState(0);
  const [notes, setNotes] = useState('');
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const isEdit = !!shelf;

  useEffect(() => {
    if (shelf) {
      setShelfName(shelf.code);
      setBarcodeCode(shelf.barcode); // Use actual barcode, not code
      setFloor(shelf.floor);
      setCapacity(shelf.capacity);
      setNotes(shelf.notes || '');
    } else {
      setShelfName('');
      setBarcodeCode('');
      setFloor(1);
      setCapacity(0);
      setNotes('');
    }
  }, [shelf]);


  useEffect(() => {
    const isEdit = !!shelf;
    if (visible && !isEdit) {
      setShelfName('');
      setBarcodeCode('');
      setFloor(1);
      setCapacity(0);
      setNotes('');
      // προαιρετικά:
      setShowSuccessMessage(false);
      onClearError();
    }
  }, [visible, shelf, onClearError]);

  // Clear errors when modal closes
  useEffect(() => {
    if (!visible) {
      onClearError();
    }
  }, [visible, onClearError]);

  // barcode
  useEffect(() => {
  if (!isEdit) {
    setBarcodeCode(shelfName.trim());
  }
}, [shelfName, isEdit]);

  const handleSave = async () => {
    // Validate required fields
    if (!shelfName.trim()) {
      onSetError('Παρακαλώ συμπληρώστε το όνομα του ραφιού');
      return;
    }

    if (!barcodeCode.trim()) {
      onSetError('Παρακαλώ συμπληρώστε τον κωδικό σάρωσης');
      return;
    }

    try {
      // Create shelf in database
      const shelfData = {
        code: shelfName.trim(),
        barcode: barcodeCode.trim(),
        floor: floor,
        capacity: capacity,
        notes: notes.trim(),
        itemCount: 0
      };

      // Call the save function with the shelf data
      const success = await onSave(shelfData);
      
      // Only show success message and close modal if save was successful
      // Only show success message and close modal if save was successful
      if (success) {
        // 
        if (!isEdit) {
          setShelfName('');
          setBarcodeCode('');
          setFloor(1);
          setCapacity(0);
          setNotes('');
        }

        setShowSuccessMessage(true);
        setTimeout(() => {
          setShowSuccessMessage(false);
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('Error saving shelf:', error);
      onSetError('Σφάλμα κατά την αποθήκευση του ραφιού');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Pressable onPress={onClose} style={styles.modalBackButton}>
                <Ionicons name="arrow-back" size={24} color="#374151" />
              </Pressable>
              
              <View style={styles.modalHeaderContent}>
                <View style={styles.modalIcon}>
                  <Ionicons name="cube" size={24} color="#3B82F6" />
                </View>
                <Text style={styles.modalTitle}>{shelf ? 'Επεξεργασία Ραφιού' : 'Νέο Ράφι'}</Text>
                <Text style={styles.modalSubtitle}>
                  {shelf ? 'Επεξεργαστείτε τα στοιχεία του ραφιού' : 'Συμπληρώστε τα στοιχεία του νέου ραφιού'}
                </Text>
              </View>
            </View>
            
            <View style={styles.modalContent}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Όνομα Ραφιού *</Text>
                <View style={[styles.inputContainer, shelf && styles.inputContainerDisabled]}>
                  <Ionicons name="location" size={20} color="#6B7280" style={styles.inputIcon} />
                  <TextInput
                    style={[
                      styles.textInput,
                      isEdit && styles.textInputDisabled,
                      Platform.OS === 'web' && ({ outlineStyle: 'none', outlineWidth: 0 } as any),
                    ]}
                    value={shelfName}
                    onChangeText={(v) => {
                      setShelfName(v);
                      if (!isEdit) setBarcodeCode(v.trim()); 
                    }}
                    placeholder="A1, B2, C3_"
                    placeholderTextColor="#9CA3AF"
                    editable={!isEdit}
                  />
                </View>
                <Text style={styles.inputHint}>
                  {shelf ? 'Το όνομα του ραφιού δεν μπορεί να αλλάξει' : 'Συμπληρώστε έναν συνδυασμό γράμματος και αριθμού (π.χ. Α1, Β2)'}
                </Text>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Κωδικός Σάρωσης *</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="qr-code" size={20} color="#6B7280" style={styles.inputIcon} />
                 <TextInput
                  style={[
                    styles.textInput,
                    !isEdit && styles.textInputDisabled,
                    Platform.OS === 'web' && ({ outlineStyle: 'none', outlineWidth: 0 } as any),
                  ]}
                  value={barcodeCode}
                  onChangeText={setBarcodeCode}
                  placeholder="A1"
                  placeholderTextColor="#9CA3AF"
                  editable={isEdit} 
                />
                </View>
                <Text style={styles.inputHint}>Ο κωδικός δημιουργείται αυτόματα από το όνομα ραφιού</Text>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Σημειώσεις (προαιρετικό)</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    styles.textArea,
                    Platform.OS === 'web' && ({ outlineStyle: 'none', outlineWidth: 0 } as any), // 👈 εδώ
                  ]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Προσθέστε σημειώσεις για το ράφι..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                />
              </View>
              
              {showSuccessMessage && (
                <View style={styles.successMessage}>
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                  <Text style={styles.successMessageText}>
                    {shelf ? `Επεξεργαστήκε επιτυχώς το ράφι ${shelf.code}` : 'Το ράφι δημιουργήθηκε επιτυχώς!'}
                  </Text>
                </View>
              )}
              
              {showError && (
                <View style={styles.errorMessage}>
                  <Ionicons name="warning" size={24} color="#EF4444" />
                  <Text style={styles.errorMessageText}>{errorMessage}</Text>
                </View>
              )}
              
              <View style={styles.modalActions}>
                <Pressable style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelButtonText}>Ακύρωση</Text>
                </Pressable>
                <Pressable style={styles.saveButton} onPress={handleSave}>
                  <Text style={styles.saveButtonText}>{shelf ? 'Επιβεβαιώση' : 'Δημιουργία'}</Text>
                </Pressable>
              </View>
              
              <Text style={styles.requiredText}>Τα πεδία με * είναι υποχρεωτικά</Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Delete Confirmation Modal Component
function DeleteConfirmationModal({
  visible,
  shelf,
  onClose,
  onConfirm,
  showSuccess,
}: {
  visible: boolean;
  shelf: ShelfData | null;
  onClose: () => void;
  onConfirm: () => void;
  showSuccess: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={styles.deleteModalContainer}>
            <View style={styles.deleteModalHeader}>
              <View style={styles.deleteModalIcon}>
                <Ionicons name="warning" size={32} color="#EF4444" />
              </View>
              <Text style={styles.deleteModalTitle}>Διαγραφή Ραφιού</Text>
              <Text style={styles.deleteModalSubtitle}>
                Είστε σίγουροι ότι θέλετε να διαγράψετε το ράφι “{shelf?.code}”;
              </Text>
              <Text style={styles.deleteModalWarning}>
                Αυτή η ενέργεια δεν μπορεί να αναιρεθεί.
              </Text>
            </View>
            
            {showSuccess && (
              <View style={styles.deleteSuccessMessage}>
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                <Text style={styles.deleteSuccessMessageText}>
                  Το ράφι &ldquo;{shelf?.code}&rdquo; διαγράφηκε επιτυχώς!
                </Text>
              </View>
            )}
            
            <View style={styles.deleteModalActions}>
              <Pressable style={styles.deleteCancelButton} onPress={onClose}>
                <Text style={styles.deleteCancelButtonText}>Ακύρωση</Text>
              </Pressable>
              <Pressable style={styles.deleteConfirmButton} onPress={onConfirm}>
                <Text style={styles.deleteConfirmButtonText}>Διαγραφή</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Shelf Detail Modal Component
function ShelfDetailModal({
  visible,
  shelf,
  onClose,
}: {
  visible: boolean;
  shelf: ShelfData | null;
  onClose: () => void;
}) {
  const { user } = useAuth()
  const currentUserId = String(user?.id || 'system')
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const { height: screenH } = useWindowDimensions()
  const MODAL_H = Math.floor(screenH * 0.7) 

  // load item's shelf
  useEffect(() => {
    if (!shelf) return
    const loadItems = async () => {
      setLoading(true)
      try {
        const results = await listActiveItemsOnShelf(shelf.id)
        setItems(results)
      } catch (err) {
        console.error('❌ Error loading shelf items:', err)
      } finally {
        setLoading(false)
      }
    }
    loadItems()
  }, [shelf])

  


  const [showEdit, setShowEdit] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)

  const onEditItem = (itemId: string) => {
    const found = items.find((x: any) => x.id === itemId)
    if (found) {
      setEditItem(found)
      setShowEdit(true)
    }
  }

  // remove item from shelf
  const [showDelete, setShowDelete] = useState(false)
  const [deleteItem, setDeleteItem] = useState<any | null>(null)

  const onDeleteItem = (itemId: string) => {
    const found = items.find((x: any) => x.id === itemId)
    if (found) {
      setDeleteItem(found)
      setShowDelete(true)
    }
  }

  if (!shelf) return null

  return (
  <>
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.shelfDetailOverlay}>
        <Pressable style={styles.shelfDetailBackdrop} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.shelfDetailContainer,
                { height: MODAL_H }, 
              ]}
            >
              {/* Header */}
              <View style={styles.shelfDetailHeader}>
                <Pressable onPress={onClose} style={styles.shelfDetailBackButton}>
                  <Ionicons name="arrow-back" size={24} color="#374151" />
                </Pressable>
                <View style={styles.shelfDetailHeaderContent}>
                  <Text style={styles.shelfDetailTitle}>Ράφι {shelf.code}</Text>
                  <Text style={styles.shelfDetailSubtitle}>{shelf.item_count} τεμάχια</Text>
                </View>
              </View>

              {/* Shelf Details */}
              <View style={styles.shelfDetailSection}>
                <Text style={styles.shelfDetailSectionTitle}>Στοιχεία Ραφιού</Text>
                <View style={styles.shelfDetailInfo}>
                  <View style={styles.shelfDetailInfoRow}>
                    <Text style={styles.shelfDetailInfoLabel}>Κωδικός:</Text>
                    <Text style={styles.shelfDetailInfoValue}>{shelf.code}</Text>
                  </View>
                  {shelf.notes && (
                    <View style={styles.shelfDetailInfoRow}>
                      <Text style={styles.shelfDetailInfoLabel}>Σημειώσεις:</Text>
                      <Text style={styles.shelfDetailInfoValue}>{shelf.notes}</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Add Item Button */}
              <Pressable
                style={styles.addItemButton}
                onPress={() => {
                  onClose()
                  setTimeout(() => {
                    router.push(
                      `/additem?shelfId=${shelf.id}&shelfCode=${shelf.code}&itemCount=${shelf.item_count}`
                    )
                  }, 200)
                }}
              >
                <Ionicons name="add-circle" size={24} color="#FFFFFF" />
                <Text style={styles.addItemButtonText}>Προσθήκη Υπάρχοντος Τεμαχίου</Text>
              </Pressable>

              {/* Items Section */}
              <View style={[styles.shelfDetailSectionLast, { flex: 1 }]}>
                <Text style={styles.shelfDetailSectionTitle}>Τεμάχια στο Ράφι</Text>

                {loading ? (
                  <View style={styles.emptyItemsContainer}>
                    <Ionicons name="sync" size={32} color="#9CA3AF" />
                    <Text style={styles.emptyItemsText}>Φόρτωση...</Text>
                  </View>
                ) : items.length === 0 ? (
                  <View style={styles.emptyItemsContainer}>
                    <Ionicons name="cube-outline" size={48} color="#9CA3AF" />
                    <Text style={styles.emptyItemsText}>
                      Δεν υπάρχουν τεμάχια σε αυτό το ράφι
                    </Text>
                  </View>
                ) : (
                  <View
                    style={{
                      flex: 1,
                      maxHeight: 350,
                      marginTop: 8,
                      borderRadius: 12,
                      overflow: 'hidden',
                    }}
                  >
                    <ScrollView
                      contentContainerStyle={{ paddingBottom: 20 }}
                      showsVerticalScrollIndicator
                      persistentScrollbar
                    >
                      <View style={styles.itemsList}>
                        {items.map((it: any) => (
                          <View key={it.id} style={styles.itemRow}>
                            {/* Αριστερά: πληροφορίες */}
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                <Text style={styles.itemCode}>
                                  {it.item_code || `#${String(it.id).slice(0, 6).toUpperCase()}`}
                                </Text>
                                {it.category ? (
                                  <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{it.category}</Text>
                                  </View>
                                ) : null}
                              </View>

                              {/* Πελάτης */}
                              <Text style={styles.itemOwner}>
                                {it.customer_name || 'Χωρίς πελάτη'}
                              </Text>

                              {/* Ημερομηνία (order_date ή created_at fallback) */}
                              {/* Ημερομηνία */}
                              {it.order_date ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Ionicons name="calendar-outline" size={14} color="#6B7280" />
                                  <Text style={[styles.itemInfo, { marginLeft: 4 }]}>{it.order_date}</Text>
                                </View>
                              ) : it.created_at ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Ionicons name="calendar-outline" size={14} color="#6B7280" />
                                  <Text style={[styles.itemInfo, { marginLeft: 4 }]}>
                                    {new Date(it.created_at).toLocaleDateString('el-GR')}
                                  </Text>
                                </View>
                              ) : null}

                              {/* Ράφι */}
                              {it.shelf_code ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Ionicons name="cube-outline" size={14} color="#6B7280" />
                                  <Text style={[styles.itemInfo, { marginLeft: 4 }]}>Ράφι: {it.shelf_code}</Text>
                                </View>
                              ) : null}

                              {/* Χρώμα */}
                              {it.color ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Ionicons name="color-palette-outline" size={14} color="#6B7280" />
                                  <Text style={[styles.itemInfo, { marginLeft: 4 }]}>{it.color}</Text>
                                </View>
                              ) : null}

                              {/* Κατάσταση */}
                              {it.status ? (
                                <View style={styles.statusChip}>
                                  <Text style={styles.statusChipText}>{it.status}</Text>
                                </View>
                              ) : null}
                            </View>

                            {/* Δεξιά: action buttons */}
                            <View style={styles.actions}>
                              {/* Edit (γκρι/λευκό) */}
                              <Pressable
                                accessibilityLabel="Επεξεργασία τεμαχίου"
                                onPress={() => onEditItem(it.id)}
                                android_ripple={{ color: '#E5E7EB' }}
                                style={({ pressed }) => [styles.iconBtn, styles.editBtn, pressed && { opacity: 0.8 }]}
                                hitSlop={8}
                              >
                                <Ionicons name="pencil" size={16} color="#374151" />
                              </Pressable>

                              {/* Delete (κόκκινο) */}
                              <Pressable
                                accessibilityLabel="Διαγραφή τεμαχίου"
                                onPress={() => onDeleteItem(it.id)}
                                android_ripple={{ color: '#FCA5A5' }}
                                style={({ pressed }) => [styles.iconBtn, styles.deleteBtn, pressed && { opacity: 0.9 }]}
                                hitSlop={8}
                              >
                                <Ionicons name="trash" size={16} color="#FFFFFF" />
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>

                    </ScrollView>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </View>
    </Modal>

    {/* === 2ο modal: Edit Item === */}
    <EditItemModal
      visible={showEdit}
      item={editItem}
      onClose={() => { setShowEdit(false); setEditItem(null) }}
      onSaved={(updated) => {
        setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
        setShowEdit(false); setEditItem(null)
      }}
      userId={currentUserId} 
    />
    <DeleteItemConfirmModal
      visible={showDelete}
      item={deleteItem}
      shelf={shelf}
      userId={currentUserId}
      onClose={() => { setShowDelete(false); setDeleteItem(null) }}
      onDeleted={(deletedId) => {
        setItems(prev => prev.filter(x => x.id !== deletedId))
        setShowDelete(false); setDeleteItem(null)
      }}
    />

  </>
)


}

// edit item
function EditItemModal({
  visible,
  item,
  onClose,
  onSaved,
  userId = 'system',                        
}: {
  visible: boolean
  item: any | null
  onClose: () => void
  onSaved: (updated: any) => void
  userId?: string                            
}) {
  const [saving, setSaving] = useState(false)

  // τοπική φόρμα
  const [item_code, setItemCode] = useState('')
  const [category, setCategory] = useState('')
  const [color, setColor] = useState('')
  const [customer_name, setCustomerName] = useState('')
  const [status, setStatus] = useState('')
  const [storage_status, setStorageStatus] = useState('')
  const [order_date, setOrderDate] = useState('')

  useEffect(() => {
    if (!item) return
    setItemCode(item.item_code ?? '')
    setCategory(item.category ?? '')
    setColor(item.color ?? '')
    setCustomerName(item.customer_name ?? '')
    setStatus(item.status ?? '')
    setStorageStatus(item.storage_status ?? '')
    setOrderDate(item.order_date ?? '')
  }, [item])

  const onSubmit = async () => {
    if (!item) return
    setSaving(true)
    try {
      const oldStorage = item.storage_status ?? ''

      await updateOrderItem(item.id, {
        item_code, category, color, status, storage_status, order_date,
      },userId
    )

      if (storage_status !== oldStorage) {
        try { await logItemStorageStatusChanged(userId, item.id, oldStorage, storage_status) } catch {}
      }

      onSaved({ ...item, item_code, category, color, status, storage_status, order_date })
    } catch (e) {
      console.error('❌ updateOrderItem failed', e)
    } finally {
      setSaving(false)
    }
  }

  if (!item) return null

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.editOverlay}>
        <Pressable style={styles.editBackdrop} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.editContainer}>
              {/* Header */}
              <View style={styles.editHeader}>
                <Text style={styles.editTitle}>Στοιχεία Τεμαχίου</Text>
                <Pressable onPress={onClose} hitSlop={8}>
                  <Ionicons name="close" size={22} color="#374151" />
                </Pressable>
              </View>

              {/* 2-στήλες layout */}
              <View style={styles.formGrid}>
                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Κωδικός Τεμαχίου *</Text>
                    <TextInput style={styles.input} value={item_code} onChangeText={setItemCode} />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Κατηγορία *</Text>
                    <TextInput style={styles.input} value={category} onChangeText={setCategory} />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Χρώμα</Text>
                    <TextInput style={styles.input} value={color} onChangeText={setColor} />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Όνομα Πελάτη</Text>
                    <TextInput style={[styles.input, { backgroundColor: '#F3F4F6' }]} value={customer_name} editable={false} />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Κατάσταση</Text>
                    <TextInput style={styles.input} value={status} onChangeText={setStatus} placeholder="Πλυμένο / Άπλυτο" />
                  </View>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Storage Status</Text>
                    <TextInput style={styles.input} value={storage_status} onChangeText={setStorageStatus} placeholder="Φύλαξη / Επιστροφή" />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <Text style={styles.label}>Ημερομηνία</Text>
                    <TextInput style={styles.input} value={order_date} onChangeText={setOrderDate} placeholder="15/1/2024" />
                  </View>
                  <View style={styles.formCol} />
                </View>
              </View>

              {/* Κουμπιά */}
              <View style={styles.actionsRow}>
                <Pressable onPress={onClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelText}>Ακύρωση</Text>
                </Pressable>
                <Pressable disabled={saving} onPress={onSubmit} style={styles.saveBtn}>
                  <Text style={styles.saveText}>{saving ? 'Αποθήκευση…' : 'Ενημέρωση'}</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </View>
    </Modal>
  )
}

// delete items
function DeleteItemConfirmModal({
    visible,
    item,
    shelf,                 // ← έγινε προαιρετικό
    userId = 'system',
    onClose,
    onDeleted,
  }: {
    visible: boolean
    item: any | null
    shelf?: ShelfData       // ← εδώ η αλλαγή
    userId?: string
    onClose: () => void
    onDeleted: (deletedId: string) => void
  }) {
    const [deleting, setDeleting] = useState(false)

    if (!item) return null

    const onConfirm = async () => {
      try {
        setDeleting(true)
        await removeItemFromShelf({ orderItemId: item.id, userId })
        onDeleted(item.id)
      } catch (e) {
        console.error('❌ removeItemFromShelf failed', e)
      } finally {
        setDeleting(false)
      }
    }

    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={styles.editOverlay}>
          <Pressable style={styles.editBackdrop} onPress={onClose}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View style={styles.editContainer}>
                <View style={styles.editHeader}>
                  <Text style={styles.editTitle}>Διαγραφή Τεμαχίου</Text>
                  <Pressable onPress={onClose} hitSlop={8}>
                    <Ionicons name="close" size={22} color="#374151" />
                  </Pressable>
                </View>

                <View style={{ paddingVertical: 8 }}>
                  <Text>Είστε σίγουροι ότι θέλετε να διαγράψετε το τεμάχιο “{item.item_code}”;</Text>
                  {shelf?.code ? (
                    <Text style={{ marginTop: 6, fontSize: 12, color: '#6B7280' }}>
                      Ράφι: {shelf.code}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.actionsRow}>
                  <Pressable onPress={onClose} style={styles.cancelBtn}>
                    <Text style={styles.cancelText}>Ακύρωση</Text>
                  </Pressable>
                  <Pressable disabled={deleting} onPress={onConfirm} style={styles.dangerBtn}>
                    <Ionicons name="trash" size={16} color="#FFFFFF" />
                    <Text style={styles.dangerText}>
                      {deleting ? 'Διαγράφεται…' : 'Διαγραφή'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </View>
      </Modal>
    )
}


function ItemsModal({
  visible,
  onClose,
}: {
  visible: boolean
  onClose: () => void
}) {
  const { width, height } = useWindowDimensions()
  const { user } = useAuth()
  const currentUserId = String(user?.id || 'system')

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<any[]>([])
  const [q, setQ] = useState('')

  // ΦΙΛΤΡΑ
  type StatusFilter = 'all' | 'washed' | 'unwashed'
  type StorageFilter = 'all' | 'keep' | 'return'
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [storageFilter, setStorageFilter] = useState<StorageFilter>('all')
  const [shelfFilter, setShelfFilter] = useState<string>('all') // φίλτρο ραφιού

  // Modals για edit/delete
  const [showEdit, setShowEdit] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [deleteItem, setDeleteItem] = useState<any | null>(null)

  const noWebOutline = Platform.select({
    web: {
      outlineStyle: 'none',
      outlineWidth: 0,
      outlineColor: 'transparent',
      boxShadow: 'none',
    },
  }) as any

  // modal's width, height
  const CARD_W = Math.min(width - 24, 1480)
  const CARD_H = Math.min(height - 48, 920)

  // Φόρτωση από το service
  useEffect(() => {
    if (!visible) return
    const load = async () => {
      setLoading(true)
      try {
        const data = await listAllActiveWarehouseItems()
        setItems(data)
      } catch (e) {
        console.error('❌ listAllActiveWarehouseItems failed', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [visible])

  // helpers
  const lc = (s: any) => String(s || '').toLowerCase()
  const isWashed   = (s: string) => ['πλυμένο','πλυμενο','clean','washed','completed','ok'].some(k => lc(s).includes(k))
  const isUnwashed = (s: string) => ['άπλυτο','απλυτο','dirty','unwashed','pending'].some(k => lc(s).includes(k))
  const isKeep     = (s: string) => ['φύλαξη','φυλαξη','keep','storage'].some(k => lc(s).includes(k))
  const isReturn   = (s: string) => ['επιστροφή','επιστροφη','return','pickup'].some(k => lc(s).includes(k))

  // μοναδικά ράφια για chips
  const uniqueShelves = Array.from(new Set(items.map((it: any) => it.shelf_code).filter(Boolean))) as string[]

  // 1) Search (πιάνει και ράφι: shelf_code)
  const searched = items.filter((it) => {
    const txt = lc(q).trim()
    if (!txt) return true
    return (
      lc(it.item_code).includes(txt) ||
      lc(it.customer_name).includes(txt) ||
      lc(it.color).includes(txt) ||
      lc(it.category).includes(txt) ||
      lc(it.shelf_code).includes(txt) ||   // ← ράφι
      lc(it.status).includes(txt) ||
      lc(it.storage_status).includes(txt) ||
      lc(it.order_date).includes(txt)
    )
  })

  // 2) Εφαρμογή φίλτρων
  const filtered = searched.filter((it) => {
    const st = lc(it.status)
    const ss = lc(it.storage_status)
    const sc = lc(it.shelf_code)

    const passStatus =
      statusFilter === 'all' ||
      (statusFilter === 'washed' && isWashed(st)) ||
      (statusFilter === 'unwashed' && isUnwashed(st))

    const passStorage =
      storageFilter === 'all' ||
      (storageFilter === 'keep' && isKeep(ss)) ||
      (storageFilter === 'return' && isReturn(ss))

    const passShelf = shelfFilter === 'all' || sc === lc(shelfFilter)

    return passStatus && passStorage && passShelf
  })

  type ChipKind = 'status' | 'storage' | 'category'
  function ChipColors(label: string, kind: ChipKind) {
    const v = lc(label)
    let bg = '#F3F4F6', bd = '#E5E7EB', fg = '#374151'
    if (kind === 'status') {
      if (isWashed(v)) { bg = '#ECFDF5'; bd = '#A7F3D0'; fg = '#065F46' }
      else if (isUnwashed(v)) { bg = '#FEF2F2'; bd = '#FECACA'; fg = '#991B1B' }
      else if (['σε εξέλιξη','επεξεργασία','processing','in progress'].some(k => v.includes(k))) {
        bg = '#EFF6FF'; bd = '#BFDBFE'; fg = '#1E3A8A'
      } else if (['αναμονή','waiting','hold'].some(k => v.includes(k))) {
        bg = '#FFFBEB'; bd = '#FDE68A'; fg = '#92400E'
      }
    }
    if (kind === 'storage') {
      if (isKeep(v)) { bg = '#EEF2FF'; bd = '#C7D2FE'; fg = '#3730A3' }
      else if (isReturn(v)) { bg = '#FDF2F8'; bd = '#FBCFE8'; fg = '#9D174D' }
    }
    if (kind === 'category') { bg = '#F1F5F9'; bd = '#E2E8F0'; fg = '#0F172A' }
    return { bg, bd, fg }
  }
  function Chip({ label, kind }: { label: string; kind: ChipKind }) {
    const { bg, bd, fg } = ChipColors(label, kind)
    return (
      <View style={{
        backgroundColor: bg,
        borderColor: bd,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start'
      }}>
        <Text style={{ fontSize: 12, color: fg }}>{label}</Text>
      </View>
    )
  }

  const FilterBtn = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.filterBtn, active && styles.filterBtnActive]}>
      <Text style={[styles.filterBtnText, active && styles.filterBtnTextActive]}>{label}</Text>
    </Pressable>
  )

  const ShelfChip = ({ code }: { code: string }) => (
    <Pressable onPress={() => setShelfFilter(code)} style={[styles.filterBtn, shelfFilter===code && styles.filterBtnActive]}>
      <Text style={[styles.filterBtnText, shelfFilter===code && styles.filterBtnTextActive]}>{code}</Text>
    </Pressable>
  )

  if (!visible) return null

  return (
    <>
      <Modal visible={visible} transparent animationType="fade">
        <Pressable style={styles.itemsModalOverlay} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={[
                styles.itemsModalContainer,
                { width: CARD_W, maxWidth: CARD_W, height: CARD_H },
              ]}
            >
              {/* Header */}
              <View style={styles.itemsModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="list" size={20} color="#374151" />
                  <Text style={styles.itemsModalTitle}>Τεμάχια Αποθήκης</Text>
                  <Text style={{ color: '#6B7280', fontSize: 12 }}>
                    ({loading ? '…' : filtered.length})
                  </Text>
                </View>
                <Pressable onPress={onClose} hitSlop={8}>
                  <Ionicons name="close" size={20} color="#374151" />
                </Pressable>
              </View>

              {/* Περιεχόμενο */}
              <View style={styles.itemsModalContent}>
                {/* Search */}
                <View style={[styles.searchContainer, { marginTop: 6 }]}>
                  <Ionicons name="search-outline" size={20} color={colors.primary} style={styles.searchIcon} />
                  <TextInput
                    style={[styles.searchInput, noWebOutline]}
                    placeholder="Αναζήτηση: κωδικός, πελάτης, χρώμα, ράφι, κατάσταση…"
                    placeholderTextColor="#9CA3AF"
                    value={q}
                    onChangeText={setQ}
                  />
                </View>

                {/* Φίλτρα */}
                <View style={styles.filterBar}>
                  <View style={styles.filterGroup}>
                    <Text style={styles.filterGroupLabel}>Κατάσταση:</Text>
                    <FilterBtn label="Όλα" active={statusFilter==='all'} onPress={() => setStatusFilter('all')} />
                    <FilterBtn label="Πλυμένο" active={statusFilter==='washed'} onPress={() => setStatusFilter('washed')} />
                    <FilterBtn label="Άπλυτο" active={statusFilter==='unwashed'} onPress={() => setStatusFilter('unwashed')} />
                  </View>
                  <View style={styles.filterGroup}>
                    <Text style={styles.filterGroupLabel}>Κατάσταση:</Text>
                    <FilterBtn label="Όλα" active={storageFilter==='all'} onPress={() => setStorageFilter('all')} />
                    <FilterBtn label="Φύλαξη" active={storageFilter==='keep'} onPress={() => setStorageFilter('keep')} />
                    <FilterBtn label="Επιστροφή" active={storageFilter==='return'} onPress={() => setStorageFilter('return')} />
                  </View>
                 
                </View>

                {/* Λίστα */}
                <ScrollView
                  style={{ flex: 1, marginTop: 10 }}
                  contentContainerStyle={{ paddingBottom: 12 }}
                  showsVerticalScrollIndicator
                >
                  {loading ? (
                    <View style={styles.emptyItemsContainer}>
                      <Ionicons name="sync" size={28} color="#9CA3AF" />
                      <Text style={styles.emptyItemsText}>Φόρτωση τεμαχίων…</Text>
                    </View>
                  ) : filtered.length === 0 ? (
                    <View style={styles.emptyItemsContainer}>
                      <Ionicons name="cube-outline" size={40} color="#9CA3AF" />
                      <Text style={styles.emptyItemsText}>Δεν βρέθηκαν τεμάχια</Text>
                    </View>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {filtered.map((it) => (
                        <View key={it.id} style={styles.itemRow}>
                          {/* Αριστερά */}
                          <View style={{ flex: 1 }}>
                            {/* Κωδικός + Κατηγορία */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <Text style={styles.itemCode}>
                                {it.item_code || `#${String(it.id).slice(0, 6).toUpperCase()}`}
                              </Text>
                              {!!it.category && <Chip label={it.category} kind="category" />}
                            </View>

                            {/* Πελάτης */}
                            <Text style={styles.itemOwner}>{it.customer_name || 'Χωρίς πελάτη'}</Text>

                            {/* Ημερομηνία */}
                            {!!it.order_date && (
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons name="calendar-outline" size={14} color="#6B7280" />
                                <Text style={[styles.itemInfo, { marginLeft: 4 }]}>{it.order_date}</Text>
                              </View>
                            )}

                            {/* Ράφι */}
                            {!!it.shelf_code && (
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons name="cube-outline" size={14} color="#6B7280" />
                                <Text style={[styles.itemInfo, { marginLeft: 4 }]}>Ράφι: {it.shelf_code}</Text>
                              </View>
                            )}

                            {/* Χρώμα */}
                            {!!it.color && (
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Ionicons name="color-palette-outline" size={14} color="#6B7280" />
                                <Text style={[styles.itemInfo, { marginLeft: 4 }]}>{it.color}</Text>
                              </View>
                            )}

                            {/* Chips για κατάσταση & φύλαξη */}
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                              {!!it.status && <Chip label={it.status} kind="status" />}
                              {!!it.storage_status && <Chip label={it.storage_status} kind="storage" />}
                            </View>
                          </View>

                          {/* Actions δεξιά */}
                          <View style={styles.actions}>
                            <Pressable
                              accessibilityLabel="Επεξεργασία τεμαχίου"
                              onPress={() => { setEditItem(it); setShowEdit(true) }}
                              android_ripple={{ color: '#E5E7EB' }}
                              style={({ pressed }) => [styles.iconBtn, styles.editBtn, pressed && { opacity: 0.8 }]}
                              hitSlop={8}
                            >
                              <Ionicons name="pencil" size={16} color="#374151" />
                            </Pressable>

                            <Pressable
                              accessibilityLabel="Διαγραφή τεμαχίου"
                              onPress={() => { setDeleteItem(it); setShowDelete(true) }}
                              android_ripple={{ color: '#FCA5A5' }}
                              style={({ pressed }) => [styles.iconBtn, styles.deleteBtn, pressed && { opacity: 0.9 }]}
                              hitSlop={8}
                            >
                              <Ionicons name="trash" size={16} color="#FFFFFF" />
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>

                {/* Actions */}
                <View style={[styles.actionsRow, { justifyContent: 'flex-end', marginTop: 10 }]}>
                  <Pressable onPress={onClose} style={styles.cancelBtn}>
                    <Text style={styles.cancelText}>Κλείσιμο</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modals για edit/delete */}
      <EditItemModal
        visible={showEdit}
        item={editItem}
        onClose={() => { setShowEdit(false); setEditItem(null) }}
        onSaved={(updated) => {
          setItems(prev => prev.map(x => x.id === updated.id ? { ...x, ...updated } : x))
          setShowEdit(false); setEditItem(null)
        }}
        userId={currentUserId}
      />
      <DeleteItemConfirmModal
        visible={showDelete}
        item={deleteItem}
        onClose={() => { setShowDelete(false); setDeleteItem(null) }}
        onDeleted={(deletedId) => {
          setItems(prev => prev.filter(x => x.id !== deletedId))
          setShowDelete(false); setDeleteItem(null)
        }}
        userId={currentUserId}
      />
    </>
  )
}


const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 16,
  },

  
 
  pageContainer: {
  padding: 16,
  paddingBottom: 40,
},

sectionHeaderRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 12,
},

sectionHeaderLeft: {
  flexDirection: 'row',
  alignItems: 'center',
},

headerIcon: {
  width: 40,
  height: 40,
  borderRadius: 10,
  backgroundColor: '#EEF2FF',
  alignItems: 'center',
  justifyContent: 'center',
},

title: {
  fontSize: 20,
  fontWeight: '400',
  color: '#111827',
  marginBottom: 2,
},

subtitle: {
  fontSize: 13,
  color: '#6B7280',
},

addButton: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  backgroundColor: '#3B82F6',
  borderRadius: 10,
  paddingVertical: 10,
  paddingHorizontal: 14,
  shadowColor: '#000',
  shadowOpacity: 0.12,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 3 },
  elevation: 3,
},

addButtonText: {
  color: '#FFFFFF',
  fontWeight: '400',
  fontSize: 14,
},

/* Search ίδιο με History look */
searchContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#F8FAFF',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  marginBottom: 16,
  borderWidth: 2,
  borderColor: '#BFDBFE',
},
searchIcon: { marginRight: 8 },
searchInput: { flex: 1, fontSize: 15, color: '#111827' },


  shelvesContainer: {
    flex: 1,
  },
  shelvesGrid: {
    flexDirection: 'column',
  },
  shelvesGridWide: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  shelfCard: {
    backgroundColor: '#D1FAE5',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    width: '100%',
    minHeight: 130,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  shelfCardEmpty: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
  },
  shelfHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  shelfCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  shelfActions: {
    flexDirection: 'row',
    gap: 8,
  },
  shelfActionButton: {
    padding: 4,
  },
  shelfContent: {
  alignItems: 'center',
  marginBottom: 12,
  backgroundColor: '#F1F5F9',  
  borderRadius: 14,
  paddingVertical: 18,
},
  shelfItemCount: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    marginTop: 8,
    marginBottom: 8,
  },
  shelfTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  shelfTagText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  shelfNotes: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  addShelfCard: {
    backgroundColor: '#F8FAFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#93C5FD',
    borderStyle: 'dashed',
    marginBottom: 16,
    minHeight: 120,
  },
  addShelfText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '600',
    marginTop: 8,
  },
  addShelfTextSmall: {
    fontSize: 10,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,  
    paddingVertical: 0,   
  },
  modalContainer: {
  backgroundColor: '#FFFFFF',
  borderRadius: 16,
  width: '98%',          
  maxWidth: 1400,       
  height: '95%',        
  alignSelf: 'center',
  overflow: 'hidden',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.25,
  shadowRadius: 20,
  elevation: 10,
},


  modalHeader: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
modalBackButton: { padding: 4, marginBottom: 8 },

  modalHeaderContent: {
    alignItems: 'center',
  },
  modalIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EBF4FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '400',
    color: '#111827',
    marginBottom: 2,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  modalContent: {
  paddingHorizontal: 20,
  paddingVertical: 16,
  flex: 1,              
  overflow: 'scroll',   
},

  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    fontWeight: '400',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    marginBottom: 6,
    minHeight: 44,
  },
  inputIcon: {
    paddingHorizontal: 10,
  },
  textInput: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontSize: 15,
    color: '#374151',
  },
  inputContainerDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  textInputDisabled: {
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
  },
 textArea: {
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    padding: 10,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  inputHint: {
  fontSize: 12,
  color: '#6B7280',
  fontStyle: 'italic',
  marginTop: 2,
},
  modalActions: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  paddingHorizontal: 20,
  paddingVertical: 16,
  borderTopWidth: 1,
  borderTopColor: '#E5E7EB',
  gap: 12,
},
  cancelButton: {
  flex: 1,
  paddingVertical: 10,
  backgroundColor: '#FFFFFF',
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#D1D5DB',
  alignItems: 'center',
},
  cancelButtonText: {
  fontSize: 14,
  color: '#6B7280',
  fontWeight: '400',
},
  saveButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  requiredText: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  successMessageText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '400',
  },
  errorMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  errorMessageText: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '400',
  },
  deleteModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  deleteModalHeader: {
    padding: 24,
    alignItems: 'center',
  },
  deleteModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  deleteModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  deleteModalSubtitle: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 8,
  },
  deleteModalWarning: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
    fontWeight: '400',
  },
  deleteModalActions: {
    flexDirection: 'row',
    padding: 24,
    gap: 12,
  },
  deleteCancelButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
  },
  deleteCancelButtonText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '400',
  },
  deleteConfirmButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteConfirmButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '400',
  },
  deleteSuccessMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 24,
    marginBottom: 16,
    gap: 8,
  },
  deleteSuccessMessageText: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '400',
  },
  shelfDetailOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  shelfDetailBackdrop: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },



  shelfDetailContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '98%',
    maxWidth: 1400,   
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },

  shelfDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,             
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  shelfDetailBackButton: {
    padding: 8,
    marginRight: 12,
  },

  shelfDetailHeaderContent: {
    flex: 1,
  },
  shelfDetailTitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#111827',
    marginBottom: 2,
  },

  shelfDetailSubtitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  shelfDetailEditButton: {
    padding: 8,
  },
  shelfDetailSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },

  shelfDetailSectionLast: {
    padding: 16,
  },
  shelfDetailSectionTitle: {
    fontSize: 15,
    fontWeight: '400',
    color: '#111827',
    marginBottom: 12,
  },
  shelfDetailInfo: {
    gap: 8,
  },

  shelfDetailInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  shelfDetailInfoLabel: {
    fontSize: 13,
    fontWeight: '400',
    color: '#374151',
    width: 90,
  },

  shelfDetailInfoValue: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },
  addItemButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#8B5CF6',
  margin: 16,
  paddingVertical: 12,
  paddingHorizontal: 20,
  borderRadius: 10,
  gap: 10,
  width: 420,
  alignSelf: 'center',
  textAlign: 'center',
},

  addItemButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '400',
  },

  emptyItemsContainer: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyItemsText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 12,
    textAlign: 'center',
  },

  itemsList: {
    gap: 10,
  },

  itemCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  itemCode: {
    fontSize: 14,
    fontWeight: '400',
    color: '#111827',
  },

  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  itemActionButton: {
    padding: 4,
  },

  itemDescription: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 2,
  },
  itemOwner: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 2,
  },

  itemDate: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
  },
  itemStatus: {
    alignSelf: 'flex-start',
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },

  itemStatusText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '400',
  },

  previewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
  },
  previewBtnText: {
    color: colors.primary,
    fontWeight: '400',
  },

  itemRow: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: '#FFFFFF',
  borderRadius: 12,
  padding: 10,
  marginBottom: 8,
  shadowColor: '#000',
  shadowOpacity: 0.04,
  shadowOffset: { width: 0, height: 1 },
  shadowRadius: 2,
  elevation: 1,
},

badge: {
  backgroundColor: '#F3F4F6',
  borderRadius: 6,
  paddingHorizontal: 6,
  paddingVertical: 2,
},
badgeText: { fontSize: 12, color: '#374151' },

itemInfo: { fontSize: 13, color: '#6B7280', marginBottom: 2 },

statusChip: {
  alignSelf: 'flex-start',
  backgroundColor: '#E5F3FF',
  borderColor: '#BFDBFE',
  borderWidth: 1,
  borderRadius: 999,
  paddingHorizontal: 8,
  paddingVertical: 2,
  marginTop: 4,
},
statusChipText: { fontSize: 12, color: '#1D4ED8' },

actions: {
  flexDirection: 'row',
  alignItems: 'center',
  marginLeft: 8,
},
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  editBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  deleteBtn: { backgroundColor: '#EF4444' },

  // edit modal
editOverlay: { flex: 1, backgroundColor: 'rgba(17,24,39,0.4)', justifyContent: 'center', alignItems: 'center' },
editBackdrop: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
editContainer: { width: '92%', maxWidth: 640, backgroundColor: '#FFF', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowOffset: { width: 0, height: 6 }, shadowRadius: 16, elevation: 6 },
editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
editTitle: { fontSize: 18, fontWeight: '400', color: '#111827' },

formGrid: { marginTop: 8 },
formRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
formCol: { flex: 1 },
label: { fontSize: 12, color: '#6B7280', marginBottom: 6 },
input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.select({ ios: 12, android: 8, default: 10 }), fontSize: 14, color: '#111827', backgroundColor: '#FFFFFF' },

actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
cancelBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
cancelText: { color: '#374151', fontWeight: '600' },
saveBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#3B82F6' },
saveText: { color: '#FFFFFF', fontWeight: '400' },

dangerBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 10,
  backgroundColor: '#EF4444',
},
dangerText: { color: '#FFFFFF', fontWeight: '400' },

itemsModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  itemsModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  itemsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  itemsModalTitle: {
    fontSize: 18,
    color: '#111827',
    fontWeight: '500',
  },
  itemsModalContent: {
    flex: 1,
    padding: 16,
    ...(Platform.OS === 'web' ? { overflow: 'auto' as any } : null),
  },

  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 14,
    marginTop: 8,
    marginBottom: 4,
  },

  filterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginRight: 24,
  },
  filterGroupLabel: {
    fontSize: 12,
    color: '#6B7280', 
    marginRight: 2,
  },
  filterBtn: {
    borderWidth: 1,
    borderColor: '#E5E7EB', 
    backgroundColor: '#F9FAFB',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  filterBtnActive: {
    backgroundColor: '#EEF2FF', 
    borderColor: '#C7D2FE', 
  },
  filterBtnText: {
    fontSize: 12,
    color: '#374151', 
  },
  filterBtnTextActive: {
    color: '#3730A3', 
    fontWeight: '600',
  },

});
