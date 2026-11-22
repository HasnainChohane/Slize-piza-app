
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

/* ======================================================
   DATABASE CONNECTION
====================================================== */

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

/* ======================================================
   DATABASE SCHEMA
====================================================== */

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

  createExtendedSchema(db);

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

/* ======================================================
   ENTITY VALIDATION
====================================================== */

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
        throw new Error(
          `${field} must be a non-negative integer in paisa.`
        );
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

  if (
    payload.category_id !== undefined &&
    payload.category_id !== null &&
    payload.category_id !== ""
  ) {
    payload.category_id = Number(payload.category_id);

    if (
      !Number.isInteger(payload.category_id) ||
      payload.category_id <= 0
    ) {
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

/* ======================================================
   GENERAL RECORD OPERATIONS
====================================================== */

function listRecords(entity) {
  const config = validateEntity(entity);

  // Archived products are excluded from normal product lists.
  if (entity === "products") {
    return getDb().prepare(`
      SELECT *
      FROM products
      WHERE is_active = 1
      ORDER BY id DESC
    `).all();
  }

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

  const db = getDb();

  const transaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO ${config.table} (${columns})
      VALUES (${placeholders})
    `).run(...fields.map(field => payload[field]));

    const id = Number(result.lastInsertRowid);

    if (
      entity === "products" &&
      Number(payload.stock_quantity || 0) > 0
    ) {
      db.prepare(`
        INSERT INTO stock_movements (
          product_id, movement_type, quantity,
          reference_type, reference_id, notes
        )
        VALUES (
          ?, 'opening_stock', ?, 'product', ?,
          'Opening stock entered when product was created.'
        )
      `).run(
        id,
        Number(payload.stock_quantity),
        id
      );
    }

    return db.prepare(
      `SELECT * FROM ${config.table} WHERE id = ?`
    ).get(id);
  });

  return transaction();
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

  const db = getDb();

  const transaction = db.transaction(() => {
    const existing = db.prepare(
      `SELECT * FROM ${config.table} WHERE id = ?`
    ).get(recordId);

    if (!existing) {
      throw new Error("Record not found.");
    }

    const previousStock =
      entity === "products" &&
      Object.prototype.hasOwnProperty.call(payload, "stock_quantity")
        ? Number(existing.stock_quantity)
        : null;

    const assignments = fields.map(field => `${field} = ?`);

    if (config.table !== "expenses" && config.table !== "products") {
      // These tables still have updated_at columns.
      assignments.push("updated_at = CURRENT_TIMESTAMP");
    } else {
      assignments.push("updated_at = CURRENT_TIMESTAMP");
    }

    db.prepare(`
      UPDATE ${config.table}
      SET ${assignments.join(", ")}
      WHERE id = ?
    `).run(
      ...fields.map(field => payload[field]),
      recordId
    );

    if (
      entity === "products" &&
      Object.prototype.hasOwnProperty.call(payload, "stock_quantity")
    ) {
      const delta = Number(payload.stock_quantity) - previousStock;

      if (delta !== 0) {
        db.prepare(`
          INSERT INTO stock_movements (
            product_id, movement_type, quantity,
            reference_type, reference_id, notes
          )
          VALUES (
            ?, 'adjustment', ?, 'product_update', ?,
            'Stock quantity changed from the product editor.'
          )
        `).run(recordId, delta, recordId);
      }
    }

    return db.prepare(
      `SELECT * FROM ${config.table} WHERE id = ?`
    ).get(recordId);
  });

  return transaction();
}

/* ======================================================
   SAFE DELETE / PRODUCT ARCHIVING
====================================================== */

function deleteRecord(entity, id) {
  const config = validateEntity(entity);
  const recordId = Number(id);

  if (!Number.isInteger(recordId) || recordId <= 0) {
    throw new Error("Invalid record ID.");
  }

  const db = getDb();

  return db.transaction(() => {
    const existing = db.prepare(
      `SELECT id FROM ${config.table} WHERE id = ?`
    ).get(recordId);

    if (!existing) {
      throw new Error("Record not found.");
    }

    /*
      Products are archived, not physically deleted.

      This protects:
      - Sales history
      - Purchase history
      - Product recipes
      - Deal components
      - Stock adjustments
      - Stock movement history
    */

    if (entity === "products") {
      db.prepare(`
        UPDATE products
        SET is_active = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(recordId);

      return {
        id: recordId,
        deleted: true,
        archived: true,
        message: "Product archived successfully. Historical records preserved."
      };
    }

    try {
      const result = db.prepare(
        `DELETE FROM ${config.table} WHERE id = ?`
      ).run(recordId);

      if (!result.changes) {
        throw new Error("Record not found.");
      }

      return {
        id: recordId,
        deleted: true,
        archived: false,
        message: "Record deleted successfully."
      };
    } catch (error) {
      if (
        error.code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
        error.code === "SQLITE_CONSTRAINT_TRIGGER"
      ) {
        const messages = {
          categories:
            "This category cannot be deleted because it is being used by another record.",
          customers:
            "This customer cannot be deleted because related records depend on it.",
          suppliers:
            "This supplier cannot be deleted because related records depend on it.",
          expenses:
            "This expense cannot be deleted because a database constraint prevents it."
        };

        throw new Error(
          messages[entity] ||
          "This record is being used by another database record and cannot be deleted."
        );
      }

      throw error;
    }
  })();
}

