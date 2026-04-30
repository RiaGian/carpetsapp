import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const schema = appSchema({
  version: 1, 
  tables: [
    // ===================== USERS =====================
    tableSchema({
      name: 'users',
      columns: [
        { name: 'email', type: 'string', isIndexed: true },
        { name: 'password_hash', type: 'string' },
        { name: 'name', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ===================== CUSTOMERS =====================
    tableSchema({
      name: 'customers',
      columns: [
        { name: 'first_name', type: 'string' },
        { name: 'last_name', type: 'string' },
        { name: 'phone', type: 'string', isOptional: true },
        { name: 'address', type: 'string', isOptional: true },
        { name: 'city', type: 'string', isOptional: true },
        { name: 'afm', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'last_modified_at', type: 'number' },
      ],
    }),

    // ===================== CUSTOMER PHONES =====================
    tableSchema({
      name: 'customer_phones',
      columns: [
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'phone_number', type: 'string' },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ===================== CUSTOMER ADDRESSES =====================
    tableSchema({
      name: 'customer_addresses',
      columns: [
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'address', type: 'string' },
      ],
    }),

    // ===================== ORDERS =====================
    tableSchema({
      name: 'orders',
      columns: [
        { name: 'customer_id', type: 'string', isIndexed: true },
        { name: 'payment_method', type: 'string' },
        { name: 'deposit', type: 'number' },
        { name: 'total_amount', type: 'number' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'order_date', type: 'string' }, 
        { name: 'order_status', type: 'string', isIndexed: true },
        { name: 'has_debt', type: 'boolean', isOptional: true },
        { name: 'receipt_number', type: 'string', isOptional: true },
        { name: 'created_by', type: 'string', isIndexed: true }, // -> users.id
        { name: 'created_at', type: 'number' },
        { name: 'last_modified_at', type: 'number' },
      ],
    }),

    // ===================== ORDER ITEMS =====================
    tableSchema({
      name: 'order_items',
      columns: [
        { name: 'order_id', type: 'string', isIndexed: true },
        { name: 'item_code', type: 'string', isOptional: true },
        { name: 'category', type: 'string', isOptional: true }, 
        { name: 'color', type: 'string', isOptional: true },
        { name: 'price', type: 'number' },
        { name: 'status', type: 'string' },
        { name: 'storage_status', type: 'string', isOptional: true }, 
        { name: 'order_date', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ===================== SHELVES =====================
    tableSchema({
      name: 'shelves',
      columns: [
        { name: 'code', type: 'string', isIndexed: true },
        { name: 'barcode', type: 'string', isIndexed: true },
        { name: 'floor', type: 'number' },
        { name: 'capacity', type: 'number' },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'item_count', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),

    // ===================== WAREHOUSE ITEMS =====================
    tableSchema({
      name: 'warehouse_items',
      columns: [
        { name: 'item_id', type: 'string', isIndexed: true }, // -> order_items.id
        { name: 'shelf_id', type: 'string', isIndexed: true }, // -> shelves.id
        { name: 'placed_at', type: 'number' },
        { name: 'removed_at', type: 'number', isOptional: true },
        { name: 'is_active', type: 'boolean' },
      ],
    }),

    // ===================== ACTIVITY LOGS =====================
    tableSchema({
      name: 'activity_logs',
      columns: [
        { name: 'user_id', type: 'string', isIndexed: true },
        { name: 'action', type: 'string' },
        { name: 'details', type: 'string', isOptional: true }, // JSON --> string
        { name: 'category', type: 'string', isIndexed: true },
        { name: 'status', type: 'string', isIndexed: true },
        { name: 'timestamp', type: 'string', isIndexed: true },
      ],
    }),
  ],
})
