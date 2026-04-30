import { Q } from '@nozbe/watermelondb'
import { database } from '../database/initializeDatabase'

// ===================== AUTHENTICATION LOGGING =====================

export async function logLoginSuccess(userId: string, email: string, username: string, device: string, os: string, ip: string, appVersion: string) {
  await logActivity(
    userId, 
    'LOGIN_SUCCESS', 
    { 
      email, 
      username,
      device, 
      os, 
      ip, 
      appVersion, 
      timestamp: new Date().toISOString() 
    }, 
    'authentication', 
    'success'
  )
}

export async function logLoginFailure(email: string, reason: string, device: string, os: string, ip: string) {
  // For failed logins, we might not have a userId, so we'll use a system user
  const systemUserId = await getSystemUserId()
  await logActivity(
    systemUserId, 
    'LOGIN_FAILURE', 
    { email, reason, device, os, ip, timestamp: new Date().toISOString() }, 
    'authentication', 
    'error'
  )
}

export async function logLogout(userId: string, device: string, os: string) {
  await logActivity(
    userId, 
    'LOGOUT', 
    { device, os, timestamp: new Date().toISOString() }, 
    'authentication', 
    'success'
  )
}

export async function logPasswordResetRequested(email: string, device: string, os: string, ip: string) {
  const systemUserId = await getSystemUserId()
  await logActivity(
    systemUserId, 
    'PASSWORD_RESET_REQUESTED', 
    { email, device, os, ip, timestamp: new Date().toISOString() }, 
    'authentication', 
    'update'
  )
}

export async function logPasswordResetSuccess(userId: string, email: string, device: string, os: string) {
  await logActivity(
    userId, 
    'PASSWORD_RESET_SUCCESS', 
    { email, device, os, timestamp: new Date().toISOString() }, 
    'authentication', 
    'success'
  )
}

export async function logDeviceRegistered(userId: string, device: string, os: string, deviceId: string) {
  await logActivity(
    userId, 
    'DEVICE_REGISTERED', 
    { device, os, deviceId, timestamp: new Date().toISOString() }, 
    'authentication', 
    'success'
  )
}

export async function logSessionExpired(userId: string, device: string, os: string, lastActivity: string) {
  await logActivity(
    userId, 
    'SESSION_EXPIRED', 
    { device, os, lastActivity, timestamp: new Date().toISOString() }, 
    'authentication', 
    'update'
  )
}

// ===================== CUSTOMER MANAGEMENT LOGGING =====================

export async function logCreateCustomer(userId: string, customerId: string, customerData: any) {
  await logActivity(
    userId, 
    'CREATE_CUSTOMER', 
    { customerId, customerData, timestamp: new Date().toISOString() }, 
    'customers', 
    'success'
  )
}

export async function logUpdateCustomer(userId: string, customerId: string, oldValues: any, newValues: any) {
  await logActivity(
    userId, 
    'UPDATE_CUSTOMER', 
    { customerId, oldValues, newValues, timestamp: new Date().toISOString() }, 
    'customers', 
    'update'
  )
}

export async function logDeleteCustomer(userId: string, customerId: string, customerData: any) {
  await logActivity(
    userId, 
    'DELETE_CUSTOMER', 
    { customerId, customerData, timestamp: new Date().toISOString() }, 
    'customers', 
    'success'
  )
}

export async function logAddCustomerPhone(userId: string, customerId: string, phoneNumber: string) {
  await logActivity(
    userId, 
    'ADD_CUSTOMER_PHONE', 
    { customerId, phoneNumber, timestamp: new Date().toISOString() }, 
    'customers', 
    'success'
  )
}

export async function logUpdateCustomerPhone(userId: string, customerId: string, oldPhone: string, newPhone: string) {
  await logActivity(
    userId, 
    'UPDATE_CUSTOMER_PHONE', 
    { customerId, oldPhone, newPhone, timestamp: new Date().toISOString() }, 
    'customers', 
    'update'
  )
}

