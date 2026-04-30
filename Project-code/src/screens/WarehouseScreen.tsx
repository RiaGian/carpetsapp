import { Ionicons } from '@expo/vector-icons';
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
import { logCreateShelf, logDeleteShelf, logUpdateShelf } from '../services/activitylog';
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

  // Get current user ID for logging
  const getCurrentUserId = async () => {
    try {
      console.log('🔍 Getting current user...');
      console.log('📧 Current user email:', currentUser.email);
      console.log('👤 Current user name:', currentUser.name);
      
      // First try to get user by email from route params
      if (currentUser.email) {
        const users = await database.get('users').query().fetch();
        console.log('👥 All users in DB:', users.map((u: any) => ({ id: u.id, email: (u as any).email, name: (u as any).name })));
        
        const user = users.find((u: any) => (u as any).email === currentUser.email);
        if (user) {
          console.log('✅ Found user by email:', { id: user.id, email: (user as any).email, name: (user as any).name });
          return user.id;
        } else {
          console.log('❌ No user found with email:', currentUser.email);
        }
      }
      
      // Fallback to first user or system
      const users = await database.get('users').query().fetch();
      const fallbackId = users.length > 0 ? users[0].id : 'system';
      console.log('🔄 Using fallback user ID:', fallbackId);
      return fallbackId;
    } catch (error) {
      console.error('❌ Error getting current user:', error);
      return 'system';
    }
  };

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

      // Sort by creation time (newest first) so new shelves appear right after the add card
      transformedShelves.sort((a, b) => b.created_at - a.created_at);

      setShelves(transformedShelves);
    } catch (error) {
      console.error('❌ Error loading shelves:', error);
    }
  }, []);

  useEffect(() => {
    loadShelves();
  }, [loadShelves]);

  // Filter shelves based on search query
  const filteredShelves = shelves.filter(shelf =>
    shelf.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    shelf.notes?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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

        <Pressable style={styles.addButton} onPress={handleAddShelf}>
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Νέο Ράφι</Text>
        </Pressable>
      </View>

      {/* Search Bar – ίδιο look με History */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color={colors.primary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
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
          <View key={shelf.id} style={isWide ? { width: '12%' } : { width: '48%' }}>
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

    {/* Modals – ΑΚΡΙΒΩΣ όπως τα έχεις τώρα */}
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
              barcode: shelfData.barcode || selectedShelf.barcode,
              floor: shelfData.floor || selectedShelf.floor,
              capacity: shelfData.capacity || selectedShelf.capacity,
              notes: shelfData.notes || selectedShelf.notes
            };
            await database.write(async () => {
              const shelfRecord = await database.get<Shelf>('shelves').find(selectedShelf.id);
              await shelfRecord.update((shelf: any) => {
                shelf.barcode = newValues.barcode;
                shelf.floor = newValues.floor;
                shelf.capacity = newValues.capacity;
                shelf.notes = newValues.notes;
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
      if (success) {
        setShowSuccessMessage(true);
        
        // Auto-close modal after 2.5 seconds
        setTimeout(() => {
          setShowSuccessMessage(false);
          onClose();
        }, 2500);
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
  if (!shelf) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.shelfDetailOverlay}>
        <Pressable style={styles.shelfDetailBackdrop} onPress={onClose}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={styles.shelfDetailContainer}>
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

                onClose();

                setTimeout(() => {
                  router.push(`/additem?shelfId=${shelf.id}&shelfCode=${shelf.code}&itemCount=${shelf.item_count}`);
                }, 200);
              }}
            >
              <Ionicons name="add-circle" size={24} color="#FFFFFF" />
              <Text style={styles.addItemButtonText}>Προσθήκη Υπάρχοντος Τεμαχίου</Text>
            </Pressable>

            {/* Items Section */}
            <View style={styles.shelfDetailSectionLast}>
              <Text style={styles.shelfDetailSectionTitle}>Τεμάχια στο Ράφι</Text>
              
              {shelf.item_count === 0 ? (
                <View style={styles.emptyItemsContainer}>
                  <Ionicons name="cube-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyItemsText}>Δεν υπάρχουν τεμάχια σε αυτό το ράφι</Text>
                </View>
              ) : (
                <View style={styles.itemsList}>
                  {/* Mock items for now - will be replaced with real data */}
                  <View style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemCode}>PAP001</Text>
                      <View style={styles.itemActions}>
                        <Pressable style={styles.itemActionButton}>
                          <Ionicons name="create" size={16} color="#6B7280" />
                        </Pressable>
                        <Pressable style={styles.itemActionButton}>
                          <Ionicons name="trash" size={16} color="#EF4444" />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={styles.itemDescription}>πάπλωμα - λευκό</Text>
                    <Text style={styles.itemOwner}>Γιάννης Κωνσταντίνου</Text>
                    <Text style={styles.itemDate}>2/1/2025</Text>
                    <View style={styles.itemStatus}>
                      <Text style={styles.itemStatusText}>πλυμένο</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>
        </Pressable>
        </Pressable>
      </View>
    </Modal>
  );
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
  fontWeight: '700',
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
  fontWeight: '800',
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
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    width: '100%',
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
  },
  shelfItemCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 8,
    marginBottom: 8,
  },
  shelfTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  shelfTagText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  shelfNotes: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  addShelfCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    marginBottom: 16,
    minHeight: 120,
  },
  addShelfText: {
    fontSize: 16,
    color: '#3B82F6',
    fontWeight: '400',
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
  width: '98%',          // σχεδόν full width
  maxWidth: 1400,        // για desktop
  height: '95%',         // σχεδόν full height
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
    fontWeight: '700',
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
    fontWeight: '700',
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
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  shelfDetailBackdrop: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },


  shelfDetailContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: '98%',
    height: '96%',
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
});
