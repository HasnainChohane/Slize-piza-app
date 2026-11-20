
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, ShoppingCart, Package, Tags, Users, Truck,
  Receipt, BarChart3, Settings, Search, Plus, RefreshCw,
  Menu, X, Pizza, Wallet, Database, ShieldCheck, Trash2,
  Edit, Save, AlertTriangle, CheckCircle2, Download, Upload,
  Minus, Printer, TrendingUp, CircleDollarSign, ShoppingBag,
  Store, ChevronRight
} from "lucide-react";

/* =========================================================
   CONFIGURATION
========================================================= */

const DEFAULT_SETTINGS = {
  storeName: "SliceMaster Pizza",
  phone: "",
  whatsapp: "",
  address: "",
  email: "",
  taxPercent: "0",
  receiptFooter: "Thank you for visiting!",
  receiptMessage: "Please visit again.",
  showPhone: true,
  showAddress: true,
  showEmail: false
};

const money = value =>
  new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    minimumFractionDigits: 2
  }).format(Number(value || 0) / 100);

const number = value =>
  new Intl.NumberFormat("en-PK", {
    maximumFractionDigits: 3
  }).format(Number(value || 0));

const toPaisa = value => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Enter a valid non-negative amount.");
  }
  return Math.round(n * 100);
};

const getRows = data => {
  if (Array.isArray(data)) return data;
  return data?.records || data?.items || data?.sales || [];
};

const unwrap = response => {
  if (!response || typeof response.success !== "boolean") {
    throw new Error("Invalid Electron API response. Check preload.cjs and IPC handlers.");
  }
  if (!response.success) {
    throw new Error(response.error?.message || "Database operation failed.");
  }
  return response.data;
};

const formatDate = value => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
};

const getSaleTotal = sale =>
  Number(sale.total_paisa ?? sale.total ?? 0);

const getSalePaid = sale =>
  Number(sale.paid_paisa ?? sale.paid ?? getSaleTotal(sale));

const downloadCSV = (filename, rows) => {
  if (!rows.length) throw new Error("There is no data to export.");

  const headers = Object.keys(rows[0]);
  const escape = value =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csv = [
    headers.map(escape).join(","),
    ...rows.map(row => headers.map(key => escape(row[key])).join(","))
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

/* =========================================================
   ELECTRON API
========================================================= */

const api = {
  get desktop() {
    if (!window.desktop) {
      throw new Error("Electron API unavailable. Start the application through Electron.");
    }
    return window.desktop;
  },

  async call(owner, fn, ...args) {
    if (typeof fn !== "function") {
      throw new Error("An Electron API method is missing from preload.cjs.");
    }
    return unwrap(await fn.apply(owner, args));
  },

  info() {
    const d = this.desktop;
    return this.call(d.app, d.app.getInfo);
  },

  health() {
    const d = this.desktop;
    return this.call(d.database, d.database.health);
  },

  summary() {
    const d = this.desktop;
    return this.call(d.dashboard, d.dashboard.getSummary);
  },

  list(entity) {
    const d = this.desktop;
    return this.call(d.records, d.records.list, entity);
  },

  create(entity, data) {
    const d = this.desktop;
    return this.call(d.records, d.records.create, entity, data);
  },

  update(entity, id, data) {
    const d = this.desktop;
    return this.call(d.records, d.records.update, entity, id, data);
  },

  remove(entity, id) {
    const d = this.desktop;
    return this.call(d.records, d.records.delete, entity, id);
  },

  sales() {
    const d = this.desktop;
    return this.call(d.sales, d.sales.list);
  },

  createSale(data) {
    const d = this.desktop;
    return this.call(d.sales, d.sales.create, data);
  },

  createPurchase(data) {
    const d = this.desktop;
    return this.call(d.purchases, d.purchases.create, data);
  },

  backup() {
    const d = this.desktop;
    return this.call(d.backup, d.backup.create);
  },

  restore() {
    const d = this.desktop;
    return this.call(d.backup, d.backup.restore);
  }
};

/* =========================================================
   DATABASE ENTITY FIELDS
   These fields match db.cjs.
========================================================= */

const entityConfig = {
  products: {
    title: "Products",
    singular: "Product",
    icon: Package,
    fields: [
      { key: "name", label: "Product Name", required: true },
      { key: "sku", label: "SKU" },
      { key: "barcode", label: "Barcode" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "category_id", label: "Category", type: "category" },
      { key: "unit", label: "Unit", default: "pcs" },
      { key: "price_paisa", label: "Selling Price (PKR)", type: "money" },
      { key: "cost_paisa", label: "Cost Price (PKR)", type: "money" },
      { key: "stock_quantity", label: "Stock Quantity", type: "number" },
      { key: "low_stock_alert", label: "Low Stock Alert", type: "number" },
      { key: "is_active", label: "Active", type: "boolean", default: 1 }
    ]
  },

  categories: {
    title: "Categories",
    singular: "Category",
    icon: Tags,
    fields: [
      { key: "name", label: "Category Name", required: true },
      { key: "description", label: "Description", type: "textarea" }
    ]
  },

  customers: {
    title: "Customers",
    singular: "Customer",
    icon: Users,
    fields: [
      { key: "name", label: "Customer Name", required: true },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" }
    ]
  },

  suppliers: {
    title: "Suppliers",
    singular: "Supplier",
    icon: Truck,
    fields: [
      { key: "name", label: "Supplier Name", required: true },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "address", label: "Address", type: "textarea" },
      { key: "notes", label: "Notes", type: "textarea" }
    ]
  },

  expenses: {
    title: "Expenses",
    singular: "Expense",
    icon: Wallet,
    fields: [
      { key: "title", label: "Expense Title", required: true },
      { key: "category", label: "Category" },
      { key: "amount_paisa", label: "Amount (PKR)", type: "money", required: true },
      {
        key: "payment_method",
        label: "Payment Method",
        type: "select",
        options: ["cash", "card", "bank", "other"],
        default: "cash"
      },
      { key: "notes", label: "Notes", type: "textarea" },
      { key: "expense_date", label: "Expense Date", type: "date" }
    ]
  }
};

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "pos", label: "Point of Sale", icon: ShoppingCart },
  { id: "products", label: "Products", icon: Package },
  { id: "categories", label: "Categories", icon: Tags },
  { id: "customers", label: "Customers", icon: Users },
  { id: "suppliers", label: "Suppliers", icon: Truck },
  { id: "purchases", label: "Purchases", icon: ShoppingBag },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "sales", label: "Sales History", icon: Receipt },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings }
];

/* =========================================================
   STYLES
========================================================= */

