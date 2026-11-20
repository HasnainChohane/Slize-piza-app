
"use strict";

const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const { app } = require("electron");

let database = null;
let databasePath = null;

const SCHEMA_VERSION = 1;

const ENTITIES = {
  products: {
    table: "products",
    fields: [
      "name", "sku", "barcode", "description", "category_id",
      "unit", "price_paisa", "cost_paisa", "stock_quantity",
      "low_stock_alert", "is_active"
    ],
    required: ["name"]
  },
  categories: {
    table: "categories",
    fields: ["name", "description"],
    required: ["name"]
  },
  customers: {
    table: "customers",
    fields: ["name", "phone", "email", "address", "notes"],
    required: ["name"]
  },
  suppliers: {
    table: "suppliers",
    fields: ["name", "phone", "email", "address", "notes"],
    required: ["name"]
  },
  expenses: {
    table: "expenses",
    fields: [
      "title", "category", "amount_paisa",
      "payment_method", "notes", "expense_date"
    ],
    required: ["title", "amount_paisa"]
  }
};

function getDatabasePath() {
  if (!app.isReady()) {
    throw new Error("Electron application is not ready.");
  }

  const directory = path.join(app.getPath("userData"), "database");
  fs.mkdirSync(directory, { recursive: true });

  return path.join(directory, "slicemaster.sqlite");
}

function getDb() {
  if (database && database.open) return database;

  databasePath = getDatabasePath();
  database = new Database(databasePath);

  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  database.pragma("synchronous = NORMAL");

  initializeSchema();

  return database;
}