export async function logDeleteCustomerPhone(userId: string, customerId: string, phoneNumber: string) {
  await logActivity(
    userId, 
    'DELETE_CUSTOMER_PHONE', 
    { customerId, phoneNumber, timestamp: new Date().toISOString() }, 
    'customers', 
    'success'
  )
}

export async function logAddCustomerAddress(userId: string, customerId: string, address: string) {
  await logActivity(
    userId, 
    'ADD_CUSTOMER_ADDRESS', 
    { customerId, address, timestamp: new Date().toISOString() }, 
    'customers', 
    'success'
  )
}

export async function logUpdateCustomerAddress(userId: string, customerId: string, oldAddress: string, newAddress: string) {
  await logActivity(
    userId, 
    'UPDATE_CUSTOMER_ADDRESS', 
    { customerId, oldAddress, newAddress, timestamp: new Date().toISOString() }, 
    'customers', 
    'update'
  )
}

export async function logDeleteCustomerAddress(userId: string, customerId: string, address: string) {
  await logActivity(
    userId, 
    'DELETE_CUSTOMER_ADDRESS', 
    { customerId, address, timestamp: new Date().toISOString() }, 
    'customers', 
    'success'
  )
}

// ===================== ORDER MANAGEMENT LOGGING =====================

export async function logCreateOrder(userId: string, orderId: string, orderData: any) {
  await logActivity(
    userId, 
    'CREATE_ORDER', 
    { orderId, orderData, timestamp: new Date().toISOString() }, 
    'orders', 
    'success'
  )
}

export async function logUpdateOrder(userId: string, orderId: string, oldValues: any, newValues: any) {
  await logActivity(
    userId, 
    'UPDATE_ORDER', 
    { orderId, oldValues, newValues, timestamp: new Date().toISOString() }, 
    'orders', 
    'update'
  )
}

export async function logDeleteOrder(userId: string, orderId: string, orderData: any) {
  await logActivity(
    userId, 
    'DELETE_ORDER', 
    { orderId, orderData, timestamp: new Date().toISOString() }, 
    'orders', 
    'success'
  )
}

export async function logAddOrderItem(userId: string, orderId: string, itemId: string, itemData: any) {
  await logActivity(
    userId, 
    'ADD_ORDER_ITEM', 
    { orderId, itemId, itemData, timestamp: new Date().toISOString() }, 
    'orders', 
    'success'
  )
}

export async function logUpdateOrderItem(userId: string, orderId: string, itemId: string, oldValues: any, newValues: any) {
  await logActivity(
    userId, 
    'UPDATE_ORDER_ITEM', 
    { orderId, itemId, oldValues, newValues, timestamp: new Date().toISOString() }, 
    'orders', 
    'update'
  )
}

export async function logDeleteOrderItem(userId: string, orderId: string, itemId: string, itemData: any) {
  await logActivity(
    userId, 
    'DELETE_ORDER_ITEM', 
    { orderId, itemId, itemData, timestamp: new Date().toISOString() }, 
    'orders', 
    'success'
  )
}

export async function logOrderPaymentUpdated(userId: string, orderId: string, oldPayment: any, newPayment: any) {
  await logActivity(
    userId, 
    'ORDER_PAYMENT_UPDATED', 
    { orderId, oldPayment, newPayment, timestamp: new Date().toISOString() }, 
    'orders', 
    'update'
  )
}

export async function logOrderStatusChanged(userId: string, orderId: string, oldStatus: string, newStatus: string) {
  await logActivity(
    userId, 
    'ORDER_STATUS_CHANGED', 
    { orderId, oldStatus, newStatus, timestamp: new Date().toISOString() }, 
    'orders', 
    'update'
  )
}

// ===================== ITEM MANAGEMENT LOGGING =====================