const styles = `
*{box-sizing:border-box}
body{margin:0;background:#f5f5f2;color:#252820;font-family:Inter,Segoe UI,Arial,sans-serif}
button,input,select,textarea{font:inherit}
button{cursor:pointer}
button:disabled{opacity:.55;cursor:not-allowed}
.app{display:flex;min-height:100vh}
.sidebar{width:245px;background:#20251f;color:#fff;display:flex;flex-direction:column;padding:22px 14px;flex-shrink:0}
.brand{display:flex;align-items:center;gap:12px;padding:4px 9px 28px}
.brand-icon{background:#d5a85c;color:#20251f;width:42px;height:42px;border-radius:13px;display:grid;place-items:center}
.brand-name{font-size:18px;font-weight:800}
.brand-sub{font-size:10px;color:#aeb6a9;margin-top:3px;letter-spacing:1.3px}
.nav-label{font-size:10px;color:#899287;font-weight:700;letter-spacing:1.5px;padding:10px 12px}
.nav-item{width:100%;border:0;background:transparent;color:#c4cabe;padding:12px;border-radius:9px;display:flex;align-items:center;gap:12px;text-align:left;margin:2px 0;font-size:13px}
.nav-item:hover,.nav-item.active{background:#343c32;color:#f1c77d}
.sidebar-bottom{margin-top:auto;border-top:1px solid #3a4138;padding:18px 8px 0;color:#aeb6a9;font-size:11px}
.main{min-width:0;flex:1}
.topbar{height:72px;background:#fff;border-bottom:1px solid #e8e9e3;display:flex;align-items:center;justify-content:space-between;padding:0 30px}
.top-title{font-size:18px;font-weight:750}
.top-sub{font-size:11px;color:#8b9187;margin-top:4px}
.top-actions{display:flex;align-items:center;gap:10px}
.content{padding:28px 30px;max-width:1600px;margin:auto}
.page-head{display:flex;justify-content:space-between;align-items:center;gap:15px;margin-bottom:23px}
.page-head h2{font-size:21px;margin:0 0 6px}
.page-head p{margin:0;color:#858b80;font-size:12px}
.btn{border:1px solid #dedfd8;background:#fff;border-radius:8px;padding:10px 14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;font-size:12px;font-weight:650;color:#353b32}
.btn:hover{background:#f5f5f0}
.btn.primary{background:#293329;border-color:#293329;color:white}
.btn.primary:hover{background:#3a4838}
.btn.danger{color:#b7473e}
.btn.small{padding:7px 9px;font-size:11px}
.icon-btn{border:0;background:transparent;color:#73796e;padding:7px;border-radius:7px}
.icon-btn:hover{background:#efefe9}
.grid{display:grid;gap:15px}
.stats{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:20px}
.stat{background:#fff;border:1px solid #e8e9e3;border-radius:12px;padding:18px}
.stat-top{display:flex;justify-content:space-between;align-items:center;color:#777e73;font-size:11px}
.stat-icon{width:34px;height:34px;background:#f4f0e7;color:#a77d3d;border-radius:9px;display:grid;place-items:center}
.stat-value{font-size:23px;font-weight:800;margin-top:14px}
.stat-foot{font-size:10px;color:#92988e;margin-top:5px}
.panel{background:#fff;border:1px solid #e8e9e3;border-radius:12px;padding:18px;margin-bottom:16px;min-width:0}
.panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:10px}
.panel-title{font-size:14px;font-weight:750}
.panel-sub{font-size:11px;color:#92988e;margin-top:4px}
.toolbar{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-bottom:15px}
.search{position:relative;flex:1;min-width:180px}
.search input{padding-left:34px}
.search svg{position:absolute;left:11px;top:11px;color:#93998e}
input,select,textarea{width:100%;border:1px solid #dedfd8;background:#fff;border-radius:7px;padding:10px 11px;font-size:12px;color:#30372e;outline:none}
input:focus,select:focus,textarea:focus{border-color:#a98a54;box-shadow:0 0 0 2px #a98a541c}
textarea{min-height:76px;resize:vertical}
.field{display:flex;flex-direction:column;gap:6px;margin-bottom:13px}
.field label{font-size:11px;font-weight:650;color:#5c6358}
.table-wrap{overflow:auto}
table{width:100%;border-collapse:collapse;white-space:nowrap}
th{text-align:left;padding:11px 10px;background:#f8f8f5;color:#858b80;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:12px 10px;border-bottom:1px solid #eff0eb;font-size:12px;color:#454b42}
tr:last-child td{border-bottom:0}
.empty{text-align:center;padding:35px 10px;color:#999f94;font-size:12px}
.badge{display:inline-flex;padding:5px 8px;border-radius:20px;font-size:10px;font-weight:700;background:#edf1e9;color:#53704b}
.badge.red{background:#f8eae7;color:#b34c41}
.actions{display:flex;gap:4px}
.modal-backdrop{position:fixed;inset:0;background:#1016108a;z-index:30;display:grid;place-items:center;padding:15px}
.modal{width:min(650px,100%);max-height:90vh;overflow:auto;background:white;border-radius:14px;padding:22px}
.modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
.modal-head h3{margin:0;font-size:17px}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.modal-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
.notice{padding:12px 14px;border-radius:9px;background:#f5f1e7;color:#826b3e;font-size:11px;margin-bottom:15px}
.error{padding:11px 13px;background:#f9eae7;color:#a83f36;border-radius:8px;font-size:12px;margin-bottom:14px}
.success{padding:11px 13px;background:#eaf2e8;color:#426b3c;border-radius:8px;font-size:12px;margin-bottom:14px}
.pos-layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:17px;align-items:start}
.product-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
.product-card{border:1px solid #e6e7df;border-radius:10px;padding:13px;background:#fff;text-align:left;color:#30372e}
.product-card:hover{border-color:#c3a36c;background:#fcfaf5}
.product-card h4{font-size:12px;margin:0 0 8px}
.product-card p{font-size:10px;color:#92988e;margin:0 0 12px}
.product-price{font-size:14px;font-weight:800;color:#9a7135}
.cart-line{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid #eff0eb}
.cart-line-name{font-size:11px;font-weight:700}
.cart-line-sub{font-size:10px;color:#91978c;margin-top:4px}
.qty-control{display:flex;align-items:center;gap:8px;margin-top:7px}
.qty-control button{border:1px solid #e0e1da;background:#fff;border-radius:5px;width:24px;height:24px;display:grid;place-items:center}
.total-row{display:flex;justify-content:space-between;padding:7px 0;font-size:12px;color:#62695e}
.total-row.grand{font-size:16px;font-weight:800;color:#293329;border-top:1px solid #e7e8e1;margin-top:8px;padding-top:14px}
.quick-actions{display:flex;gap:8px;flex-wrap:wrap}
.report-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
.health-row{display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #eee;font-size:12px;gap:10px}
.mobile-menu{display:none}
.toast{position:fixed;right:22px;bottom:22px;z-index:60;background:#293329;color:white;padding:13px 18px;border-radius:9px;font-size:12px;max-width:min(420px,90vw)}
.setting-check{display:flex;align-items:center;gap:9px;font-size:12px;margin:8px 0}
.setting-check input{width:auto}
.print-only{display:none}
@media(max-width:1050px){.stats{grid-template-columns:repeat(2,1fr)}.pos-layout{grid-template-columns:1fr}}
@media(max-width:760px){.sidebar{position:fixed;z-index:25;left:-260px;top:0;bottom:0;transition:.2s}.sidebar.open{left:0}.mobile-menu{display:inline-flex}.topbar{padding:0 15px}.content{padding:20px 14px}.stats{grid-template-columns:1fr 1fr}.product-grid{grid-template-columns:repeat(2,1fr)}.form-grid,.report-grid{grid-template-columns:1fr}.page-head{align-items:flex-start;flex-direction:column}}
@media(max-width:420px){.stats{grid-template-columns:1fr}.product-grid{grid-template-columns:1fr}}
@media print{
  html,body{width:80mm!important;margin:0!important;padding:0!important;background:#fff!important}
  body *{visibility:hidden!important}
  .print-only,.print-only *{visibility:visible!important}
  .print-only{display:block!important;position:absolute!important;left:0!important;top:0!important;width:80mm!important;margin:0!important;padding:0!important}
  @page{size:80mm auto;margin:0}
}
`;