/* ======================================================
   COMMON HELPERS
====================================================== */

function createInvoiceNumber(prefix) {
  const date = new Date();

  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");

  const random = Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase();

  return `${prefix}-${stamp}-${random}`;
}

function validateMoney(value, label) {
  const amount = Number(value);

  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(
      `${label} must be a non-negative integer in paisa.`
    );
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

/* ======================================================
   EXTENDED DATABASE SCHEMA
====================================================== */

function createExtendedSchema(db = getDb()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_paisa INTEGER NOT NULL DEFAULT 0
        CHECK(price_paisa >= 0),
      is_active INTEGER NOT NULL DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deal_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0),
      FOREIGN KEY(deal_id) REFERENCES deals(id)
        ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id)
        ON DELETE RESTRICT,
      UNIQUE(deal_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS product_recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      ingredient_product_id INTEGER NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0),
      FOREIGN KEY(product_id) REFERENCES products(id)
        ON DELETE CASCADE,
      FOREIGN KEY(ingredient_product_id) REFERENCES products(id)
        ON DELETE RESTRICT,
      UNIQUE(product_id, ingredient_product_id),
      CHECK(product_id <> ingredient_product_id)
    );

    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      adjustment_type TEXT NOT NULL,
      quantity REAL NOT NULL CHECK(quantity > 0),
      unit_cost_paisa INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
        ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_deal_components_deal
      ON deal_components(deal_id);

    CREATE INDEX IF NOT EXISTS idx_recipe_product
      ON product_recipes(product_id);

    CREATE INDEX IF NOT EXISTS idx_adjustment_date
      ON stock_adjustments(created_at);
  `);

  const columns = db.prepare(
    "PRAGMA table_info(sale_items)"
  ).all().map(row => row.name);

  if (!columns.includes("item_type")) {
    db.exec(`
      ALTER TABLE sale_items
      ADD COLUMN item_type TEXT NOT NULL DEFAULT 'product'
    `);
  }

  if (!columns.includes("deal_id")) {
    db.exec(`
      ALTER TABLE sale_items
      ADD COLUMN deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL
    `);
  }
}

/* ======================================================
   SALES
====================================================== */

function createSale(data) {
  if (!data || !Array.isArray(data.items) || !data.items.length) {
    throw new Error("A sale must contain at least one item.");
  }

  const db = getDb();

  createExtendedSchema(db);

  const transaction = db.transaction(() => {
    let subtotal = 0;

    const saleLines = [];
    const stockNeeds = new Map();

    const recipeStmt = db.prepare(`
      SELECT ingredient_product_id, quantity
      FROM product_recipes
      WHERE product_id = ?
    `);

    const addProductNeed = (productId, quantity) => {
      const recipe = recipeStmt.all(productId);

      if (recipe.length) {
        for (const ingredient of recipe) {
          const ingredientId = Number(ingredient.ingredient_product_id);
          const needed = Number(ingredient.quantity) * quantity;

          stockNeeds.set(
            ingredientId,
            (stockNeeds.get(ingredientId) || 0) + needed
          );
        }
      } else {
        stockNeeds.set(
          productId,
          (stockNeeds.get(productId) || 0) + quantity
        );
      }
    };

    for (const input of data.items) {
      const quantity = validateQuantity(input.quantity);

      const isDeal =
        input.dealId != null ||
        input.deal_id != null ||
        input.itemType === "deal" ||
        input.item_type === "deal";

      if (isDeal) {
        const dealId = Number(input.dealId ?? input.deal_id);

        const deal = db.prepare(`
          SELECT *
          FROM deals
          WHERE id = ? AND is_active = 1
        `).get(dealId);

        if (!deal) {
          throw new Error("Deal not found or inactive.");
        }

        const today = new Date().toISOString().slice(0, 10);

        if (deal.start_date && today < deal.start_date) {
          throw new Error(`${deal.name} is not active yet.`);
        }

        if (deal.end_date && today > deal.end_date) {
          throw new Error(`${deal.name} has expired.`);
        }

        const components = db.prepare(`
          SELECT product_id, quantity
          FROM deal_components
          WHERE deal_id = ?
        `).all(dealId);

        if (!components.length) {
          throw new Error(`Deal ${deal.name} has no components.`);
        }

        for (const component of components) {
          addProductNeed(
            Number(component.product_id),
            Number(component.quantity) * quantity
          );
        }

        const price = validateMoney(deal.price_paisa, "Deal price");
        const lineTotal = Math.round(price * quantity);

        subtotal += lineTotal;

        saleLines.push({
          itemType: "deal",
          dealId,
          productId: null,
          name: deal.name,
          sku: null,
          quantity,
          price,
          lineTotal
        });
      } else {
        const productId = Number(
          input.productId ?? input.product_id
        );

        if (!Number.isInteger(productId) || productId <= 0) {
          throw new Error("Invalid product ID.");
        }

        const product = db.prepare(`
          SELECT *
          FROM products
          WHERE id = ? AND is_active = 1
        `).get(productId);

        if (!product) {
          throw new Error(
            `Product ${productId} does not exist or is inactive.`
          );
        }

        addProductNeed(productId, quantity);

        const price = validateMoney(
          product.price_paisa,
          "Product price"
        );

        const lineTotal = Math.round(price * quantity);

        subtotal += lineTotal;

        saleLines.push({
          itemType: "product",
          dealId: null,
          productId,
          name: product.name,
          sku: product.sku,
          quantity,
          price,
          lineTotal
        });
      }
    }

    // Check all required stock before creating the sale.
    for (const [productId, needed] of stockNeeds) {
      const product = db.prepare(
        "SELECT * FROM products WHERE id = ?"
      ).get(productId);

      if (!product) {
        throw new Error(
          "A recipe/deal inventory item no longer exists."
        );
      }

      if (
        Number(product.stock_quantity) + 1e-9 <
        needed
      ) {
        throw new Error(
          `Insufficient stock for ${product.name}. ` +
          `Required ${needed}, available ${product.stock_quantity} ${product.unit || ""}.`
        );
      }
    }

    const discount = validateMoney(
      data.discountPaisa ?? 0,
      "Discount"
    );

    const tax = validateMoney(
      data.taxPaisa ?? 0,
      "Tax"
    );

    if (discount > subtotal) {
      throw new Error("Discount cannot exceed subtotal.");
    }

    const total = subtotal - discount + tax;

    const paid = validateMoney(
      data.paidPaisa ?? total,
      "Paid amount"
    );

    if (paid < total) {
      throw new Error(
        "Paid amount cannot be less than the sale total."
      );
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

      if (!customer) {
        throw new Error("Customer not found.");
      }

      customerName = customer.name;
    }

    const paymentMethod = String(
      data.paymentMethod || "cash"
    );

    const invoice = createInvoiceNumber("SM");

    const saleId = Number(db.prepare(`
      INSERT INTO sales (
        invoice_number,
        customer_id,
        customer_name,
        subtotal_paisa,
        discount_paisa,
        tax_paisa,
        total_paisa,
        paid_paisa,
        change_paisa,
        payment_method
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      paymentMethod
    ).lastInsertRowid);

    const insertLine = db.prepare(`
      INSERT INTO sale_items (
        sale_id,
        product_id,
        product_name,
        sku,
        quantity,
        price_paisa,
        line_total_paisa,
        item_type,
        deal_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const line of saleLines) {
      insertLine.run(
        saleId,
        line.productId,
        line.name,
        line.sku,
        line.quantity,
        line.price,
        line.lineTotal,
        line.itemType,
        line.dealId
      );
    }

    const updateStock = db.prepare(`
      UPDATE products
      SET stock_quantity = stock_quantity - ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const movement = db.prepare(`
      INSERT INTO stock_movements (
        product_id,
        movement_type,
        quantity,
        reference_type,
        reference_id,
        notes
      )
      VALUES (?, 'sale', ?, 'sale', ?, ?)
    `);

    for (const [productId, needed] of stockNeeds) {
      updateStock.run(needed, productId);

      movement.run(
        productId,
        -needed,
        saleId,
        `Sale ${invoice} ingredient/product usage`
      );
    }

    db.prepare(`
      INSERT INTO payments (
        reference_type,
        reference_id,
        amount_paisa,
        payment_method
      )
      VALUES ('sale', ?, ?, ?)
    `).run(saleId, paid, paymentMethod);

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
      payment_method: paymentMethod
    };
  });

  return transaction();
}