export async function logCreateItem(userId: string, itemId: string, itemData: any) {
  await logActivity(
    userId, 
    'CREATE_ITEM', 
    { itemId, itemData, timestamp: new Date().toISOString() }, 
    'items', 
    'success'
  )
}

export async function logUpdateItemStatus(userId: string, itemId: string, oldStatus: string, newStatus: string) {
  await logActivity(
    userId, 
    'UPDATE_ITEM_STATUS', 
    { itemId, oldStatus, newStatus, timestamp: new Date().toISOString() }, 
    'items', 
    'update'
  )
}

export async function logUpdateItemDetails(userId: string, itemId: string, oldDetails: any, newDetails: any) {
  await logActivity(
    userId, 
    'UPDATE_ITEM_DETAILS', 
    { itemId, oldDetails, newDetails, timestamp: new Date().toISOString() }, 
    'items', 
    'update'
  )
}

export async function logDeleteItem(userId: string, itemId: string, itemData: any) {
  await logActivity(
    userId, 
    'DELETE_ITEM', 
    { itemId, itemData, timestamp: new Date().toISOString() }, 
    'items', 
    'success'
  )
}

export async function logMoveItemToShelf(userId: string, itemId: string, shelfId: string, shelfCode: string) {
  await logActivity(
    userId, 
    'MOVE_ITEM_TO_SHELF', 
    { itemId, shelfId, shelfCode, timestamp: new Date().toISOString() }, 
    'items', 
    'update'
  )
}

export async function logRemoveItemFromShelf(userId: string, itemId: string, shelfId: string, shelfCode: string) {
  await logActivity(
    userId, 
    'REMOVE_ITEM_FROM_SHELF', 
    { itemId, shelfId, shelfCode, timestamp: new Date().toISOString() }, 
    'items', 
    'update'
  )
}

export async function logTransferItemShelf(userId: string, itemId: string, fromShelfId: string, toShelfId: string) {
  await logActivity(
    userId, 
    'TRANSFER_ITEM_SHELF', 
    { itemId, fromShelfId, toShelfId, timestamp: new Date().toISOString() }, 
    'items', 
    'update'
  )
}

export async function logItemStorageStatusChanged(userId: string, itemId: string, oldStatus: string, newStatus: string) {
  await logActivity(
    userId, 
    'ITEM_STORAGE_STATUS_CHANGED', 
    { itemId, oldStatus, newStatus, timestamp: new Date().toISOString() }, 
    'items', 
    'update'
  )
}

// ===================== SHELF MANAGEMENT LOGGING =====================

export async function logCreateShelf(userId: string, shelfId: string, shelfData: any) {
  await logActivity(
    userId, 
    'CREATE_SHELF', 
    { shelfId, shelfData, timestamp: new Date().toISOString() }, 
    'shelves', 
    'success'
  )
}

export async function logUpdateShelf(userId: string, shelfId: string, oldValues: any, newValues: any) {
  await logActivity(
    userId, 
    'UPDATE_SHELF', 
    { shelfId, oldValues, newValues, timestamp: new Date().toISOString() }, 
    'shelves', 
    'update'
  )
}

export async function logDeleteShelf(userId: string, shelfId: string, shelfData: any) {
  await logActivity(
    userId, 
    'DELETE_SHELF', 
    { shelfId, shelfData, timestamp: new Date().toISOString() }, 
    'shelves', 
    'success'
  )
}

export async function logShelfCapacityUpdated(userId: string, shelfId: string, oldCapacity: number, newCapacity: number) {
  await logActivity(
    userId, 
    'SHELF_CAPACITY_UPDATED', 
    { shelfId, oldCapacity, newCapacity, timestamp: new Date().toISOString() }, 
    'shelves', 
    'update'
  )
}

export async function logShelfQRScanned(userId: string, shelfId: string, qrCode: string) {
  await logActivity(
    userId, 
    'SHELF_QR_SCANNED', 
    { shelfId, qrCode, timestamp: new Date().toISOString() }, 
    'shelves', 
    'success'
  )
}