/* =========================================================
   MAIN APPLICATION
========================================================= */

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");

  const [records, setRecords] = useState({});
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState({});
  const [health, setHealth] = useState(null);
  const [appInfo, setAppInfo] = useState(null);

  const [modal, setModal] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState("0");
  const [received, setReceived] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [posSearch, setPosSearch] = useState("");
  const [printData, setPrintData] = useState(null);

  const [purchaseProduct, setPurchaseProduct] = useState("");
  const [purchaseQty, setPurchaseQty] = useState("1");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [purchasePaid, setPurchasePaid] = useState("");
  const [purchaseSupplier, setPurchaseSupplier] = useState("");

  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");

  const notify = useCallback(message => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
  }, []);

  const run = useCallback(async callback => {
    setLoading(true);
    setError("");
    try {
      return await callback();
    } catch (e) {
      setError(e?.message || "Something went wrong.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /* ------------------ Store settings ------------------ */

  useEffect(() => {
    try {
      const saved = localStorage.getItem("SLICEMASTER_STORE_SETTINGS_V1");
      if (saved) setSettings(old => ({ ...old, ...JSON.parse(saved) }));
    } catch {
      setError("Saved store settings could not be loaded.");
    }
  }, []);

  const updateSetting = (key, value) => {
    setSettings(old => ({ ...old, [key]: value }));
  };

  const saveSettings = () => {
    try {
      if (!settings.storeName.trim()) {
        throw new Error("Store name is required.");
      }
      const tax = Number(settings.taxPercent);
      if (!Number.isFinite(tax) || tax < 0 || tax > 100) {
        throw new Error("Tax must be between 0 and 100.");
      }
      localStorage.setItem(
        "SLICEMASTER_STORE_SETTINGS_V1",
        JSON.stringify(settings)
      );
      notify("Store settings saved on this device.");
    } catch (e) {
      setError(e.message);
    }
  };

  /* ------------------ Data loading ------------------ */

  const loadEntity = useCallback(async entity => {
    const data = await api.list(entity);
    const rows = getRows(data);
    setRecords(old => ({ ...old, [entity]: rows }));
    return rows;
  }, []);

  const loadSales = useCallback(async () => {
    const data = await api.sales();
    const rows = getRows(data);
    setSales(rows);
    return rows;
  }, []);

  const refreshAll = useCallback(async () => {
    await run(async () => {
      const [nextSummary, nextHealth, nextInfo] = await Promise.all([
        api.summary(),
        api.health(),
        api.info()
      ]);

      setSummary(nextSummary || {});
      setHealth(nextHealth);
      setAppInfo(nextInfo);

      await Promise.all([
        loadSales(),
        ...Object.keys(entityConfig).map(loadEntity)
      ]);

      notify("Data refreshed.");
    });
  }, [loadEntity, loadSales, notify, run]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const products = records.products || [];
  const categories = records.categories || [];
  const customers = records.customers || [];
  const suppliers = records.suppliers || [];
  const expenses = records.expenses || [];

  const activeProducts = products.filter(
    product => Number(product.is_active ?? 1) === 1
  );

  /* ------------------ POS calculations ------------------ */

  const cartTotal = cart.reduce(
    (sum, item) =>
      sum + Math.round(Number(item.price_paisa || 0) * Number(item.quantity || 0)),
    0
  );

  const discountPaisa = Math.min(
    cartTotal,
    Math.max(0, Number.isFinite(Number(discount))
      ? Math.round(Number(discount || 0) * 100)
      : 0)
  );

  const taxRate = Number(settings.taxPercent || 0);
  const taxableAmount = Math.max(0, cartTotal - discountPaisa);
  const taxPaisa = Math.round(taxableAmount * taxRate / 100);
  const finalTotal = taxableAmount + taxPaisa;

  const receivedPaisa = Math.max(
    0,
    Number.isFinite(Number(received))
      ? Math.round(Number(received || 0) * 100)
      : 0
  );

  const changePaisa = Math.max(0, receivedPaisa - finalTotal);

  /* ------------------ Search ------------------ */

  const filteredRecords = useMemo(() => {
    if (!entityConfig[page]) return [];
    const rows = records[page] || [];
    const query = search.toLowerCase().trim();
    if (!query) return rows;

    return rows.filter(row =>
      Object.values(row).some(value =>
        String(value ?? "").toLowerCase().includes(query)
      )
    );
  }, [page, records, search]);

  /* ------------------ CRUD ------------------ */

  const openCreate = entity => {
    setEditing(null);
    const initial = {};
    entityConfig[entity].fields.forEach(field => {
      initial[field.key] = field.default ?? "";
    });
    setForm(initial);
    setModal({ type: "entity", entity });
  };

  const openEdit = (entity, row) => {
    setEditing(row);
    const values = {};

    entityConfig[entity].fields.forEach(field => {
      let value = row[field.key] ?? field.default ?? "";

      if (["price_paisa", "cost_paisa", "amount_paisa"].includes(field.key)) {
        value = Number(value || 0) / 100;
      }

      if (field.key === "category_id") {
        value = value == null ? "" : String(value);
      }

      values[field.key] = value;
    });

    setForm(values);
    setModal({ type: "entity", entity });
  };

  const saveEntity = () => run(async () => {
    if (!modal?.entity) return;

    const entity = modal.entity;
    const config = entityConfig[entity];
    const payload = {};

    for (const field of config.fields) {
      const value = form[field.key];

      if (field.required && (value === "" || value === null || value === undefined)) {
        throw new Error(`${field.label} is required.`);
      }

      if (field.key === "category_id") {
        if (!value) {
          payload.category_id = null;
        } else {
          const id = Number(value);
          if (!Number.isInteger(id) || !categories.some(c => Number(c.id) === id)) {
            throw new Error("Select a valid category.");
          }
          payload.category_id = id;
        }
        continue;
      }

      if (field.type === "money" || field.type === "number") {
        const n = value === "" ? 0 : Number(value);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`${field.label} must be a non-negative number.`);
        }

        payload[field.key] = field.type === "money"
          ? toPaisa(n)
          : n;
      } else if (field.type === "boolean") {
        payload[field.key] = Number(value) ? 1 : 0;
      } else {
        payload[field.key] = value === "" ? null : value;
      }
    }

    if (editing) {
      await api.update(entity, editing.id, payload);
      notify(`${config.singular} updated.`);
    } else {
      await api.create(entity, payload);
      notify(`${config.singular} created.`);
    }

    setModal(null);
    setEditing(null);
    await loadEntity(entity);
    setSummary(await api.summary());
  });

  const deleteEntity = async (entity, row) => {
    if (!window.confirm(`Delete ${row.name || row.title || "this record"}?`)) return;

    await run(async () => {
      await api.remove(entity, row.id);
      await loadEntity(entity);
      setSummary(await api.summary());
      notify("Record deleted.");
    });
  };

  /* ------------------ POS cart ------------------ */

  const addToCart = product => {
    if (Number(product.stock_quantity || 0) <= 0) {
      notify("This product is out of stock.");
      return;
    }

    if (Number(product.price_paisa || 0) <= 0) {
      notify("This product has no selling price.");
      return;
    }

    const existing = cart.find(item => Number(item.id) === Number(product.id));
    const nextQuantity = Number(existing?.quantity || 0) + 1;

    if (nextQuantity > Number(product.stock_quantity || 0)) {
      notify("Insufficient stock.");
      return;
    }

    setCart(old => {
      const found = old.find(item => Number(item.id) === Number(product.id));

      if (found) {
        return old.map(item =>
          Number(item.id) === Number(product.id)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...old, { ...product, quantity: 1 }];
    });
  };

  const changeQuantity = (id, delta) => {
    setCart(old =>
      old.map(item => {
        if (Number(item.id) !== Number(id)) return item;

        const quantity = item.quantity + delta;
        if (quantity > Number(item.stock_quantity || 0)) {
          notify("Insufficient stock.");
          return item;
        }
        return { ...item, quantity };
      }).filter(item => item.quantity > 0)
    );
  };

  /* ------------------ Printing ------------------ */

  useEffect(() => {
    if (!printData) return;
    const timer = window.setTimeout(() => window.print(), 500);
    return () => window.clearTimeout(timer);
  }, [printData]);

  const printBill = bill => {
    if (!bill?.items?.length) {
      notify("This sale does not contain printable item details.");
      return;
    }
    setPrintData(bill);
  };

  /* ------------------ Checkout ------------------ */

  const checkout = () => run(async () => {
    if (!cart.length) throw new Error("Your cart is empty.");
    if (receivedPaisa < finalTotal) {
      throw new Error("Received amount is less than the total.");
    }
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) {
      throw new Error("Invalid tax setting. Check Settings.");
    }

    const selectedCustomer = customerId
      ? customers.find(c => Number(c.id) === Number(customerId))
      : null;

    if (customerId && !selectedCustomer) {
      throw new Error("Selected customer no longer exists.");
    }

    const receipt = {
      sale: null,
      items: cart.map(item => ({
        ...item,
        price_paisa: Number(item.price_paisa || 0),
        quantity: Number(item.quantity || 0)
      })),
      subtotalPaisa: cartTotal,
      discountPaisa,
      taxPaisa,
      totalPaisa: finalTotal,
      receivedPaisa,
      changePaisa,
      customerName: selectedCustomer?.name || "Walk-in Customer",
      paymentMethod
    };

    const result = await api.createSale({
      items: cart.map(item => ({
        productId: Number(item.id),
        quantity: Number(item.quantity)
      })),
      discountPaisa,
      taxPaisa,
      paidPaisa: finalTotal,
      paymentMethod,
      customerId: selectedCustomer ? Number(selectedCustomer.id) : null
    });

    receipt.sale = result || {};
    setPrintData(receipt);

    setCart([]);
    setDiscount("0");
    setReceived("");
    setCustomerId("");

    await Promise.all([
      loadEntity("products"),
      loadSales(),
      api.summary().then(setSummary)
    ]);

    notify("Sale completed. Preparing receipt.");
  });

  /* ------------------ Purchases ------------------ */

  const purchaseTotal = Math.round(
    Math.max(0, Number(purchaseQty || 0)) *
    Math.max(0, Number(purchaseCost || 0)) * 100
  );

  const purchasePaidPaisa = (() => {
    const value = Number(purchasePaid || 0);
    return Number.isFinite(value) && value > 0
      ? Math.round(value * 100)
      : 0;
  })();

  const submitPurchase = () => run(async () => {
    if (!purchaseProduct) throw new Error("Select a product.");

    const product = products.find(p => Number(p.id) === Number(purchaseProduct));
    if (!product) throw new Error("Selected product does not exist.");

    const quantity = Number(purchaseQty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error("Enter a valid purchase quantity.");
    }

    const unitCostPaisa = toPaisa(purchaseCost || 0);
    const totalPaisa = Math.round(quantity * unitCostPaisa);

    if (purchasePaidPaisa > totalPaisa) {
      throw new Error("Amount paid cannot exceed purchase total.");
    }

    const selectedSupplier = purchaseSupplier
      ? suppliers.find(s => Number(s.id) === Number(purchaseSupplier))
      : null;

    if (purchaseSupplier && !selectedSupplier) {
      throw new Error("Selected supplier does not exist.");
    }

    await api.createPurchase({
      items: [{
        productId: Number(product.id),
        quantity,
        unitCostPaisa
      }],
      supplierId: selectedSupplier ? Number(selectedSupplier.id) : null,
      discountPaisa: 0,
      paidPaisa: purchasePaidPaisa,
      paymentMethod: "cash"
    });

    setPurchaseProduct("");
    setPurchaseQty("1");
    setPurchaseCost("");
    setPurchasePaid("");
    setPurchaseSupplier("");

    await Promise.all([
      loadEntity("products"),
      api.summary().then(setSummary)
    ]);

    notify("Purchase saved and stock updated.");
  });

  /* ------------------ Backup / Restore ------------------ */

  const handleBackup = () => run(async () => {
    const result = await api.backup();
    notify(result?.path ? `Backup created: ${result.path}` : "Backup created.");
  });

  const handleRestore = () => {
    if (!window.confirm("Restore a database backup? Current data may be replaced.")) return;

    run(async () => {
      await api.restore();
      const [nextSummary, nextHealth, nextInfo] = await Promise.all([
        api.summary(),
        api.health(),
        api.info()
      ]);

      setSummary(nextSummary || {});
      setHealth(nextHealth);
      setAppInfo(nextInfo);

      await Promise.all([
        loadSales(),
        ...Object.keys(entityConfig).map(loadEntity)
      ]);

      notify("Database restored.");
    });
  };

  /* ------------------ Reports ------------------ */

  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      const rawDate = sale.created_at || sale.createdAt;
      if (!rawDate) return !reportStart && !reportEnd;

      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return true;

      const dateKey = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
      ].join("-");

      if (reportStart && dateKey < reportStart) return false;
      if (reportEnd && dateKey > reportEnd) return false;
      return true;
    });
  }, [sales, reportStart, reportEnd]);

  const totalSales = filteredSales.reduce(
    (sum, sale) => sum + getSaleTotal(sale), 0
  );

  const totalPaid = filteredSales.reduce(
    (sum, sale) => sum + getSalePaid(sale), 0
  );

  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount_paisa || 0), 0
  );

  const exportSales = () => {
    try {
      downloadCSV("slicemaster-sales.csv", filteredSales.map(sale => ({
        invoice: sale.invoice_number || sale.invoice_no || sale.id,
        date: sale.created_at || "",
        customer: sale.customer_name || "Walk-in",
        total_paisa: getSaleTotal(sale),
        paid_paisa: getSalePaid(sale),
        payment_method: sale.payment_method || "cash"
      })));
      notify("Sales CSV exported.");
    } catch (e) {
      setError(e.message);
    }
  };

  const exportProducts = () => {
    try {
      downloadCSV("slicemaster-inventory.csv", products.map(product => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        stock_quantity: product.stock_quantity,
        low_stock_alert: product.low_stock_alert,
        unit: product.unit,
        selling_price_paisa: product.price_paisa,
        cost_price_paisa: product.cost_paisa
      })));
      notify("Inventory CSV exported.");
    } catch (e) {
      setError(e.message);
    }
  };

  /* ------------------ Dashboard calculations ------------------ */

  const lowStockProducts = products.filter(product =>
    Number(product.stock_quantity || 0) <= Number(product.low_stock_alert || 0)
  );

  const statValue = (...keys) => {
    for (const key of keys) {
      if (summary[key] !== undefined && summary[key] !== null) {
        return summary[key];
      }
    }
    return 0;
  };

  const renderStats = () => {
    const cards = [
      {
        label: "Today's Sales",
        value: money(statValue("todaySales", "today_sales", "sales_paisa")),
        icon: CircleDollarSign,
        foot: "Sales recorded today"
      },
      {
        label: "Total Orders",
        value: number(statValue("invoice_count", "todayOrders", "totalOrders")),
        icon: Receipt,
        foot: "Recorded invoices"
      },
      {
        label: "Products",
        value: number(statValue("productCount", "product_count") || products.length),
        icon: Package,
        foot: "Inventory records"
      },
      {
        label: "Low Stock",
        value: number(lowStockProducts.length),
        icon: AlertTriangle,
        foot: "Items needing attention"
      }
    ];

    return (
      <div className="grid stats">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div className="stat" key={index}>
              <div className="stat-top">
                {card.label}
                <div className="stat-icon"><Icon size={17} /></div>
              </div>
              <div className="stat-value">{card.value}</div>
              <div className="stat-foot">{card.foot}</div>
            </div>
          );
        })}
      </div>
    );
  };

  /* ------------------ Dashboard ------------------ */

  const renderDashboard = () => (
    <>
      <div className="page-head">
        <div>
          <h2>Business Overview</h2>
          <p>Monitor your shop's daily operations.</p>
        </div>
        <button className="btn" disabled={loading} onClick={refreshAll}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {renderStats()}

      <div className="grid report-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Recent Sales</div>
              <div className="panel-sub">Latest transactions</div>
            </div>
            <button className="btn small" onClick={() => setPage("sales")}>
              View all <ChevronRight size={13} />
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Invoice</th><th>Date</th><th>Total</th><th>Payment</th></tr>
              </thead>
              <tbody>
                {sales.slice(0, 6).map((sale, index) => (
                  <tr key={sale.id || index}>
                    <td>{sale.invoice_number || sale.invoice_no || `#${sale.id}`}</td>
                    <td>{formatDate(sale.created_at)}</td>
                    <td>{money(getSaleTotal(sale))}</td>
                    <td><span className="badge">{sale.payment_method || "cash"}</span></td>
                  </tr>
                ))}
                {!sales.length && (
                  <tr><td colSpan="4" className="empty">No sales recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Inventory Alerts</div>
              <div className="panel-sub">Items at or below low-stock level</div>
            </div>
            <Package size={17} color="#a77d3d" />
          </div>

          {lowStockProducts.slice(0, 8).map(product => (
            <div className="health-row" key={product.id}>
              <span>{product.name}</span>
              <span className="badge red">
                {number(product.stock_quantity)} {product.unit || "pcs"}
              </span>
            </div>
          ))}

          {!lowStockProducts.length && (
            <div className="empty">No low-stock products.</div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Quick Actions</div>
        <div className="quick-actions" style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={() => setPage("pos")}>
            <ShoppingCart size={14} /> New Sale
          </button>
          <button className="btn" onClick={() => openCreate("products")}>
            <Plus size={14} /> Add Product
          </button>
          <button className="btn" onClick={() => setPage("purchases")}>
            <ShoppingBag size={14} /> New Purchase
          </button>
          <button className="btn" onClick={() => openCreate("expenses")}>
            <Wallet size={14} /> Add Expense
          </button>
          <button className="btn" onClick={() => setPage("settings")}>
            <Settings size={14} /> Store Settings
          </button>
        </div>
      </div>
    </>
  );

  /* ------------------ Entity pages ------------------ */

  const renderEntity = entity => {
    const config = entityConfig[entity];
    const Icon = config.icon;

    return (
      <>
        <div className="page-head">
          <div>
            <h2>{config.title}</h2>
            <p>Manage your {config.title.toLowerCase()} records.</p>
          </div>
          <div className="quick-actions">
            {entity === "products" && (
              <button className="btn" onClick={exportProducts}>
                <Download size={14} /> Export CSV
              </button>
            )}
            <button className="btn primary" onClick={() => openCreate(entity)}>
              <Plus size={14} /> Add {config.singular}
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="toolbar">
            <div className="search">
              <Search size={14} />
              <input
                placeholder={`Search ${config.title.toLowerCase()}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <button className="btn" onClick={() => run(() => loadEntity(entity))}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  {config.fields.slice(0, 7).map(field => (
                    <th key={field.key}>{field.label}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map(row => (
                  <tr key={row.id}>
                    <td>#{row.id}</td>
                    {config.fields.slice(0, 7).map(field => {
                      let value = row[field.key];

                      if (["price_paisa", "cost_paisa", "amount_paisa"].includes(field.key)) {
                        value = money(value);
                      }

                      if (field.key === "is_active") {
                        value = Number(value) ? "Active" : "Inactive";
                      }

                      if (field.key === "category_id") {
                        value = categories.find(
                          category => Number(category.id) === Number(value)
                        )?.name || "Uncategorized";
                      }

                      return <td key={field.key}>{String(value ?? "—")}</td>;
                    })}
                    <td>
                      <div className="actions">
                        <button className="icon-btn" title="Edit" onClick={() => openEdit(entity, row)}>
                          <Edit size={14} />
                        </button>
                        <button className="icon-btn" title="Delete" onClick={() => deleteEntity(entity, row)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredRecords.length && (
                  <tr>
                    <td colSpan="9" className="empty">
                      <Icon size={24} style={{ marginBottom: 8, opacity: .4 }} />
                      <div>No {config.title.toLowerCase()} found.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  /* ------------------ POS ------------------ */

  const renderPOS = () => {
    const visibleProducts = activeProducts.filter(product => {
      const query = posSearch.toLowerCase().trim();
      return !query ||
        String(product.name || "").toLowerCase().includes(query) ||
        String(product.sku || "").toLowerCase().includes(query) ||
        String(product.barcode || "").toLowerCase().includes(query);
    });

    return (
      <>
        <div className="page-head">
          <div>
            <h2>Point of Sale</h2>
            <p>Create orders and process customer payments.</p>
          </div>
          <button className="btn" onClick={() => run(() => loadEntity("products"))}>
            <RefreshCw size={14} /> Refresh Products
          </button>
        </div>

        <div className="pos-layout">
          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Select Products</div>
                <div className="panel-sub">Search by name, SKU or barcode.</div>
              </div>
              <span className="badge">{visibleProducts.length} products</span>
            </div>

            <div className="toolbar">
              <div className="search">
                <Search size={14} />
                <input
                  placeholder="Search products or scan barcode..."
                  value={posSearch}
                  onChange={e => setPosSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="product-grid">
              {visibleProducts.map(product => (
                <button
                  className="product-card"
                  key={product.id}
                  disabled={Number(product.stock_quantity || 0) <= 0}
                  onClick={() => addToCart(product)}
                >
                  <h4>{product.name}</h4>
                  <p>{product.sku || product.barcode || product.unit || "Product"}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="product-price">{money(product.price_paisa)}</span>
                    <span className={`badge ${Number(product.stock_quantity || 0) <= 0 ? "red" : ""}`}>
                      {number(product.stock_quantity)} left
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {!visibleProducts.length && (
              <div className="empty">No matching products found.</div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Current Order</div>
                <div className="panel-sub">
                  {cart.reduce((sum, item) => sum + item.quantity, 0)} total items
                </div>
              </div>
              <button className="icon-btn" title="Clear cart" onClick={() => {
                if (window.confirm("Clear the current cart?")) setCart([]);
              }}>
                <Trash2 size={15} />
              </button>
            </div>

            {cart.map(item => (
              <div className="cart-line" key={item.id}>
                <div style={{ flex: 1 }}>
                  <div className="cart-line-name">{item.name}</div>
                  <div className="cart-line-sub">{money(item.price_paisa)} each</div>
                  <div className="qty-control">
                    <button onClick={() => changeQuantity(item.id, -1)}>
                      <Minus size={11} />
                    </button>
                    <span style={{ fontSize: 11 }}>{item.quantity}</span>
                    <button onClick={() => changeQuantity(item.id, 1)}>
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
                <strong style={{ fontSize: 11 }}>
                  {money(Number(item.price_paisa || 0) * item.quantity)}
                </strong>
              </div>
            ))}

            {!cart.length && <div className="empty">Your cart is empty.</div>}

            <div style={{ marginTop: 15 }}>
              <div className="field">
                <label>Customer</label>
                <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">Walk-in Customer</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}{customer.phone ? ` — ${customer.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label>Discount (PKR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                />
              </div>

              <div className="total-row">
                <span>Subtotal</span><strong>{money(cartTotal)}</strong>
              </div>
              <div className="total-row">
                <span>Discount</span><strong>-{money(discountPaisa)}</strong>
              </div>
              <div className="total-row">
                <span>Tax ({taxRate}%)</span><strong>{money(taxPaisa)}</strong>
              </div>
              <div className="total-row grand">
                <span>Total</span><span>{money(finalTotal)}</span>
              </div>

              <div className="field" style={{ marginTop: 14 }}>
                <label>Payment Method</label>
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="field">
                <label>Received Amount (PKR)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={received}
                  onChange={e => setReceived(e.target.value)}
                  placeholder="Enter received amount"
                />
              </div>

              <div className="total-row">
                <span>Change</span><strong>{money(changePaisa)}</strong>
              </div>

              <button
                className="btn primary"
                style={{ width: "100%", marginTop: 12 }}
                disabled={!cart.length || loading || receivedPaisa < finalTotal}
                onClick={checkout}
              >
                <CheckCircle2 size={15} /> Complete Sale
              </button>

              {printData && (
                <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => printBill(printData)}>
                  <Printer size={15} /> Print Last Bill
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  /* ------------------ Purchases ------------------ */

  const renderPurchases = () => (
    <>
      <div className="page-head">
        <div>
          <h2>Purchases</h2>
          <p>Receive inventory from suppliers.</p>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 720 }}>
        <div className="panel-head">
          <div>
            <div className="panel-title">Create Purchase</div>
            <div className="panel-sub">Stock is added when the purchase is saved.</div>
          </div>
          <ShoppingBag size={18} color="#a77d3d" />
        </div>

        <div className="field">
          <label>Supplier</label>
          <select value={purchaseSupplier} onChange={e => setPurchaseSupplier(e.target.value)}>
            <option value="">Select Supplier (optional)</option>
            {suppliers.map(supplier => (
              <option value={supplier.id} key={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Product</label>
          <select value={purchaseProduct} onChange={e => setPurchaseProduct(e.target.value)}>
            <option value="">Select Product</option>
            {activeProducts.map(product => (
              <option value={product.id} key={product.id}>
                {product.name} — {number(product.stock_quantity)} {product.unit || ""}
              </option>
            ))}
          </select>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Quantity</label>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={purchaseQty}
              onChange={e => setPurchaseQty(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Unit Cost (PKR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchaseCost}
              onChange={e => setPurchaseCost(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Amount Paid (PKR)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchasePaid}
              onChange={e => setPurchasePaid(e.target.value)}
            />
          </div>
        </div>

        <div className="total-row grand">
          <span>Purchase Total</span><strong>{money(purchaseTotal)}</strong>
        </div>
        <div className="total-row">
          <span>Remaining Payable</span>
          <strong>{money(Math.max(0, purchaseTotal - purchasePaidPaisa))}</strong>
        </div>

        <button className="btn primary" disabled={loading} onClick={submitPurchase}>
          <Save size={14} /> Save Purchase
        </button>
      </div>

      <div className="panel">
        <div className="panel-title">Current Inventory</div>
        <div className="panel-sub" style={{ marginBottom: 14 }}>
          Current stock levels from the database.
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Product</th><th>Stock</th><th>Unit</th><th>Cost</th><th>Stock Alert</th></tr>
            </thead>
            <tbody>
              {activeProducts.map(product => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{number(product.stock_quantity)}</td>
                  <td>{product.unit || "—"}</td>
                  <td>{money(product.cost_paisa)}</td>
                  <td>{number(product.low_stock_alert)}</td>
                </tr>
              ))}
              {!activeProducts.length && (
                <tr><td colSpan="5" className="empty">No products found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  /* ------------------ Sales history ------------------ */

  const renderSales = () => (
    <>
      <div className="page-head">
        <div>
          <h2>Sales History</h2>
          <p>Review transactions and print bills.</p>
        </div>
        <div className="quick-actions">
          {printData && (
            <button className="btn primary" onClick={() => printBill(printData)}>
              <Printer size={14} /> Print Last Bill
            </button>
          )}
          <button className="btn" onClick={() => run(loadSales)}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn" onClick={exportSales}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="toolbar">
          <div className="search">
            <Search size={14} />
            <input
              placeholder="Search invoice or customer..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>Paid</th><th>Payment</th><th>Bill</th></tr>
            </thead>
            <tbody>
              {sales.filter(sale =>
                !search || JSON.stringify(sale).toLowerCase().includes(search.toLowerCase())
              ).map((sale, index) => (
                <tr key={sale.id || index}>
                  <td>{sale.invoice_number || sale.invoice_no || `#${sale.id}`}</td>
                  <td>{formatDate(sale.created_at)}</td>
                  <td>{sale.customer_name || "Walk-in"}</td>
                  <td><strong>{money(getSaleTotal(sale))}</strong></td>
                  <td>{money(getSalePaid(sale))}</td>
                  <td><span className="badge">{sale.payment_method || "cash"}</span></td>
                  <td>
                    <button
                      className="btn small"
                      disabled={!sale.items?.length}
                      title={!sale.items?.length ? "Sale items are not included in this response" : "Print bill"}
                      onClick={() => printBill({
                        sale,
                        items: sale.items,
                        subtotalPaisa: Number(sale.subtotal_paisa || getSaleTotal(sale)),
                        discountPaisa: Number(sale.discount_paisa || 0),
                        taxPaisa: Number(sale.tax_paisa || 0),
                        totalPaisa: getSaleTotal(sale),
                        receivedPaisa: getSalePaid(sale),
                        changePaisa: Number(sale.change_paisa || 0),
                        customerName: sale.customer_name || "Walk-in Customer",
                        paymentMethod: sale.payment_method || "cash"
                      })}
                    >
                      <Printer size={13} /> Print
                    </button>
                  </td>
                </tr>
              ))}
              {!sales.length && (
                <tr><td colSpan="7" className="empty">No sales available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  /* ------------------ Reports ------------------ */

  const renderReports = () => (
    <>
      <div className="page-head">
        <div>
          <h2>Reports</h2>
          <p>Analyze sales and business activity.</p>
        </div>
        <div className="quick-actions">
          <button className="btn" onClick={refreshAll}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn primary" onClick={exportSales}>
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Report Date Range</div>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label>From</label>
            <input type="date" value={reportStart} onChange={e => setReportStart(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={reportEnd} onChange={e => setReportEnd(e.target.value)} />
          </div>
        </div>
        <button className="btn" onClick={() => { setReportStart(""); setReportEnd(""); }}>
          Clear date filters
        </button>
      </div>

      <div className="grid stats">
        <div className="stat">
          <div className="stat-top">Recorded Sales <TrendingUp size={17} /></div>
          <div className="stat-value">{money(totalSales)}</div>
          <div className="stat-foot">Filtered transactions</div>
        </div>
        <div className="stat">
          <div className="stat-top">Amount Paid <Wallet size={17} /></div>
          <div className="stat-value">{money(totalPaid)}</div>
          <div className="stat-foot">Payments recorded</div>
        </div>
        <div className="stat">
          <div className="stat-top">Expenses <Wallet size={17} /></div>
          <div className="stat-value">{money(totalExpenses)}</div>
          <div className="stat-foot">All loaded expense records</div>
        </div>
        <div className="stat">
          <div className="stat-top">Transactions <Receipt size={17} /></div>
          <div className="stat-value">{filteredSales.length}</div>
          <div className="stat-foot">Filtered sales</div>
        </div>
      </div>

      <div className="notice">
        Sales and expenses are displayed from their respective database records.
        This screen does not calculate verified net profit.
      </div>

      <div className="panel">
        <div className="panel-title">Sales Report</div>
        <div className="panel-sub" style={{ marginBottom: 15 }}>
          Transactions matching the selected date range.
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Invoice</th><th>Date</th><th>Gross Total</th><th>Paid</th><th>Outstanding</th></tr>
            </thead>
            <tbody>
              {filteredSales.map((sale, index) => {
                const total = getSaleTotal(sale);
                const paid = getSalePaid(sale);
                return (
                  <tr key={sale.id || index}>
                    <td>{sale.invoice_number || sale.invoice_no || `#${sale.id}`}</td>
                    <td>{formatDate(sale.created_at)}</td>
                    <td>{money(total)}</td>
                    <td>{money(paid)}</td>
                    <td>{money(Math.max(0, total - paid))}</td>
                  </tr>
                );
              })}
              {!filteredSales.length && (
                <tr><td colSpan="5" className="empty">No report data for this date range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  /* ------------------ Settings ------------------ */

  const renderSettings = () => (
    <>
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p>Configure store details, receipts and database tools.</p>
        </div>
        <button className="btn" onClick={() => run(async () => {
          setHealth(await api.health());
          setAppInfo(await api.info());
          notify("System status updated.");
        })}>
          <RefreshCw size={14} /> Check Status
        </button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>
            <div className="panel-title">
              <Store size={16} style={{ verticalAlign: "middle", marginRight: 7 }} />
              Store Information
            </div>
            <div className="panel-sub">These details appear on printed receipts.</div>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label>Store Name *</label>
            <input value={settings.storeName} onChange={e => updateSetting("storeName", e.target.value)} />
          </div>
          <div className="field">
            <label>Phone Number</label>
            <input value={settings.phone} onChange={e => updateSetting("phone", e.target.value)} placeholder="+92..." />
          </div>
          <div className="field">
            <label>WhatsApp Number</label>
            <input value={settings.whatsapp} onChange={e => updateSetting("whatsapp", e.target.value)} placeholder="+92..." />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={settings.email} onChange={e => updateSetting("email", e.target.value)} />
          </div>
          <div className="field">
            <label>Tax Percentage</label>
            <input type="number" min="0" max="100" step="0.01" value={settings.taxPercent} onChange={e => updateSetting("taxPercent", e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Store Address</label>
          <textarea value={settings.address} onChange={e => updateSetting("address", e.target.value)} />
        </div>

        <div className="field">
          <label>Receipt Footer</label>
          <input value={settings.receiptFooter} onChange={e => updateSetting("receiptFooter", e.target.value)} />
        </div>

        <div className="field">
          <label>Receipt Message</label>
          <input value={settings.receiptMessage} onChange={e => updateSetting("receiptMessage", e.target.value)} />
        </div>

        <label className="setting-check">
          <input type="checkbox" checked={settings.showPhone} onChange={e => updateSetting("showPhone", e.target.checked)} />
          Show phone on receipt
        </label>
        <label className="setting-check">
          <input type="checkbox" checked={settings.showAddress} onChange={e => updateSetting("showAddress", e.target.checked)} />
          Show address on receipt
        </label>
        <label className="setting-check">
          <input type="checkbox" checked={settings.showEmail} onChange={e => updateSetting("showEmail", e.target.checked)} />
          Show email on receipt
        </label>

        <button className="btn primary" style={{ marginTop: 15 }} onClick={saveSettings}>
          <Save size={14} /> Save Store Settings
        </button>
      </div>

      <div className="grid report-grid">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Application Information</div>
            <Pizza size={18} />
          </div>
          <div className="health-row">
            <span>Application</span>
            <strong>{appInfo?.name || "SliceMaster POS"}</strong>
          </div>
          <div className="health-row">
            <span>Version</span>
            <strong>{appInfo?.version || "3.1.0"}</strong>
          </div>
          <div className="health-row">
            <span>Environment</span>
            <strong>Electron Desktop</strong>
          </div>
          <div className="health-row">
            <span>Currency</span>
            <strong>PKR</strong>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Database Health</div>
            <Database size={18} />
          </div>
          <div className="health-row">
            <span>Status</span>
            <span className="badge">
              {health?.ok === true || health?.status === "connected" || health?.status === "ok"
                ? "Connected"
                : "Check required"}
            </span>
          </div>
          <div className="health-row">
            <span>Database</span>
            <strong>{health?.database || health?.databasePath || "SQLite"}</strong>
          </div>
          <div className="health-row">
            <span>Integrity</span>
            <strong>{health?.integrity || health?.integrity_check || "—"}</strong>
          </div>
          <div className="health-row">
            <span>Journal</span>
            <strong>{health?.journalMode || health?.journal_mode || "—"}</strong>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Database Backup & Restore</div>
        <p className="panel-sub" style={{ marginBottom: 16 }}>
          Create a backup before major changes. Restoring may replace current data.
        </p>
        <div className="quick-actions">
          <button className="btn primary" onClick={handleBackup}>
            <Download size={14} /> Create Backup
          </button>
          <button className="btn danger" onClick={handleRestore}>
            <Upload size={14} /> Restore Backup
          </button>
        </div>
      </div>
    </>
  );

  /* ------------------ Form renderer ------------------ */

  const renderField = field => {
    const value = form[field.key] ?? "";

    if (field.type === "category") {
      return (
        <select
          value={value}
          onChange={e => setForm(old => ({ ...old, category_id: e.target.value }))}
        >
          <option value="">No Category</option>
          {categories.map(category => (
            <option key={category.id} value={String(category.id)}>
              {category.name}
            </option>
          ))}
        </select>
      );
    }

    if (field.type === "textarea") {
      return (
        <textarea
          value={value}
          onChange={e => setForm(old => ({ ...old, [field.key]: e.target.value }))}
        />
      );
    }

    if (field.type === "select") {
      return (
        <select
          value={value}
          onChange={e => setForm(old => ({ ...old, [field.key]: e.target.value }))}
        >
          <option value="">Select...</option>
          {field.options.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    if (field.type === "boolean") {
      return (
        <select
          value={String(value)}
          onChange={e => setForm(old => ({
            ...old,
            [field.key]: Number(e.target.value)
          }))}
        >
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      );
    }

    return (
      <input
        type={
          field.type === "number" ? "number" :
          field.type === "date" ? "date" : "text"
        }
        min={["number", "money"].includes(field.type) ? "0" : undefined}
        step={field.type === "number" ? "0.001" : field.type === "money" ? "0.01" : undefined}
        required={field.required}
        value={value}
        onChange={e => setForm(old => ({ ...old, [field.key]: e.target.value }))}
      />
    );
  };

  /* ------------------ Content router ------------------ */

  const renderContent = () => {
    if (page === "dashboard") return renderDashboard();
    if (page === "pos") return renderPOS();
    if (entityConfig[page]) return renderEntity(page);
    if (page === "purchases") return renderPurchases();
    if (page === "sales") return renderSales();
    if (page === "reports") return renderReports();
    if (page === "settings") return renderSettings();
    return renderDashboard();
  };

  /* ------------------ Main UI ------------------ */

  return (
    <>
      <style>{styles}</style>

      <div className="app">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="brand">
            <div className="brand-icon"><Pizza size={23} /></div>
            <div>
              <div className="brand-name">{settings.storeName || "SliceMaster"}</div>
              <div className="brand-sub">POS & MANAGEMENT</div>
            </div>
          </div>

          <div className="nav-label">WORKSPACE</div>

          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${page === item.id ? "active" : ""}`}
                onClick={() => {
                  setPage(item.id);
                  setSearch("");
                  setPosSearch("");
                  setSidebarOpen(false);
                  setError("");
                }}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="sidebar-bottom">
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <ShieldCheck size={14} color="#d5a85c" />
              Offline desktop system
            </div>
            <div style={{ marginTop: 8 }}>SliceMaster POS ERP · v3.1.0</div>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button className="icon-btn mobile-menu" onClick={() => setSidebarOpen(v => !v)}>
                {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div>
                <div className="top-title">
                  {navItems.find(item => item.id === page)?.label || "Dashboard"}
                </div>
                <div className="top-sub">
                  {settings.storeName || "SliceMaster"} · Pizza Management System
                </div>
              </div>
            </div>

            <div className="top-actions">
              <span className="badge">● Offline Ready</span>
              <button className="icon-btn" title="Refresh" disabled={loading} onClick={refreshAll}>
                <RefreshCw size={17} />
              </button>
            </div>
          </header>

          <div className="content">
            {error && (
              <div className="error">
                <AlertTriangle size={14} style={{ verticalAlign: "middle", marginRight: 7 }} />
                {error}
              </div>
            )}

            {loading && (
              <div className="notice">Please wait — processing your request...</div>
            )}

            {renderContent()}
          </div>
        </main>
      </div>

      {/* ENTITY MODAL */}

      {modal?.type === "entity" && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) {
              setModal(null);
              setEditing(null);
            }
          }}
        >
          <div className="modal">
            <div className="modal-head">
              <h3>
                {editing ? "Edit" : "Add"} {entityConfig[modal.entity].singular}
              </h3>
              <button className="icon-btn" onClick={() => {
                setModal(null);
                setEditing(null);
              }}>
                <X size={18} />
              </button>
            </div>

            <div className="form-grid">
              {entityConfig[modal.entity].fields.map(field => (
                <div className="field" key={field.key}>
                  <label>{field.label}{field.required ? " *" : ""}</label>
                  {renderField(field)}
                </div>
              ))}
            </div>

            <div className="modal-foot">
              <button className="btn" onClick={() => {
                setModal(null);
                setEditing(null);
              }}>
                Cancel
              </button>
              <button className="btn primary" disabled={loading} onClick={saveEntity}>
                <Save size={14} /> Save Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT RECEIPT */}

      {printData && (
        <div className="print-only">
          <div style={{
            width: "80mm",
            padding: "5mm",
            color: "#000",
            fontFamily: "Arial,sans-serif",
            background: "#fff"
          }}>
            <h2 style={{ textAlign: "center", margin: "0 0 5px", fontSize: 19 }}>
              {settings.storeName || "SliceMaster Pizza"}
            </h2>

            <p style={{ textAlign: "center", fontSize: 11, margin: "3px 0" }}>
              Customer Bill
            </p>

            {settings.showAddress && settings.address && (
              <p style={{ textAlign: "center", fontSize: 10, margin: "3px 0" }}>
                {settings.address}
              </p>
            )}

            {settings.showPhone && settings.phone && (
              <p style={{ textAlign: "center", fontSize: 10, margin: "3px 0" }}>
                Phone: {settings.phone}
              </p>
            )}

            {settings.showEmail && settings.email && (
              <p style={{ textAlign: "center", fontSize: 10, margin: "3px 0" }}>
                {settings.email}
              </p>
            )}

            <hr />

            <p style={{ fontSize: 11, margin: "5px 0" }}>
              Invoice: {printData.sale?.invoice_number || printData.sale?.invoice_no || printData.sale?.id || "—"}
            </p>
            <p style={{ fontSize: 11, margin: "5px 0" }}>
              Date: {printData.sale?.created_at
                ? formatDate(printData.sale.created_at)
                : new Date().toLocaleString()}
            </p>
            <p style={{ fontSize: 11, margin: "5px 0" }}>
              Customer: {printData.customerName || printData.sale?.customer_name || "Walk-in Customer"}
            </p>

            <hr />

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              fontSize: 10,
              fontWeight: "bold",
              gap: 5
            }}>
              <span>ITEM</span><span>AMOUNT</span>
            </div>

            <hr />

            {(printData.items || []).map((item, index) => {
              const itemName = item.name || item.product_name || "Product";
              const itemPrice = Number(item.price_paisa ?? item.unit_price_paisa ?? 0);
              const quantity = Number(item.quantity || 0);
              const lineTotal = Number(
                item.line_total_paisa ?? Math.round(itemPrice * quantity)
              );

              return (
                <div key={item.id || item.product_id || index} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  margin: "7px 0",
                  gap: 8
                }}>
                  <span style={{ maxWidth: "48mm" }}>
                    {itemName} × {quantity}
                    <br />
                    <small>{money(itemPrice)} each</small>
                  </span>
                  <span>{money(lineTotal)}</span>
                </div>
              );
            })}

            <hr />

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span>Subtotal</span><span>{money(printData.subtotalPaisa)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 5 }}>
              <span>Discount</span><span>-{money(printData.discountPaisa)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 5 }}>
              <span>Tax</span><span>{money(printData.taxPaisa || 0)}</span>
            </div>

            <hr />

            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: 14 }}>
              <span>TOTAL</span><span>{money(printData.totalPaisa)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 7 }}>
              <span>Received</span><span>{money(printData.receivedPaisa)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
              <span>Change</span><span>{money(printData.changePaisa)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginTop: 4 }}>
              <span>Payment</span><span>{printData.paymentMethod || "cash"}</span>
            </div>

            <hr />

            <p style={{ textAlign: "center", fontSize: 11, marginTop: 18 }}>
              {settings.receiptFooter}
            </p>
            <p style={{ textAlign: "center", fontSize: 9 }}>
              {settings.receiptMessage}
            </p>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