function listSales() {
  const db = getDb();

  const sales = db.prepare(`
    SELECT
      s.*,
      COALESCE(c.name, s.customer_name) AS customer_name
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

/* ======================================================
   PURCHASES
====================================================== */

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

      if (!supplier) {
        throw new Error("Supplier not found.");
      }

      supplierName = supplier.name;
    }

    let subtotal = 0;
    const items = [];

    for (const input of data.items) {
      const productId = Number(
        input.productId ?? input.product_id
      );

      if (!Number.isInteger(productId) || productId <= 0) {
        throw new Error("Invalid purchase product ID.");
      }

      const quantity = validateQuantity(input.quantity);

      const unitCost = validateMoney(
        input.unitCostPaisa ?? input.unit_cost_paisa,
        "Unit cost"
      );

      const product = db.prepare(
        "SELECT * FROM products WHERE id = ? AND is_active = 1"
      ).get(productId);

      if (!product) {
        throw new Error(
          `Product ${productId} not found or inactive.`
        );
      }

      const lineTotal = Math.round(quantity * unitCost);

      subtotal += lineTotal;

      items.push({
        product,
        quantity,
        unitCost,
        lineTotal
      });
    }

    const discount = validateMoney(
      data.discountPaisa ?? 0,
      "Discount"
    );

    if (discount > subtotal) {
      throw new Error(
        "Purchase discount cannot exceed subtotal."
      );
    }

    const total = subtotal - discount;

    const paid = validateMoney(
      data.paidPaisa ?? 0,
      "Paid amount"
    );

    if (paid > total) {
      throw new Error(
        "Paid amount cannot exceed purchase total."
      );
    }

    const invoice = createInvoiceNumber("PUR");
    const paymentMethod = String(
      data.paymentMethod || "cash"
    );

    const result = db.prepare(`
      INSERT INTO purchases (
        invoice_number,
        supplier_id,
        supplier_name,
        subtotal_paisa,
        discount_paisa,
        total_paisa,
        paid_paisa,
        payment_method
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoice,
      supplierId,
      supplierName,
      subtotal,
      discount,
      total,
      paid,
      paymentMethod
    );

    const purchaseId = Number(result.lastInsertRowid);

    const insertItem = db.prepare(`
      INSERT INTO purchase_items (
        purchase_id,
        product_id,
        product_name,
        quantity,
        unit_cost_paisa,
        line_total_paisa
      )
      VALUES (?, ?, ?, ?, ?, ?)
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
        product_id,
        movement_type,
        quantity,
        reference_type,
        reference_id,
        notes
      )
      VALUES (?, 'purchase', ?, 'purchase', ?, ?)
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
        reference_type,
        reference_id,
        amount_paisa,
        payment_method
      )
      VALUES ('purchase', ?, ?, ?)
    `).run(
      purchaseId,
      paid,
      paymentMethod
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

/* ======================================================
   DEALS
====================================================== */

function listDeals() {
  const db = getDb();

  const deals = db.prepare(`
    SELECT *
    FROM deals
    ORDER BY id DESC
  `).all();

  const getComponents = db.prepare(`
    SELECT
      dc.product_id,
      dc.quantity,
      p.name AS product_name,
      p.unit
    FROM deal_components dc
    JOIN products p ON p.id = dc.product_id
    WHERE dc.deal_id = ?
    ORDER BY dc.id
  `);

  return deals.map(deal => ({
    ...deal,
    items: getComponents.all(deal.id)
  }));
}

function saveDeal(data, id = null) {
  if (!data || !String(data.name || "").trim()) {
    throw new Error("Deal name is required.");
  }

  if (!Array.isArray(data.items) || !data.items.length) {
    throw new Error("Add at least one product to the deal.");
  }

  const db = getDb();

  const price = validateMoney(
    data.pricePaisa ?? data.price_paisa ?? 0,
    "Deal price"
  );

  const active = Number(
    data.isActive ?? data.is_active ?? 1
  ) ? 1 : 0;

  const transaction = db.transaction(() => {
    let dealId = id == null ? null : Number(id);

    if (
      dealId != null &&
      (
        !Number.isInteger(dealId) ||
        dealId <= 0 ||
        !db.prepare(
          "SELECT id FROM deals WHERE id = ?"
        ).get(dealId)
      )
    ) {
      throw new Error("Deal not found.");
    }

    const values = [
      String(data.name).trim(),
      String(data.description || ""),
      price,
      active,
      data.startDate || data.start_date || null,
      data.endDate || data.end_date || null
    ];

    if (dealId == null) {
      dealId = Number(db.prepare(`
        INSERT INTO deals (
          name, description, price_paisa,
          is_active, start_date, end_date
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(...values).lastInsertRowid);
    } else {
      db.prepare(`
        UPDATE deals
        SET name = ?,
            description = ?,
            price_paisa = ?,
            is_active = ?,
            start_date = ?,
            end_date = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(...values, dealId);

      db.prepare(
        "DELETE FROM deal_components WHERE deal_id = ?"
      ).run(dealId);
    }

    const insert = db.prepare(`
      INSERT INTO deal_components (
        deal_id, product_id, quantity
      )
      VALUES (?, ?, ?)
    `);

    for (const item of data.items) {
      const productId = Number(
        item.productId ?? item.product_id
      );

      const quantity = validateQuantity(item.quantity);

      if (
        !Number.isInteger(productId) ||
        productId <= 0 ||
        !db.prepare(`
          SELECT id
          FROM products
          WHERE id = ? AND is_active = 1
        `).get(productId)
      ) {
        throw new Error(
          "A deal component product is invalid or inactive."
        );
      }

      insert.run(dealId, productId, quantity);
    }

    return dealId;
  });

  const savedId = transaction();

  return listDeals().find(deal => deal.id === savedId) || null;
}

function createDeal(data) {
  return saveDeal(data, null);
}

function updateDeal(id, data) {
  return saveDeal(data, id);
}

function deleteDeal(id) {
  const dealId = Number(id);

  if (!Number.isInteger(dealId) || dealId <= 0) {
    throw new Error("Invalid deal ID.");
  }

  const result = getDb().prepare(
    "DELETE FROM deals WHERE id = ?"
  ).run(dealId);

  if (!result.changes) {
    throw new Error("Deal not found.");
  }

  return {
    id: dealId,
    deleted: true
  };
}

/* ======================================================
   PRODUCT RECIPES
====================================================== */

function listRecipes(productId = null) {
  const db = getDb();

  const sql = `
    SELECT
      r.product_id,
      r.ingredient_product_id,
      r.quantity,
      p.name AS product_name,
      i.name AS ingredient_name,
      i.unit,
      i.cost_paisa
    FROM product_recipes r
    JOIN products p ON p.id = r.product_id
    JOIN products i ON i.id = r.ingredient_product_id
    ${productId == null ? "" : "WHERE r.product_id = ?"}
    ORDER BY p.name, i.name
  `;

  return productId == null
    ? db.prepare(sql).all()
    : db.prepare(sql).all(Number(productId));
}

function saveRecipe(productId, items) {
  const db = getDb();
  const pid = Number(productId);

  if (
    !Number.isInteger(pid) ||
    pid <= 0 ||
    !db.prepare(
      "SELECT id FROM products WHERE id = ? AND is_active = 1"
    ).get(pid)
  ) {
    throw new Error("Recipe product not found or inactive.");
  }

  if (!Array.isArray(items) || !items.length) {
    throw new Error(
      "A recipe must contain at least one ingredient."
    );
  }

  const transaction = db.transaction(() => {
    db.prepare(
      "DELETE FROM product_recipes WHERE product_id = ?"
    ).run(pid);

    const insert = db.prepare(`
      INSERT INTO product_recipes (
        product_id,
        ingredient_product_id,
        quantity
      )
      VALUES (?, ?, ?)
    `);

    for (const item of items) {
      const ingredientId = Number(
        item.ingredientProductId ??
        item.ingredient_product_id ??
        item.productId
      );

      const quantity = validateQuantity(item.quantity);

      if (
        !Number.isInteger(ingredientId) ||
        ingredientId <= 0 ||
        ingredientId === pid ||
        !db.prepare(`
          SELECT id
          FROM products
          WHERE id = ? AND is_active = 1
        `).get(ingredientId)
      ) {
        throw new Error("Invalid recipe ingredient.");
      }

      insert.run(pid, ingredientId, quantity);
    }
  });

  transaction();

  return listRecipes(pid);
}

function deleteRecipe(productId) {
  const pid = Number(productId);

  if (!Number.isInteger(pid) || pid <= 0) {
    throw new Error("Invalid product ID.");
  }

  const result = getDb().prepare(
    "DELETE FROM product_recipes WHERE product_id = ?"
  ).run(pid);

  return {
    productId: pid,
    deleted: result.changes > 0
  };
}

/* ======================================================
   INVENTORY ADJUSTMENTS
====================================================== */

function adjustStock(data) {
  if (!data) {
    throw new Error("Stock adjustment data is required.");
  }

  const db = getDb();

  const productId = Number(
    data.productId ?? data.product_id
  );

  if (!Number.isInteger(productId) || productId <= 0) {
    throw new Error("Invalid product ID.");
  }

  const quantity = validateQuantity(data.quantity);

  const type = String(
    data.type || data.adjustmentType || "stock_in"
  ).toLowerCase();

  if (
    !["stock_in", "stock_out", "wastage", "adjustment"].includes(type)
  ) {
    throw new Error("Invalid stock adjustment type.");
  }

  const cost = validateMoney(
    data.unitCostPaisa ?? data.unit_cost_paisa ?? 0,
    "Unit cost"
  );

  const transaction = db.transaction(() => {
    const product = db.prepare(
      "SELECT * FROM products WHERE id = ? AND is_active = 1"
    ).get(productId);

    if (!product) {
      throw new Error("Stock product not found or inactive.");
    }

    const delta = type === "stock_in" ? quantity : -quantity;

    const next = Number(product.stock_quantity) + delta;

    if (next < 0) {
      throw new Error(
        `Insufficient stock for ${product.name}.`
      );
    }

    db.prepare(`
      UPDATE products
      SET stock_quantity = ?,
          cost_paisa = CASE
            WHEN ? > 0 THEN ?
            ELSE cost_paisa
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(next, cost, cost, productId);

    db.prepare(`
      INSERT INTO stock_adjustments (
        product_id,
        adjustment_type,
        quantity,
        unit_cost_paisa,
        notes
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
      productId,
      type,
      quantity,
      cost,
      String(data.notes || "")
    );

    db.prepare(`
      INSERT INTO stock_movements (
        product_id,
        movement_type,
        quantity,
        reference_type,
        reference_id,
        notes
      )
      VALUES (?, ?, ?, 'adjustment', NULL, ?)
    `).run(
      productId,
      type,
      delta,
      String(data.notes || "Manual stock adjustment")
    );

    return {
      productId,
      previousQuantity: Number(product.stock_quantity),
      quantity: next,
      movement: delta
    };
  });

  return transaction();
}

function getStockMovements(limit = 500) {
  const requested = Number(limit);

  const safeLimit = Math.max(
    1,
    Math.min(5000, Number.isFinite(requested) ? requested : 500)
  );

  return getDb().prepare(`
    SELECT
      sm.*,
      p.name AS product_name,
      p.unit
    FROM stock_movements sm
    LEFT JOIN products p ON p.id = sm.product_id
    ORDER BY sm.id DESC
    LIMIT ?
  `).all(safeLimit);
}

/* ======================================================
   DASHBOARD
====================================================== */

function getDashboardSummary() {
  const db = getDb();

  const today = db.prepare(`
    SELECT
      COALESCE(SUM(total_paisa), 0) AS todaySales,
      COUNT(*) AS invoice_count
    FROM sales
    WHERE date(created_at, 'localtime') =
          date('now', 'localtime')
  `).get();

  const products = db.prepare(`
    SELECT COUNT(*) AS productCount
    FROM products
    WHERE is_active = 1
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

/* ======================================================
   ANALYTICS AND REPORTS
====================================================== */

function getAnalytics(startDate = null, endDate = null) {
  const db = getDb();

  const start = startDate
    ? String(startDate)
    : new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      ).toISOString().slice(0, 10);

  const end = endDate
    ? String(endDate)
    : new Date().toISOString().slice(0, 10);

  const sales = db.prepare(`
    SELECT
      date(created_at, 'localtime') AS day,
      COUNT(*) AS orders,
      SUM(total_paisa) AS revenue_paisa,
      SUM(discount_paisa) AS discount_paisa
    FROM sales
    WHERE date(created_at, 'localtime') BETWEEN ? AND ?
    GROUP BY day
    ORDER BY day
  `).all(start, end);

  const expenses = db.prepare(`
    SELECT
      date(COALESCE(expense_date, created_at), 'localtime') AS day,
      SUM(amount_paisa) AS expenses_paisa
    FROM expenses
    WHERE date(COALESCE(expense_date, created_at), 'localtime')
      BETWEEN ? AND ?
    GROUP BY day
    ORDER BY day
  `).all(start, end);

  const topProducts = db.prepare(`
    SELECT
      si.product_name AS name,
      SUM(si.quantity) AS quantity,
      SUM(si.line_total_paisa) AS revenue_paisa
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE date(s.created_at, 'localtime') BETWEEN ? AND ?
    GROUP BY si.product_name
    ORDER BY quantity DESC
    LIMIT 10
  `).all(start, end);

  const stock = db.prepare(`
    SELECT
      COUNT(*) AS product_count,
      COALESCE(
        SUM(stock_quantity * cost_paisa),
        0
      ) AS stock_value_paisa,
      SUM(
        CASE
          WHEN stock_quantity <= low_stock_alert THEN 1
          ELSE 0
        END
      ) AS low_stock_count
    FROM products
    WHERE is_active = 1
  `).get();

  const purchase = db.prepare(`
    SELECT
      COALESCE(SUM(total_paisa), 0) AS purchases_paisa
    FROM purchases
    WHERE date(created_at, 'localtime') BETWEEN ? AND ?
  `).get(start, end);

  const waste = db.prepare(`
    SELECT
      COALESCE(SUM(quantity), 0) AS wastage_quantity
    FROM stock_movements
    WHERE movement_type = 'wastage'
      AND date(created_at, 'localtime') BETWEEN ? AND ?
  `).get(start, end);

  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(total_paisa), 0) AS revenue_paisa,
      COALESCE(SUM(discount_paisa), 0) AS discount_paisa,
      COUNT(*) AS orders
    FROM sales
    WHERE date(created_at, 'localtime') BETWEEN ? AND ?
  `).get(start, end);

  const expenseTotals = db.prepare(`
    SELECT
      COALESCE(SUM(amount_paisa), 0) AS expenses_paisa
    FROM expenses
    WHERE date(COALESCE(expense_date, created_at), 'localtime')
      BETWEEN ? AND ?
  `).get(start, end);

  const cogs = db.prepare(`
    SELECT
      COALESCE(
        SUM(
          si.quantity *
          CASE
            WHEN si.item_type = 'deal' THEN
              COALESCE(
                (
                  SELECT SUM(
                    dc.quantity *
                    CASE
                      WHEN EXISTS (
                        SELECT 1
                        FROM product_recipes rr
                        WHERE rr.product_id = dc.product_id
                      )
                      THEN (
                        SELECT SUM(
                          r.quantity * ingredient.cost_paisa
                        )
                        FROM product_recipes r
                        JOIN products ingredient
                          ON ingredient.id = r.ingredient_product_id
                        WHERE r.product_id = dc.product_id
                      )
                      ELSE component.cost_paisa
                    END
                  )
                  FROM deal_components dc
                  JOIN products component
                    ON component.id = dc.product_id
                  WHERE dc.deal_id = si.deal_id
                ),
                0
              )

            WHEN EXISTS (
              SELECT 1
              FROM product_recipes rr
              WHERE rr.product_id = si.product_id
            )
            THEN COALESCE(
              (
                SELECT SUM(
                  r.quantity * ingredient.cost_paisa
                )
                FROM product_recipes r
                JOIN products ingredient
                  ON ingredient.id = r.ingredient_product_id
                WHERE r.product_id = si.product_id
              ),
              0
            )

            ELSE COALESCE(sold.cost_paisa, 0)
          END
        ),
        0
      ) AS cogs_paisa
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN products sold ON sold.id = si.product_id
    WHERE date(s.created_at, 'localtime') BETWEEN ? AND ?
  `).get(start, end);

  totals.expenses_paisa = Number(
    expenseTotals.expenses_paisa || 0
  );

  totals.estimated_cogs_paisa = Number(
    cogs.cogs_paisa || 0
  );

  totals.estimated_gross_profit_paisa =
    Number(totals.revenue_paisa || 0) -
    totals.estimated_cogs_paisa;

  totals.estimated_net_paisa =
    totals.estimated_gross_profit_paisa -
    totals.expenses_paisa;

  return {
    period: { start, end },
    totals,
    dailySales: sales,
    dailyExpenses: expenses,
    topProducts,
    inventory: stock,
    purchases: purchase,
    wastage: waste
  };
}

/* ======================================================
   DATABASE HEALTH
====================================================== */

function getDatabaseHealth() {
  const db = getDb();

  const integrity = db.pragma("integrity_check");
  const foreignKeys = db.pragma("foreign_key_check");
  const journal = db.pragma(
    "journal_mode",
    { simple: true }
  );

  return {
    ok:
      integrity.length === 1 &&
      integrity[0].integrity_check === "ok" &&
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

/* ======================================================
   BACKUP
====================================================== */

function createBackup() {
  const db = getDb();

  const directory = path.join(
    app.getPath("userData"),
    "backups"
  );

  fs.mkdirSync(directory, { recursive: true });

  const filename =
    `slicemaster-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;

  const destination = path.join(directory, filename);

  return db.backup(destination).then(() => ({
    success: true,
    path: destination,
    filename
  }));
}

/* ======================================================
   RESTORE BACKUP
====================================================== */

async function restoreBackup() {
  getDb();

  const directory = path.join(
    app.getPath("userData"),
    "backups"
  );

  if (!fs.existsSync(directory)) {
    throw new Error("Backup directory does not exist.");
  }

  const backups = fs.readdirSync(directory)
    .filter(name => name.endsWith(".sqlite"))
    .map(name => ({
      name,
      path: path.join(directory, name),
      time: fs.statSync(
        path.join(directory, name)
      ).mtimeMs
    }))
    .sort((a, b) => b.time - a.time);

  if (!backups.length) {
    throw new Error("No database backups found.");
  }

  const source = backups[0].path;
  const temporary = `${databasePath}.restore.tmp`;

  const validation = new Database(source, {
    readonly: true
  });

  try {
    const integrity = validation.pragma("integrity_check");
    const foreignKeys = validation.pragma("foreign_key_check");

    if (
      integrity.length !== 1 ||
      integrity[0].integrity_check !== "ok"
    ) {
      throw new Error(
        "Backup integrity validation failed."
      );
    }

    if (foreignKeys.length) {
      throw new Error(
        "Backup contains foreign-key errors."
      );
    }

    const version = validation.prepare(`
      SELECT value
      FROM schema_meta
      WHERE key = 'schema_version'
    `).get();

    if (
      !version ||
      Number(version.value) > SCHEMA_VERSION
    ) {
      throw new Error(
        "Unsupported backup database version."
      );
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

/* ======================================================
   APPLICATION INFORMATION
====================================================== */

function getAppInfo() {
  return {
    name: "SliceMaster POS ERP",
    version: app.getVersion(),
    platform: process.platform
  };
}

/* ======================================================
   EXPORTS
====================================================== */

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

  createExtendedSchema,

  listDeals,
  createDeal,
  updateDeal,
  deleteDeal,

  listRecipes,
  saveRecipe,
  deleteRecipe,

  adjustStock,
  getStockMovements,

  getAnalytics,

  getDashboardSummary,
  getSummary: getDashboardSummary,

  getDatabaseHealth,
  health: getDatabaseHealth,

  getAppInfo,

  createBackup,
  restoreBackup
};