export async function logItemsScannedToShelf(userId: string, shelfId: string, itemCount: number, items: string[]) {
  await logActivity(
    userId, 
    'ITEMS_SCANNED_TO_SHELF', 
    { shelfId, itemCount, items, timestamp: new Date().toISOString() }, 
    'shelves', 
    'success'
  )
}

// ===================== HISTORY & REPORTING LOGGING =====================

export async function logViewCustomerHistory(userId: string, customerId: string, yearRange: string) {
  await logActivity(
    userId, 
    'VIEW_CUSTOMER_HISTORY', 
    { customerId, yearRange, timestamp: new Date().toISOString() }, 
    'history', 
    'success'
  )
}

export async function logFilterHistoryApplied(userId: string, filters: any) {
  await logActivity(
    userId, 
    'FILTER_HISTORY_APPLIED', 
    { filters, timestamp: new Date().toISOString() }, 
    'history', 
    'success'
  )
}

export async function logExportHistoryPDF(userId: string, exportData: any) {
  await logActivity(
    userId, 
    'EXPORT_HISTORY_PDF', 
    { exportData, timestamp: new Date().toISOString() }, 
    'history', 
    'success'
  )
}

export async function logViewWarehouseSummary(userId: string, summaryData: any) {
  await logActivity(
    userId, 
    'VIEW_WAREHOUSE_SUMMARY', 
    { summaryData, timestamp: new Date().toISOString() }, 
    'history', 
    'success'
  )
}

// ===================== SYSTEM ERROR LOGGING =====================

export async function logValidationError(userId: string, formName: string, fieldName: string, errorMessage: string) {
  await logActivity(
    userId, 
    'VALIDATION_ERROR', 
    { formName, fieldName, errorMessage, timestamp: new Date().toISOString() }, 
    'system', 
    'error'
  )
}

export async function logDuplicateEntryDetected(userId: string, entryType: string, entryData: any) {
  await logActivity(
    userId, 
    'DUPLICATE_ENTRY_DETECTED', 
    { entryType, entryData, timestamp: new Date().toISOString() }, 
    'system', 
    'error'
  )
}

export async function logNetworkErrorRetry(userId: string, operation: string, retryCount: number, errorMessage: string) {
  await logActivity(
    userId, 
    'NETWORK_ERROR_RETRY', 
    { operation, retryCount, errorMessage, timestamp: new Date().toISOString() }, 
    'system', 
    'error'
  )
}

export async function logUnauthorizedAccessAttempt(userId: string, resource: string, action: string, ip: string) {
  await logActivity(
    userId, 
    'UNAUTHORIZED_ACCESS_ATTEMPT', 
    { resource, action, ip, timestamp: new Date().toISOString() }, 
    'system', 
    'error'
  )
}

// ===================== HELPER FUNCTIONS =====================

async function getSystemUserId(): Promise<string> {
  try {
    const users = await database.get('users').query().fetch();
    if (users.length > 0) {
      return users[0].id;
    }
    // If no users exist, create a system user
    const systemUser = await database.get('users').create((user: any) => {
      user.email = 'system@carpetsapp.com';
      user.name = 'System';
      user.password_hash = 'system';
      user.created_at = Date.now();
    });
    return systemUser.id;
  } catch (error) {
    console.error('Error getting system user ID:', error);
    return 'system';
  }
}

export async function logActivity(
  userId: string, 
  action: string, 
  details?: object,
  category?: string,
  status?: string
) {
  const timestamp = new Date().toISOString()

  try {
  // insert to DB (topika/offline)
  const logs = database.get('activity_logs')
  await database.write(async () => {
    await logs.create((entry: any) => {
      entry.user_id = userId
      entry.action = action
      entry.details = details ? JSON.stringify(details) : null
        entry.category = category || getCategoryFromAction(action)
        entry.status = status || getStatusFromAction(action)
        entry.timestamp = timestamp
      })
    })
    
    // Only log to server when data is inserted
    console.log(`✅ Activity logged to DB: ${action}`)
  } catch (error) {
    console.error(`❌ Error logging activity ${action}:`, error)
  }
}