function initializeSchema() {
  const db = database;

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      barcode TEXT,
      description TEXT,
      category_id INTEGER,
      unit TEXT DEFAULT 'pcs',
      price_paisa INTEGER NOT NULL DEFAULT 0 CHECK(price_paisa >= 0),
      cost_paisa INTEGER NOT NULL DEFAULT 0 CHECK(cost_paisa >= 0),
      stock_quantity REAL NOT NULL DEFAULT 0 CHECK(stock_quantity >= 0),
      low_stock_alert REAL NOT NULL DEFAULT 0 CHECK(low_stock_alert >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(category_id) REFERENCES categories(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      customer_id INTEGER,
      customer_name TEXT NOT NULL DEFAULT 'Walk-in Customer',
      subtotal_paisa INTEGER NOT NULL DEFAULT 0,
      discount_paisa INTEGER NOT NULL DEFAULT 0,
      tax_paisa INTEGER NOT NULL DEFAULT 0,
      total_paisa INTEGER NOT NULL DEFAULT 0,
      paid_paisa INTEGER NOT NULL DEFAULT 0,
      change_paisa INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      sku TEXT,
      quantity REAL NOT NULL CHECK(quantity > 0),
      price_paisa INTEGER NOT NULL,
      line_total_paisa INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(sale_id) REFERENCES sales(id)
        ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      supplier_id INTEGER,
      supplier_name TEXT,
      subtotal_paisa INTEGER NOT NULL DEFAULT 0,
      discount_paisa INTEGER NOT NULL DEFAULT 0,
      total_paisa INTEGER NOT NULL DEFAULT 0,
      paid_paisa INTEGER NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit_cost_paisa INTEGER NOT NULL,
      line_total_paisa INTEGER NOT NULL,
      FOREIGN KEY(purchase_id) REFERENCES purchases(id)
        ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      reference_type TEXT,
      reference_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
        ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT,
      amount_paisa INTEGER NOT NULL CHECK(amount_paisa >= 0),
      payment_method TEXT NOT NULL DEFAULT 'cash',
      notes TEXT,
      expense_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_type TEXT NOT NULL,
      reference_id INTEGER NOT NULL,
      amount_paisa INTEGER NOT NULL CHECK(amount_paisa >= 0),
      payment_method TEXT NOT NULL DEFAULT 'cash',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_products_category
      ON products(category_id);

    CREATE INDEX IF NOT EXISTS idx_products_name
      ON products(name);

    CREATE INDEX IF NOT EXISTS idx_sales_date
      ON sales(created_at);

    CREATE INDEX IF NOT EXISTS idx_sale_items_sale
      ON sale_items(sale_id);

    CREATE INDEX IF NOT EXISTS idx_purchases_date
      ON purchases(created_at);

    CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase
      ON purchase_items(purchase_id);

    CREATE INDEX IF NOT EXISTS idx_stock_product
      ON stock_movements(product_id);

    CREATE INDEX IF NOT EXISTS idx_expenses_date
      ON expenses(expense_date);
  `);

  const version = db.prepare(
    "SELECT value FROM schema_meta WHERE key = 'schema_version'"
  ).get();

  if (!version) {
    db.prepare(
      "INSERT INTO schema_meta (key, value) VALUES (?, ?)"
    ).run("schema_version", String(SCHEMA_VERSION));
  } else if (Number(version.value) > SCHEMA_VERSION) {
    throw new Error("Database version is newer than this application.");
  }
}

function initializeDatabase() {
  getDb();
  return { success: true, path: databasePath };
}

function closeDatabase() {
  if (database && database.open) {
    database.pragma("wal_checkpoint(TRUNCATE)");
    database.close();
  }

  database = null;
  databasePath = null;
}

function validateEntity(entity) {
  const config = ENTITIES[entity];

  if (!config) {
    throw new Error(`Unsupported database entity: ${entity}`);
  }

  return config;
}

function cleanPayload(config, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid record data.");
  }

  const payload = {};

  for (const field of config.fields) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      payload[field] = data[field];
    }
  }

  for (const field of config.required) {
    if (
      payload[field] === undefined ||
      payload[field] === null ||
      String(payload[field]).trim() === ""
    ) {
      throw new Error(`${field} is required.`);
    }
  }

  for (const field of [
    "price_paisa", "cost_paisa", "amount_paisa"
  ]) {
    if (payload[field] !== undefined) {
      const value = Number(payload[field]);

      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${field} must be a non-negative integer in paisa.`);
      }

      payload[field] = value;
    }
  }

  for (const field of [
    "stock_quantity", "low_stock_alert"
  ]) {
    if (payload[field] !== undefined) {
      const value = Number(payload[field]);

      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${field} must be non-negative.`);
      }

      payload[field] = value;
    }
  }

  if (payload.is_active !== undefined) {
    payload.is_active = Number(payload.is_active) ? 1 : 0;
  }

  if (payload.category_id !== undefined && payload.category_id !== null &&
      payload.category_id !== "") {
    payload.category_id = Number(payload.category_id);

    if (!Number.isInteger(payload.category_id) || payload.category_id <= 0) {
      throw new Error("Invalid category ID.");
    }
  } else if (payload.category_id !== undefined) {
    payload.category_id = null;
  }

  if (payload.sku !== undefined && payload.sku !== null) {
    payload.sku = String(payload.sku).trim() || null;
  }

  return payload;
}

function listRecords(entity) {
  const config = validateEntity(entity);

  return getDb().prepare(
    `SELECT * FROM ${config.table} ORDER BY id DESC`
  ).all();
}

function createRecord(entity, data) {
  const config = validateEntity(entity);
  const payload = cleanPayload(config, data);
  const fields = Object.keys(payload);

  if (!fields.length) {
    throw new Error("No valid fields supplied.");
  }

  const columns = fields.join(", ");
  const placeholders = fields.map(() => "?").join(", ");

  const result = getDb().prepare(`
    INSERT INTO ${config.table} (${columns})
    VALUES (${placeholders})
  `).run(...fields.map(field => payload[field]));

  return getDb().prepare(
    `SELECT * FROM ${config.table} WHERE id = ?`
  ).get(result.lastInsertRowid);
}

function updateRecord(entity, id, data) {
  const config = validateEntity(entity);
  const recordId = Number(id);

  if (!Number.isInteger(recordId) || recordId <= 0) {
    throw new Error("Invalid record ID.");
  }

  const payload = cleanPayload(config, data);
  const fields = Object.keys(payload);

  if (!fields.length) {
    throw new Error("No valid fields supplied.");
  }

  const assignments = fields.map(field => `${field} = ?`);

  if (config.fields.includes("updated_at")) {
    assignments.push("updated_at = CURRENT_TIMESTAMP");
  }

  const result = getDb().prepare(`
    UPDATE ${config.table}
    SET ${assignments.join(", ")}
    WHERE id = ?
  `).run(...fields.map(field => payload[field]), recordId);

  if (!result.changes) {
    throw new Error("Record not found.");
  }

  return getDb().prepare(
    `SELECT * FROM ${config.table} WHERE id = ?`
  ).get(recordId);
}

function deleteRecord(entity, id) {
  const config = validateEntity(entity);
  const recordId = Number(id);

  if (!Number.isInteger(recordId) || recordId <= 0) {
    throw new Error("Invalid record ID.");
  }

  const result = getDb().prepare(
    `DELETE FROM ${config.table} WHERE id = ?`
  ).run(recordId);

  if (!result.changes) {
    throw new Error("Record not found.");
  }

  return { id: recordId, deleted: true };
}

function createInvoiceNumber(prefix) {
  const date = new Date();
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");

  const random = Math.random().toString(36).slice(2, 7).toUpperCase();

  return `${prefix}-${stamp}-${random}`;
}

function validateMoney(value, label) {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`${label} must be a non-negative integer in paisa.`);
  }

  return amount;
}

function validateQuantity(value) {
  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }

  return quantity;
}

function createSale(data) {
  if (!data || !Array.isArray(data.items) || !data.items.length) {
    throw new Error("A sale must contain at least one item.");
  }

  const db = getDb();

  const transaction = db.transaction(() => {
    let subtotal = 0;
    const items = [];

    for (const input of data.items) {
      const productId = Number(input.productId);
      const quantity = validateQuantity(input.quantity);

      if (!Number.isInteger(productId) || productId <= 0) {
        throw new Error("Invalid product ID.");
      }

      const product = db.prepare(
        "SELECT * FROM products WHERE id = ? AND is_active = 1"
      ).get(productId);

      if (!product) {
        throw new Error(`Product ${productId} does not exist or is inactive.`);
      }

      if (Number(product.stock_quantity) < quantity) {
        throw new Error(`Insufficient stock for ${product.name}.`);
      }

      const price = validateMoney(product.price_paisa, "Product price");
      const lineTotal = Math.round(price * quantity);

      subtotal += lineTotal;

      items.push({
        product,
        quantity,
        price,
        lineTotal
      });
    }

    const discount = validateMoney(data.discountPaisa ?? 0, "Discount");
    const tax = validateMoney(data.taxPaisa ?? 0, "Tax");

    if (discount > subtotal) {
      throw new Error("Discount cannot exceed subtotal.");
    }

    const total = subtotal - discount + tax;
    const paid = validateMoney(data.paidPaisa ?? total, "Paid amount");

    if (paid < total) {
      throw new Error("Paid amount cannot be less than the sale total.");
    }

    const customerId = data.customerId == null
      ? null
      : Number(data.customerId);

    let customerName = "Walk-in Customer";

    if (customerId !== null) {
      if (!Number.isInteger(customerId) || customerId <= 0) {
        throw new Error("Invalid customer ID.");
      }

      const customer = db.prepare(
        "SELECT name FROM customers WHERE id = ?"
      ).get(customerId);

      if (!customer) throw new Error("Customer not found.");
      customerName = customer.name;
    }

    const invoice = createInvoiceNumber("SM");

    const saleResult = db.prepare(`
      INSERT INTO sales (
        invoice_number, customer_id, customer_name,
        subtotal_paisa, discount_paisa, tax_paisa,
        total_paisa, paid_paisa, change_paisa, payment_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoice,
      customerId,
      customerName,
      subtotal,
      discount,
      tax,
      total,
      paid,
      paid - total,
      String(data.paymentMethod || "cash")
    );

    const saleId = Number(saleResult.lastInsertRowid);

    const insertItem = db.prepare(`
      INSERT INTO sale_items (
        sale_id, product_id, product_name, sku,
        quantity, price_paisa, line_total_paisa
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE products
      SET stock_quantity = stock_quantity - ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const movement = db.prepare(`
      INSERT INTO stock_movements (
        product_id, movement_type, quantity,
        reference_type, reference_id, notes
      ) VALUES (?, 'sale', ?, 'sale', ?, ?)
    `);

    for (const item of items) {
      insertItem.run(
        saleId,
        item.product.id,
        item.product.name,
        item.product.sku,
        item.quantity,
        item.price,
        item.lineTotal
      );

      updateStock.run(item.quantity, item.product.id);

      movement.run(
        item.product.id,
        -item.quantity,
        saleId,
        `Sale ${invoice}`
      );
    }

    db.prepare(`
      INSERT INTO payments (
        reference_type, reference_id, amount_paisa, payment_method
      ) VALUES ('sale', ?, ?, ?)
    `).run(saleId, paid, String(data.paymentMethod || "cash"));

    return {
      id: saleId,
      invoice_number: invoice,
      subtotal_paisa: subtotal,
      discount_paisa: discount,
      tax_paisa: tax,
      total_paisa: total,
      paid_paisa: paid,
      change_paisa: paid - total,
      customer_name: customerName,
      payment_method: String(data.paymentMethod || "cash")
    };
  });

  return transaction();
}

function listSales() {
  const db = getDb();

  const sales = db.prepare(`
    SELECT s.*, c.name AS customer_name
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    ORDER BY s.id DESC
  `).all();

  const getItems = db.prepare(`
    SELECT
      si.*,
      si.product_name AS name,
      si.product_id AS product_id
    FROM sale_items si
    WHERE si.sale_id = ?
    ORDER BY si.id ASC
  `);

  return sales.map(sale => ({
    ...sale,
    items: getItems.all(sale.id)
  }));
}

function createPurchase(data) {
  if (!data || !Array.isArray(data.items) || !data.items.length) {
    throw new Error("A purchase must contain at least one item.");
  }

  const db = getDb();

  const transaction = db.transaction(() => {
    const supplierId = data.supplierId == null
      ? null
      : Number(data.supplierId);

    let supplierName = null;

    if (supplierId !== null) {
      if (!Number.isInteger(supplierId) || supplierId <= 0) {
        throw new Error("Invalid supplier ID.");
      }

      const supplier = db.prepare(
        "SELECT name FROM suppliers WHERE id = ?"
      ).get(supplierId);

      if (!supplier) throw new Error("Supplier not found.");
      supplierName = supplier.name;
    }

    let subtotal = 0;
    const items = [];

    for (const input of data.items) {
      const productId = Number(input.productId);
      const quantity = validateQuantity(input.quantity);
      const unitCost = validateMoney(input.unitCostPaisa, "Unit cost");

      const product = db.prepare(
        "SELECT * FROM products WHERE id = ?"
      ).get(productId);

      if (!product) throw new Error(`Product ${productId} not found.`);

      const lineTotal = Math.round(quantity * unitCost);
      subtotal += lineTotal;

      items.push({
        product,
        quantity,
        unitCost,
        lineTotal
      });
    }

    const discount = validateMoney(data.discountPaisa ?? 0, "Discount");

    if (discount > subtotal) {
      throw new Error("Purchase discount cannot exceed subtotal.");
    }

    const total = subtotal - discount;
    const paid = validateMoney(data.paidPaisa ?? 0, "Paid amount");

    if (paid > total) {
      throw new Error("Paid amount cannot exceed purchase total.");
    }

    const invoice = createInvoiceNumber("PUR");

    const result = db.prepare(`
      INSERT INTO purchases (
        invoice_number, supplier_id, supplier_name,
        subtotal_paisa, discount_paisa, total_paisa,
        paid_paisa, payment_method
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoice,
      supplierId,
      supplierName,
      subtotal,
      discount,
      total,
      paid,
      String(data.paymentMethod || "cash")
    );

    const purchaseId = Number(result.lastInsertRowid);

    const insertItem = db.prepare(`
      INSERT INTO purchase_items (
        purchase_id, product_id, product_name,
        quantity, unit_cost_paisa, line_total_paisa
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare(`
      UPDATE products
      SET stock_quantity = stock_quantity + ?,
          cost_paisa = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const movement = db.prepare(`
      INSERT INTO stock_movements (
        product_id, movement_type, quantity,
        reference_type, reference_id, notes
      ) VALUES (?, 'purchase', ?, 'purchase', ?, ?)
    `);

    for (const item of items) {
      insertItem.run(
        purchaseId,
        item.product.id,
        item.product.name,
        item.quantity,
        item.unitCost,
        item.lineTotal
      );

      updateStock.run(
        item.quantity,
        item.unitCost,
        item.product.id
      );

      movement.run(
        item.product.id,
        item.quantity,
        purchaseId,
        `Purchase ${invoice}`
      );
    }

    db.prepare(`
      INSERT INTO payments (
        reference_type, reference_id, amount_paisa, payment_method
      ) VALUES ('purchase', ?, ?, ?)
    `).run(
      purchaseId,
      paid,
      String(data.paymentMethod || "cash")
    );

    return {
      id: purchaseId,
      invoice_number: invoice,
      subtotal_paisa: subtotal,
      discount_paisa: discount,
      total_paisa: total,
      paid_paisa: paid
    };
  });

  return transaction();
}

function getDashboardSummary() {
  const db = getDb();

  const today = db.prepare(`
    SELECT
      COALESCE(SUM(total_paisa), 0) AS todaySales,
      COUNT(*) AS invoice_count
    FROM sales
    WHERE date(created_at, 'localtime') = date('now', 'localtime')
  `).get();

  const products = db.prepare(`
    SELECT COUNT(*) AS productCount FROM products
  `).get();

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(total_paisa), 0) AS allSales,
      COALESCE(SUM(paid_paisa), 0) AS totalPaid
    FROM sales
  `).get();

  return {
    ...today,
    today_sales: today.todaySales,
    productCount: products.productCount,
    product_count: products.productCount,
    totalSales: totals.allSales,
    totalPaid: totals.totalPaid,
    totalOrders: today.invoice_count
  };
}

function getDatabaseHealth() {
  const db = getDb();

  const integrity = db.pragma("integrity_check");
  const foreignKeys = db.pragma("foreign_key_check");
  const journal = db.pragma("journal_mode", { simple: true });

  return {
    ok: integrity.length === 1 && integrity[0].integrity_check === "ok" &&
      foreignKeys.length === 0,
    status: "connected",
    database: databasePath,
    databasePath,
    integrity: integrity[0]?.integrity_check || "unknown",
    integrity_check: integrity[0]?.integrity_check || "unknown",
    foreignKeyErrors: foreignKeys.length,
    journalMode: journal,
    journal_mode: journal
  };
}

function createBackup() {
  const db = getDb();

  const directory = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(directory, { recursive: true });

  const filename = `slicemaster-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.sqlite`;

  const destination = path.join(directory, filename);

  return db.backup(destination).then(() => ({
    success: true,
    path: destination,
    filename
  }));
}

async function restoreBackup() {
  getDb();

  const directory = path.join(app.getPath("userData"), "backups");

  if (!fs.existsSync(directory)) {
    throw new Error("Backup directory does not exist.");
  }

  const backups = fs.readdirSync(directory)
    .filter(name => name.endsWith(".sqlite"))
    .map(name => ({
      name,
      path: path.join(directory, name),
      time: fs.statSync(path.join(directory, name)).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);

  if (!backups.length) {
    throw new Error("No database backups found.");
  }

  const source = backups[0].path;
  const temporary = `${databasePath}.restore.tmp`;

  const validation = new Database(source, { readonly: true });

  try {
    const integrity = validation.pragma("integrity_check");
    const foreignKeys = validation.pragma("foreign_key_check");

    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
      throw new Error("Backup integrity validation failed.");
    }

    if (foreignKeys.length) {
      throw new Error("Backup contains foreign-key errors.");
    }

    const version = validation.prepare(
      "SELECT value FROM schema_meta WHERE key = 'schema_version'"
    ).get();

    if (!version || Number(version.value) > SCHEMA_VERSION) {
      throw new Error("Unsupported backup database version.");
    }
  } finally {
    validation.close();
  }

  await fs.promises.copyFile(source, temporary);

  closeDatabase();

  try {
    fs.copyFileSync(temporary, databasePath);
    fs.rmSync(temporary, { force: true });

    getDb();

    return {
      success: true,
      path: source,
      message: "Database restored successfully."
    };
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function getAppInfo() {
  return {
    name: "SliceMaster POS ERP",
    version: app.getVersion(),
    platform: process.platform
  };
}

module.exports = {
  initializeDatabase,
  initialize: initializeDatabase,
  getDb,
  getDatabase: getDb,
  getDatabasePath,
  closeDatabase,

  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,

  list: listRecords,
  create: createRecord,
  update: updateRecord,
  remove: deleteRecord,

  createSale,
  listSales,
  createPurchase,

  getDashboardSummary,
  getSummary: getDashboardSummary,
  getDatabaseHealth,
  health: getDatabaseHealth,
  getAppInfo,

  createBackup,
  restoreBackup
};