function getCategoryFromAction(action: string): string {
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
}

function getStatusFromAction(action: string): string {
  if (action.includes('ERROR') || action.includes('FAILURE') || action.includes('UNAUTHORIZED') || action.includes('VALIDATION') || action.includes('DUPLICATE') || action.includes('NETWORK')) {
    return 'error';
  } else if (action.includes('UPDATE') || action.includes('CHANGE') || action.includes('TRANSFER') || action.includes('MOVE') || action.includes('REMOVE')) {
    return 'update';
  } else {
    return 'success';
  }
}

// ===================== HELPER FUNCTIONS =====================

// Helper function to log login with user data from database
export async function logUserLogin(userId: string, device: string, os: string, ip: string, appVersion: string) {
  try {
    // Get user data from database
    const user = await database.get('users').find(userId);
    const email = (user as any).email;
    const username = (user as any).name;
    
    await logLoginSuccess(userId, email, username, device, os, ip, appVersion);
  } catch (error) {
    console.error('❌ Error in logUserLogin:', error);
    // Fallback to basic login log
    await logLoginSuccess(userId, 'unknown@example.com', 'Unknown User', device, os, ip, appVersion);
  }
}

// Legacy function for backward compatibility
export async function logLogin(userId: string, details?: object) {
  await logActivity(userId, 'LOGIN_SUCCESS', details, 'authentication', 'success')
}

// ===================== UTILITY FUNCTIONS =====================

// Clear all activity logs
export async function clearAllActivityLogs() {
  try {
    const logs = database.get('activity_logs');
    const allLogs = await logs.query().fetch();
    
    await database.write(async () => {
      for (const log of allLogs) {
        await log.destroyPermanently();
      }
    });
    
    console.log(`✅ Cleared ${allLogs.length} activity logs from DB`);
  } catch (error) {
    console.error('❌ Error clearing activity logs:', error);
  }
}

export async function printActivityLogs(limit = 10) {
  const logs = await database.get('activity_logs')
    .query(Q.sortBy('timestamp', Q.desc))
    .fetch()

  console.log(
    'ACTIVITY LOGS:',
    logs.slice(0, limit).map((l: any) => ({
      id: l.id,
      action: l.action,
      details: l.details,
      category: l.category,
      status: l.status,
      timestamp: l.timestamp,
    }))
  )
}

// Create sample activity logs for demonstration
export async function createSampleActivityLogs() {
  try {
    // Get the first user from the database
    const users = await database.get('users').query().fetch();
    
    if (users.length === 0) {
      return;
    }
    
    const userId = users[0].id;
    
    // Create sample logs with the new comprehensive system
    await logLoginSuccess(userId, 'user@example.com', (users[0] as any).name || 'Test User', 'iPhone 12', 'iOS', '192.168.1.1', '1.0.0');
    await logCreateCustomer(userId, 'cust_001', { name: 'Κώστας Βασιλείου', afm: '123456789' });
    await logCreateOrder(userId, 'order_001', { customerId: 'cust_001', totalAmount: 150.00 });
    await logCreateItem(userId, 'item_001', { code: 'XAL028', category: 'Carpet', color: 'Blue' });
    await logUpdateItemStatus(userId, 'item_001', 'Άπλυτο', 'Πλυμένο');
    await logCreateShelf(userId, 'shelf_001', { code: 'A-01', floor: 1, capacity: 50 });
    await logMoveItemToShelf(userId, 'item_001', 'shelf_001', 'A-01');
    
    console.log('✅ Sample activity logs created in DB');
    
  } catch (error) {
    console.error('❌ Error creating sample activity logs:', error);
  }
}