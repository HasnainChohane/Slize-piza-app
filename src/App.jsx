
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import {
  LayoutDashboard, ShoppingCart, Package, Tags, Users, Truck,
  Receipt, BarChart3, Settings, Search, Plus, RefreshCw,
  Menu, X, Pizza, Wallet, Database, ShieldCheck, Trash2,
  Edit, Save, AlertTriangle, CheckCircle2, Download, Upload,
  Minus, Printer, TrendingUp, CircleDollarSign, ShoppingBag,
  Store, ChevronRight, Boxes, Layers, BarChart3 as ChartIcon
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

  deals() { const d = this.desktop; return this.call(d.deals, d.deals.list); },
  createDeal(data) { const d = this.desktop; return this.call(d.deals, d.deals.create, data); },
  updateDeal(id, data) { const d = this.desktop; return this.call(d.deals, d.deals.update, id, data); },
  removeDeal(id) { const d = this.desktop; return this.call(d.deals, d.deals.delete, id); },
  recipes(productId) { const d = this.desktop; return this.call(d.recipes, d.recipes.list, productId); },
  saveRecipe(productId, items) { const d = this.desktop; return this.call(d.recipes, d.recipes.save, productId, items); },
  deleteRecipe(productId) { const d = this.desktop; return this.call(d.recipes, d.recipes.delete, productId); },
  adjustStock(data) { const d = this.desktop; return this.call(d.inventory, d.inventory.adjust, data); },
  movements(limit) { const d = this.desktop; return this.call(d.inventory, d.inventory.movements, limit); },
  analytics(start, end) { const d = this.desktop; return this.call(d.reports, d.reports.analytics, start || null, end || null); },
  savePdf(html) { const d = this.desktop; return this.call(d.reports, d.reports.savePdf, html); },

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
  { id: "ingredients", label: "Ingredients & Recipes", icon: Layers },
  { id: "deals-stock", label: "Deals & Stock Control", icon: Boxes },
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

.receipt-paper{width:72mm;padding:4mm 3mm;background:#fff;color:#151515;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.35}
.receipt-brand-mark{width:34px;height:34px;margin:0 auto 6px;border:2px solid #222;border-radius:50%;display:grid;place-items:center;font-weight:900;font-size:12px}
.receipt-store{text-align:center;font-size:20px;line-height:1.1;margin:0 0 4px;font-weight:900;letter-spacing:.2px}
.receipt-tagline{text-align:center;font-size:7px;letter-spacing:1.2px;margin-bottom:7px}
.receipt-contact{text-align:center;font-size:9px;margin:2px 0;overflow-wrap:anywhere}
.receipt-rule{border-top:1px dashed #555;margin:9px 0}.receipt-rule-heavy{border-top:2px solid #222;margin:9px 0}
.receipt-title{text-align:center;font-weight:900;font-size:12px;letter-spacing:1px;margin:8px 0}
.receipt-meta{display:flex;justify-content:space-between;gap:8px;margin:4px 0;font-size:9px}.receipt-meta strong{text-align:right;max-width:48mm;overflow-wrap:anywhere}
.receipt-items-head,.receipt-item{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.receipt-items-head{font-weight:900;font-size:9px;margin:7px 0}
.receipt-item{font-size:9px;margin:8px 0}.receipt-item-info{max-width:47mm}.receipt-item-info strong{display:block;font-size:10px;overflow-wrap:anywhere}.receipt-item-info small{display:block;color:#444;font-size:8px;margin-top:2px}
.receipt-total-row{display:flex;justify-content:space-between;gap:8px;margin:5px 0;font-size:9px}.receipt-grand{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #222;border-bottom:1px solid #222;padding:8px 0;margin:8px 0;font-size:13px;font-weight:900}.receipt-thanks{text-align:center;font-weight:900;font-size:12px;margin-top:12px}.receipt-message{text-align:center;font-size:9px;margin-top:4px}.receipt-bottom{text-align:center;font-size:7px;color:#666;margin-top:12px}
@media print{
  body.report-print{width:auto!important;margin:0!important;padding:0!important;background:#fff!important;color:#222!important}
  body.report-print *{visibility:visible!important}
  body.report-print .sidebar,body.report-print .topbar,body.report-print .toast,body.report-print .page-head .quick-actions{display:none!important}
  body.report-print .content{padding:12px!important}
  body.report-print .panel,body.report-print .stat{break-inside:avoid;box-shadow:none!important}
  body.report-print .app{display:block!important}
  body.report-print @page{size:A4;margin:10mm}
  html,body{width:80mm!important;margin:0!important;padding:0!important;background:#fff!important}
  body *{visibility:hidden!important}
  .print-only,.print-only *{visibility:visible!important}
  .print-only{display:block!important;position:absolute!important;left:0!important;top:0!important;width:80mm!important;margin:0!important;padding:0!important}
  @page{size:80mm auto;margin:0}
}

/* Enterprise-style analytics, ingredient workspace and refined print visuals */
.metric-chart-wrap{width:100%;overflow-x:auto;padding:6px 0 0}.metric-chart{display:block;width:100%;min-width:580px;height:auto;max-height:290px;overflow:visible}.chart-legend{display:inline-flex;align-items:center;gap:7px;color:#788478;font-size:11px}.chart-legend i{width:8px;height:8px;border-radius:50%;display:inline-block}.analytics-chart-panel{background:linear-gradient(145deg,#fff,#fcfdfb)}
.chart-empty{padding:54px 12px;text-align:center;color:#879287;background:#f7faf7;border-radius:12px}
/* Dedicated ingredient workspace and refined print/report visuals */
.ingredient-builder{border:1px solid #dce9df;background:linear-gradient(145deg,#ffffff 0%,#f8fbf8 100%)}
.recipe-draft{margin-top:20px;border:1px solid #e6ece6;border-radius:13px;padding:15px;background:#fff}
.recipe-draft-title{font-size:12px;font-weight:800;color:#35483a;margin-bottom:8px}
.recipe-line{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:14px;padding:12px 2px;border-bottom:1px solid #edf0eb;font-size:12px}
.recipe-line:last-child{border-bottom:0}.recipe-line small{display:block;color:#8a958b;font-size:10px;margin-top:4px}.recipe-empty{padding:24px 8px}
.badge.success{background:#eaf5ed;color:#39734f}.badge.danger{background:#fff0ed;color:#b44c40}
@media(max-width:760px){.recipe-line{grid-template-columns:1fr auto auto}}
/* SliceMaster visual refresh */
:root{color-scheme:light;--sm-ink:#202820;--sm-muted:#778075;--sm-paper:#f7f7f3;--sm-card:#fff;--sm-line:#e8e9e1;--sm-gold:#d8ad63;--sm-green:#27362b}
body{background:var(--sm-paper);color:var(--sm-ink);font-family:Inter,"Segoe UI",Arial,sans-serif;letter-spacing:.01em}
.app{background:var(--sm-paper)}
.sidebar{width:252px;background:linear-gradient(180deg,#202a22 0%,#18211a 100%);padding:24px 15px;box-shadow:8px 0 30px #1b24140a}
.brand{padding:5px 10px 30px}
.brand-icon{width:46px;height:46px;border-radius:15px;background:linear-gradient(135deg,#f0d39b,#c7964a);box-shadow:0 8px 22px #d8ad6330}
.brand-name{font-size:19px;letter-spacing:-.5px}
.nav-label{padding:12px 13px;color:#849184;font-size:10px}
.nav-item{padding:12px 13px;border-radius:11px;font-size:13px;transition:background .18s ease,color .18s ease,transform .18s ease}
.nav-item:hover{transform:translateX(2px);background:#ffffff0c;color:#fff}
.nav-item.active{background:linear-gradient(90deg,#3b493b,#303d31);color:#f1c77d;box-shadow:inset 3px 0 #d8ad63}
.sidebar-bottom{border-color:#ffffff14}
.main{background:var(--sm-paper)}
.topbar{height:76px;padding:0 32px;background:#ffffffeb;border-bottom:1px solid var(--sm-line);backdrop-filter:blur(12px)}
.top-title{font-size:19px;letter-spacing:-.45px;color:#263127}
.top-sub{font-size:12px;color:#879084}
.content{padding:30px 32px;max-width:1700px}
.page-head{margin-bottom:25px}
.page-head h2{font-size:25px;letter-spacing:-.8px;font-weight:780;color:#263127;margin:0 0 7px}
.page-head p{font-size:13px;color:#838b7f;line-height:1.5}
.btn{border:1px solid #e2e4dc;background:#fff;border-radius:10px;padding:11px 15px;font-size:12px;font-weight:700;box-shadow:0 2px 5px #20282005;transition:all .16s ease}
.btn:hover{background:#f8f8f3;border-color:#cfd4c8;transform:translateY(-1px);box-shadow:0 5px 14px #2028200a}
.btn.primary{background:#28372b;border-color:#28372b;color:#fff;box-shadow:0 5px 14px #28372b1c}
.btn.primary:hover{background:#354936;border-color:#354936}
.btn.danger{color:#b7473e}
.btn.small{border-radius:8px}
.icon-btn{border-radius:9px;transition:background .15s ease,color .15s ease}
.icon-btn:hover{background:#f0f1eb;color:#29372c}
.grid{gap:17px}
.stats{gap:17px;margin-bottom:22px}
.stat{border:1px solid #e9eae3;border-radius:16px;padding:20px 21px;background:linear-gradient(145deg,#fff 0%,#fdfdfb 100%);box-shadow:0 5px 18px #20282005;transition:transform .18s ease,box-shadow .18s ease}
.stat:hover{transform:translateY(-2px);box-shadow:0 10px 24px #2028200b}
.stat-top{font-size:12px;font-weight:650;color:#788176}
.stat-icon{width:38px;height:38px;border-radius:12px;background:#f6f0e5;color:#a77d3d}
.stat-value{font-size:27px;letter-spacing:-.8px;color:#263127;margin-top:16px;font-weight:800}
.stat-foot{font-size:11px;color:#92998e;margin-top:7px}
.panel{border:1px solid #e8e9e2;border-radius:16px;padding:21px;background:#fff;margin-bottom:18px;box-shadow:0 5px 18px #20282004}
.panel-head{margin-bottom:19px}
.panel-title{font-size:15px;font-weight:780;letter-spacing:-.25px;color:#29352b}
.panel-sub{font-size:12px;line-height:1.5;color:#92998e}
.toolbar{gap:11px;margin-bottom:18px}
.search input{border-radius:11px;padding:12px 12px 12px 37px;background:#fbfbf8}
input,select,textarea{border:1px solid #e1e3db;border-radius:10px;padding:11px 12px;font-size:13px;background:#fff;transition:border-color .15s ease,box-shadow .15s ease}
input:focus,select:focus,textarea:focus{border-color:#c6a16a;box-shadow:0 0 0 3px #c6a16a20}
.field{gap:7px;margin-bottom:15px}
.field label{font-size:12px;color:#626b60;font-weight:700}
.table-wrap{border:1px solid #eef0e9;border-radius:12px;overflow:auto}
table{white-space:nowrap}
th{padding:13px 12px;background:#f7f8f4;color:#7c8579;font-size:10px;letter-spacing:.8px}
td{padding:13px 12px;font-size:12px;border-bottom:1px solid #f0f1eb;color:#414a40}
tbody tr:hover td{background:#fcfcf8}
.badge{padding:6px 9px;border-radius:7px;font-size:10px;background:#eef3ea;color:#54714d}
.badge.red{background:#faece8;color:#b34c41}
.product-grid{gap:13px}
.product-card{border:1px solid #e8e9e2;border-radius:14px;padding:16px;background:linear-gradient(145deg,#fff,#fdfdfa);transition:all .18s ease;box-shadow:0 3px 10px #20282004}
.product-card:hover{border-color:#d5b77f;background:#fffaf1;transform:translateY(-2px);box-shadow:0 8px 20px #8d6a2a10}
.product-card h4{font-size:13px;line-height:1.4;color:#2b362c}
.product-card p{font-size:11px;line-height:1.5;color:#899185}
.product-price{font-size:15px;color:#9b7135;letter-spacing:-.2px}
.pos-layout{gap:20px}
.cart-line{padding:14px 0}
.cart-line-name{font-size:12px;color:#2d372e}
.cart-line-sub{font-size:11px;color:#8c9488}
.qty-control button{width:28px;height:28px;border-radius:8px;background:#f8f8f4;border-color:#e5e6df}
.total-row{font-size:13px;padding:9px 0}
.total-row.grand{font-size:18px;padding-top:16px}
.modal{border-radius:18px;padding:25px;box-shadow:0 24px 80px #10161030}
.modal-head h3{font-size:19px;letter-spacing:-.4px}
.modal-foot{padding-top:13px;border-top:1px solid #eff0eb}
.notice{border-radius:11px;line-height:1.6;background:#fbf5e9;color:#846b3d}
.error,.success{border-radius:11px;line-height:1.5}
.health-row{font-size:13px}
.quick-actions{gap:10px}
.toast{border-radius:12px;padding:14px 18px;box-shadow:0 12px 35px #17201830;font-size:13px}
.empty{padding:42px 12px;color:#9aa095}
@media(max-width:1050px){.content{padding:24px}.panel{padding:18px}}
@media(max-width:760px){.topbar{height:66px}.content{padding:18px 13px}.page-head h2{font-size:22px}.panel{padding:15px;border-radius:13px}.stat{padding:16px;border-radius:13px}.stat-value{font-size:23px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}}

/* Premium receipt typography and precise thermal layout */
.receipt-paper{width:72mm!important;max-width:72mm!important;margin:0 auto!important;padding:4mm 3mm!important;background:#fff!important;color:#151515!important;font-family:Arial,Helvetica,sans-serif!important;letter-spacing:0!important}
.receipt-brand-mark{width:13mm!important;height:13mm!important;border-radius:50%!important;margin:0 auto 7px!important;display:flex!important;align-items:center!important;justify-content:center!important;font-size:14px!important;font-weight:900!important;letter-spacing:-1px!important;border:1.5px solid #111!important;background:#fff!important;color:#111!important}
.receipt-store{text-align:center!important;font-size:17px!important;line-height:1.15!important;font-weight:900!important;letter-spacing:.3px!important;margin:0 0 4px!important;color:#111!important}
.receipt-tagline{text-align:center!important;font-size:7px!important;letter-spacing:1px!important;margin:0 0 7px!important;color:#333!important}
.receipt-contact{text-align:center!important;font-size:8px!important;line-height:1.4!important;color:#333!important;overflow-wrap:anywhere!important}
.receipt-title{text-align:center!important;font-size:10px!important;font-weight:900!important;letter-spacing:1.3px!important;margin:8px 0!important}
.receipt-meta{display:flex!important;justify-content:space-between!important;gap:5px!important;font-size:8px!important;line-height:1.6!important}
.receipt-meta strong{text-align:right!important;overflow-wrap:anywhere!important}
.receipt-rule{border-top:1px dashed #555!important;margin:7px 0!important}
.receipt-rule-heavy{border-top:2px solid #111!important}
.receipt-items-head{font-size:8px!important;letter-spacing:.5px!important;border-bottom:1px solid #111!important;padding-bottom:5px!important;margin-bottom:6px!important}
.receipt-item{font-size:8px!important;line-height:1.35!important;margin:7px 0!important;break-inside:avoid!important}
.receipt-item-info{max-width:46mm!important}
.receipt-item-info strong{font-size:9px!important;font-weight:800!important}
.receipt-item-info small{font-size:7px!important;color:#444!important}
.receipt-total-row{font-size:8px!important;line-height:1.5!important}
.receipt-grand{font-size:12px!important;border-top:1.5px solid #111!important;border-bottom:1.5px solid #111!important;padding:7px 0!important;margin:7px 0!important}
.receipt-thanks{font-size:10px!important;letter-spacing:.2px!important;margin-top:10px!important}
.receipt-message{font-size:8px!important}
.receipt-bottom{font-size:6px!important;margin-top:10px!important}
@media print{.print-only{width:80mm!important}.receipt-paper{width:72mm!important;max-width:72mm!important;padding:4mm 3mm!important}.receipt-item,.receipt-total-row,.receipt-grand{break-inside:avoid!important}}


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
  const [deals, setDeals] = useState([]);
  const [recipeRows, setRecipeRows] = useState([]);
  const [movementRows, setMovementRows] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [dealDraft, setDealDraft] = useState({ name: "", description: "", price: "", startDate: "", endDate: "" });
  const [dealComponents, setDealComponents] = useState([]);
  const [dealComponentProduct, setDealComponentProduct] = useState("");
  const [dealComponentQty, setDealComponentQty] = useState("1");
  const [editingDealId, setEditingDealId] = useState(null);
  const [recipeProduct, setRecipeProduct] = useState("");
  const [recipeIngredient, setRecipeIngredient] = useState("");
  const [recipeQty, setRecipeQty] = useState("1");
  const [recipeDraft, setRecipeDraft] = useState([]);
  const [ingredientDraft, setIngredientDraft] = useState({ name: "", unit: "g", openingStock: "0", lowStock: "0", cost: "0", notes: "" });
  const [stockProduct, setStockProduct] = useState("");
  const [stockType, setStockType] = useState("stock_in");
  const [stockQty, setStockQty] = useState("1");
  const [stockCost, setStockCost] = useState("");
  const [stockNotes, setStockNotes] = useState("");
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

      const [nextDeals, nextMovements] = await Promise.all([
        api.deals(), api.movements(300)
      ]);
      setDeals(getRows(nextDeals));
      setMovementRows(getRows(nextMovements));
      await Promise.all([loadSales(), ...Object.keys(entityConfig).map(loadEntity)]);

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
    const cartKey = `product-${product.id}`;
    const found = cart.find(item => item.cartKey === cartKey);
    setCart(old => {
      const existing = old.find(item => item.cartKey === cartKey);
      if (existing) return old.map(item => item.cartKey === cartKey ? { ...item, quantity: item.quantity + 1 } : item);
      return [...old, { ...product, itemType: "product", cartKey, quantity: 1 }];
    });
  };

  const addDealToCart = deal => {
    if (Number(deal.price_paisa || 0) <= 0) { notify("Set a price for this deal first."); return; }
    const cartKey = `deal-${deal.id}`;
    setCart(old => {
      const existing = old.find(item => item.cartKey === cartKey);
      if (existing) return old.map(item => item.cartKey === cartKey ? { ...item, quantity: item.quantity + 1 } : item);
      return [...old, { id: deal.id, dealId: deal.id, itemType: "deal", cartKey, name: deal.name, description: deal.description, price_paisa: Number(deal.price_paisa), quantity: 1, stock_quantity: 999999 }];
    });
  };

  const changeQuantity = (cartKey, delta) => {
    setCart(old => old.map(item => {
      if (item.cartKey !== cartKey) return item;
      const quantity = item.quantity + delta;
      return { ...item, quantity };
    }).filter(item => item.quantity > 0));
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
      items: cart.map(item => item.itemType === "deal"
        ? { itemType: "deal", dealId: Number(item.dealId), quantity: Number(item.quantity) }
        : { productId: Number(item.id), quantity: Number(item.quantity) }),
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

  useEffect(() => {
    if (page !== "reports") return;
    api.analytics(reportStart, reportEnd).then(setAnalytics).catch(error => setError(error.message));
  }, [page, reportStart, reportEnd]);

  useEffect(() => {
    if (page !== "deals-stock" && page !== "ingredients") return;
    Promise.all([api.recipes(), api.movements(300)]).then(([recipes, movements]) => {
      setRecipeRows(getRows(recipes)); setMovementRows(getRows(movements));
    }).catch(error => setError(error.message));
  }, [page]);

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
                  disabled={Number(product.price_paisa || 0) <= 0}
                  onClick={() => addToCart(product)}
                >
                  <h4>{product.name}</h4>
                  <p>{product.sku || product.barcode || product.unit || "Product"}</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="product-price">{money(product.price_paisa)}</span>
                    <span className="badge">Stock validated at checkout</span>
                  </div>
                </button>
              ))}
            </div>

            {!visibleProducts.length && <div className="empty">No matching products found.</div>}
            {!!deals.filter(deal => Number(deal.is_active) === 1).length && (
              <div style={{ marginTop: 18, borderTop: "1px solid #ecece5", paddingTop: 15 }}>
                <div className="panel-title" style={{ marginBottom: 10 }}>Available Deals</div>
                <div className="product-grid">
                  {deals.filter(deal => Number(deal.is_active) === 1).map(deal => (
                    <button className="product-card" key={`deal-${deal.id}`} onClick={() => addDealToCart(deal)}>
                      <h4>{deal.name}</h4><p>{(deal.items || []).map(x => `${x.product_name} × ${number(x.quantity)}`).join(" · ")}</p>
                      <span className="product-price">{money(deal.price_paisa)}</span>
                    </button>
                  ))}
                </div>
              </div>
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
              <div className="cart-line" key={item.cartKey || item.id}>
                <div style={{ flex: 1 }}>
                  <div className="cart-line-name">{item.name}</div>
                  <div className="cart-line-sub">{money(item.price_paisa)} each</div>
                  <div className="qty-control">
                    <button onClick={() => changeQuantity(item.cartKey || `product-${item.id}`, -1)}>
                      <Minus size={11} />
                    </button>
                    <span style={{ fontSize: 11 }}>{item.quantity}</span>
                    <button onClick={() => changeQuantity(item.cartKey || `product-${item.id}`, 1)}>
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

  const buildReportHtml = () => {
    const esc = value => String(value ?? "").replace(/[&<>\"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
    const daily = analytics?.dailySales || [];
    const totals = analytics?.totals || {};
    const revenue = Math.max(0, Number(totals.revenue_paisa ?? totalSales ?? 0));
    const cogs = Math.max(0, Number(totals.estimated_cogs_paisa || 0));
    const expensesValue = Math.max(0, Number(totals.expenses_paisa ?? totalExpenses ?? 0));
    const net = revenue - cogs - expensesValue;
    const safeCogs = revenue ? Math.min(100, cogs / revenue * 100) : 0;
    const safeExpenses = revenue ? Math.min(100 - safeCogs, expensesValue / revenue * 100) : 0;
    const safeNet = Math.max(0, 100 - safeCogs - safeExpenses);
    const chartW=900, chartH=250, padL=62, padR=24, padT=22, padB=38;
    const maxRevenue = Math.max(1, ...daily.map(row => Number(row.revenue_paisa || 0)));
    const chartPoints=daily.map((row,i)=>({x:daily.length<=1?chartW/2:padL+i*(chartW-padL-padR)/(daily.length-1),y:padT+(1-Number(row.revenue_paisa||0)/maxRevenue)*(chartH-padT-padB),label:String(row.day||"").slice(5),value:Number(row.revenue_paisa||0)}));
    const linePath=chartPoints.map((pt,i)=>`${i?"L":"M"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
    const areaPath=chartPoints.length?`${linePath} L${chartPoints.at(-1).x},${chartH-padB} L${chartPoints[0].x},${chartH-padB} Z`:"";
    const chart=chartPoints.length?`<svg class="revenue-chart" viewBox="0 0 ${chartW} ${chartH}" role="img" aria-label="Daily revenue dotted line chart"><defs><linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#4f7f68" stop-opacity=".18"/><stop offset="100%" stop-color="#4f7f68" stop-opacity=".01"/></linearGradient></defs>${[0,.25,.5,.75,1].map(v=>{const y=padT+v*(chartH-padT-padB);return `<line x1="${padL}" y1="${y}" x2="${chartW-padR}" y2="${y}" stroke="#e8ece8" stroke-dasharray="2 7"/><text x="${padL-12}" y="${y+4}" text-anchor="end" fill="#849187" font-size="10">${esc(money(maxRevenue*(1-v)).replace("PKR ",""))}</text>`}).join("")}<path d="${areaPath}" fill="url(#revenueFill)"/><path d="${linePath}" fill="none" stroke="#3f8063" stroke-width="3.5" stroke-dasharray="2 9" stroke-linecap="round" stroke-linejoin="round"/>${chartPoints.map(pt=>`<circle cx="${pt.x}" cy="${pt.y}" r="4.5" fill="#fff" stroke="#3f8063" stroke-width="2.5"><title>${esc(pt.label)}: ${esc(money(pt.value))}</title></circle><text x="${pt.x}" y="${chartH-9}" text-anchor="middle" fill="#849187" font-size="10">${esc(pt.label)}</text>`).join("")}</svg>`:"<div class='chart-empty'>No sales in this period.</div>";
    const circumference = 2 * Math.PI * 68;
    const segments = [
      { label:"Product / ingredient cost", value:safeCogs, color:"#557c68", amount:cogs },
      { label:"Operating expenses", value:safeExpenses, color:"#d7a85b", amount:expensesValue },
      { label:"Remaining estimated profit", value:safeNet, color:"#7398bd", amount:Math.max(0,net) }
    ];
    let offset = 0;
    const rings = segments.map(seg=>{const dash=circumference*seg.value/100;const node=`<circle cx="100" cy="100" r="68" fill="none" stroke="${seg.color}" stroke-width="19" stroke-dasharray="${dash} ${circumference-dash}" stroke-dashoffset="-${offset}" transform="rotate(-90 100 100)"/>`;offset+=dash;return node;}).join("");
    const donut = revenue>0 ? `<svg viewBox="0 0 200 200" class="donut" role="img" aria-label="Revenue composition donut chart"><circle cx="100" cy="100" r="68" fill="none" stroke="#edf0ec" stroke-width="19"/>${rings}<text x="100" y="94" text-anchor="middle" font-size="12" fill="#7c877d">REVENUE</text><text x="100" y="116" text-anchor="middle" font-size="17" font-weight="800" fill="#26362c">100%</text></svg>` : `<div class="chart-empty">No revenue to calculate percentages.</div>`;
    const donutLegend = segments.map(seg=>`<div class="legend-row"><span class="legend-dot" style="background:${seg.color}"></span><span>${esc(seg.label)}</span><strong>${seg.value.toFixed(1)}%</strong><small>${esc(money(seg.amount))}</small></div>`).join("");
    const salesRows = filteredSales.map(sale => `<tr><td>${esc(sale.invoice_number || sale.invoice_no || sale.id)}</td><td>${esc(formatDate(sale.created_at))}</td><td>${esc(sale.customer_name || "Walk-in")}</td><td>${esc(money(getSaleTotal(sale)))}</td><td>${esc(money(getSalePaid(sale)))}</td></tr>`).join("");
    const productRows = (analytics?.topProducts || []).map(row => `<tr><td>${esc(row.name)}</td><td>${esc(number(row.quantity))}</td><td>${esc(money(row.revenue_paisa))}</td></tr>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>SliceMaster Business Report</title><style>
      *{box-sizing:border-box}body{font-family:Inter,Arial,Helvetica,sans-serif;color:#26342b;margin:0;padding:28px;font-size:10px;background:#fff}header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #344f3d;padding-bottom:15px;margin-bottom:18px}h1{font-size:23px;margin:0 0 5px;letter-spacing:-.5px}h2{font-size:13px;margin:20px 0 9px;letter-spacing:.2px}.muted{color:#7b857d}.period{text-align:right;line-height:1.7}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.card{border:1px solid #e6ebe6;border-radius:10px;padding:12px;background:#fbfcfb}.label{color:#788279;font-size:9px;text-transform:uppercase;letter-spacing:.7px}.value{font-size:16px;font-weight:800;margin-top:7px}.chart-layout{display:grid;grid-template-columns:1.7fr 1fr;gap:16px;align-items:center}.chart-card{border:1px solid #e8ece8;border-radius:12px;padding:13px;background:#fff}.chart{padding:4px 0}.revenue-chart{display:block;width:100%;height:auto;max-height:270px;overflow:visible}.donut{display:block;width:180px;max-width:100%;margin:0 auto 10px}.legend-row{display:grid;grid-template-columns:10px 1fr auto;gap:7px;align-items:center;padding:7px 0;border-bottom:1px solid #eef1ed;font-size:9px}.legend-row small{grid-column:2/4;color:#7a847c}.legend-dot{width:9px;height:9px;border-radius:50%}.chart-empty{padding:35px 10px;text-align:center;color:#7d887e;background:#f7faf7;border-radius:9px}table{width:100%;border-collapse:collapse;margin-top:7px}th{background:#f0f4f0;text-align:left;font-weight:700;color:#34483b;text-transform:uppercase;font-size:9px;letter-spacing:.4px}th,td{padding:8px;border-bottom:1px solid #e9ede9}footer{margin-top:18px;border-top:1px solid #e6eae6;padding-top:8px;color:#7c857e;font-size:8px;display:flex;justify-content:space-between}.small-note{font-size:8px;color:#7c857e;margin-top:8px}@page{size:A4;margin:11mm}
      </style></head><body><header><div><h1>${esc(settings.storeName || "SliceMaster Pizza")}</h1><div class="muted">BUSINESS PERFORMANCE · PKR</div><div class="muted">${esc(settings.address || "")} ${esc(settings.phone || "")}</div></div><div class="period"><strong>REPORT PERIOD</strong><div>${esc(reportStart || analytics?.period?.start || "All dates")} – ${esc(reportEnd || analytics?.period?.end || "Today")}</div><div class="muted">Generated ${esc(new Date().toLocaleString())}</div></div></header>
      <div class="cards"><div class="card"><div class="label">Total revenue</div><div class="value">${esc(money(revenue))}</div></div><div class="card"><div class="label">Product cost</div><div class="value">${esc(money(cogs))}</div></div><div class="card"><div class="label">Operating expenses</div><div class="value">${esc(money(expensesValue))}</div></div><div class="card"><div class="label">Estimated net</div><div class="value">${esc(money(net))}</div></div></div>
      <h2>Revenue Performance</h2><div class="chart-layout"><div class="chart-card"><div class="label">Daily revenue trend · connected dotted line</div><div class="chart">${chart}</div></div><div class="chart-card"><div class="label">Revenue composition · percentage</div>${donut}<div>${donutLegend}</div></div></div>
      <h2>Top Selling Products & Deals</h2><table><thead><tr><th>Item</th><th>Quantity</th><th>Revenue</th></tr></thead><tbody>${productRows || "<tr><td colspan=3>No sales data</td></tr>"}</tbody></table>
      <h2>Sales Transactions</h2><table><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th>Total</th><th>Paid</th></tr></thead><tbody>${salesRows || "<tr><td colspan=5>No transactions in selected period</td></tr>"}</tbody></table>
      <div class="small-note">Estimated net = revenue − recorded product/ingredient cost − recorded operating expenses. Percentages are calculated from total revenue. This is a management estimate, not an audited statement.</div><footer><span>SliceMaster POS ERP · Offline business report</span><span>Page generated ${esc(new Date().toLocaleDateString())}</span></footer></body></html>`;
  };

  const renderMetricChart = (rows, valueKey, stroke, chartLabel) => {
    const values = rows || [];
    const width = 960, height = 250, left = 58, right = 20, top = 18, bottom = 38;
    const max = Math.max(1, ...values.map(row => Number(row[valueKey] || 0)));
    const points = values.map((row, index) => ({
      x: values.length < 2 ? width / 2 : left + index * (width - left - right) / (values.length - 1),
      y: top + (1 - Number(row[valueKey] || 0) / max) * (height - top - bottom),
      label: String(row.day || "").slice(5), value: Number(row[valueKey] || 0), day: row.day
    }));
    const line = points.map((point,index)=>`${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
    const area = points.length ? `${line} L${points[points.length-1].x},${height-bottom} L${points[0].x},${height-bottom} Z` : "";
    return <div className="metric-chart-wrap">{points.length ? <svg className="metric-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={chartLabel}>
      <defs><linearGradient id={`fill-${valueKey}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={stroke} stopOpacity=".22"/><stop offset="100%" stopColor={stroke} stopOpacity=".01"/></linearGradient></defs>
      {[0,.25,.5,.75,1].map(v=>{const y=top+v*(height-top-bottom);return <g key={v}><line x1={left} y1={y} x2={width-right} y2={y} stroke="#e9eee9" strokeDasharray="4 6"/><text x={left-10} y={y+4} textAnchor="end" fill="#879287" fontSize="10">{money(max*(1-v)).replace("PKR ","")}</text></g>})}
      <path d={area} fill={`url(#fill-${valueKey})`}/><path d={line} fill="none" stroke={stroke} strokeWidth="3.5" strokeDasharray="2 8" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((point,index)=><g key={`${point.day}-${index}`}><circle cx={point.x} cy={point.y} r="4.5" fill="#fff" stroke={stroke} strokeWidth="3"><title>{point.day}: {money(point.value)}</title></circle><text x={point.x} y={height-10} textAnchor="middle" fill="#879287" fontSize="10">{point.label}</text></g>)}
    </svg> : <div className="chart-empty">No data available for this period.</div>}</div>;
  };

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
          <button className="btn primary" onClick={() => run(async () => {
            const result = await api.savePdf(buildReportHtml());
            if (!result?.canceled) notify("PDF report saved.");
          })}>
            <Download size={14} /> Save PDF Report
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
          <div className="stat-value">{money(analytics?.totals?.expenses_paisa ?? totalExpenses)}</div>
          <div className="stat-foot">Expenses in selected period</div>
        </div>
        <div className="stat">
          <div className="stat-top">Transactions <Receipt size={17} /></div>
          <div className="stat-value">{filteredSales.length}</div>
          <div className="stat-foot">Filtered sales</div>
        </div>
      </div>

      {analytics && <div className="grid stats">
        <div className="stat"><div className="stat-top">Inventory Value</div><div className="stat-value">{money(analytics.inventory?.stock_value_paisa)}</div><div className="stat-foot">Estimated at recorded cost</div></div>
        <div className="stat"><div className="stat-top">Low Stock Items</div><div className="stat-value">{number(analytics.inventory?.low_stock_count)}</div><div className="stat-foot">At or below reorder level</div></div>
        <div className="stat"><div className="stat-top">Purchases</div><div className="stat-value">{money(analytics.purchases?.purchases_paisa)}</div><div className="stat-foot">Purchase invoices in period</div></div>
        <div className="stat"><div className="stat-top">Wastage Qty</div><div className="stat-value">{number(analytics.wastage?.wastage_quantity)}</div><div className="stat-foot">Recorded movement quantity</div></div>
      </div>}
      {analytics && <div className="grid stats">
        <div className="stat"><div className="stat-top">Estimated Cost of Goods</div><div className="stat-value">{money(analytics.totals?.estimated_cogs_paisa)}</div><div className="stat-foot">Recipe and product cost estimates</div></div>
        <div className="stat"><div className="stat-top">Estimated Gross Profit</div><div className="stat-value">{money(analytics.totals?.estimated_gross_profit_paisa)}</div><div className="stat-foot">Revenue minus estimated item cost</div></div>
        <div className="stat"><div className="stat-top">Estimated Net</div><div className="stat-value">{money(analytics.totals?.estimated_net_paisa)}</div><div className="stat-foot">After recorded expenses only</div></div>
      </div>}
      <div className="panel analytics-chart-panel">
        <div className="panel-head"><div><div className="panel-title">Revenue Performance</div><div className="panel-sub">Daily sales revenue · hover over a point to inspect the value</div></div><span className="chart-legend"><i style={{background:"#3f8063"}}/> Revenue</span></div>
        {renderMetricChart(analytics?.dailySales, "revenue_paisa", "#3f8063", "Daily revenue trend")}
      </div>
      <div className="panel analytics-chart-panel">
        <div className="panel-head"><div><div className="panel-title">Expense Trend</div><div className="panel-sub">Daily recorded expenses over the selected reporting period</div></div><span className="chart-legend"><i style={{background:"#d19a4a"}}/> Expenses</span></div>
        {renderMetricChart(analytics?.dailyExpenses, "expenses_paisa", "#d19a4a", "Daily expense trend")}
      </div>
      <div className="panel">
        <div className="panel-title">Top Selling Products</div>
        <div className="table-wrap"><table><thead><tr><th>Product / Deal</th><th>Quantity</th><th>Revenue</th></tr></thead><tbody>
          {(analytics?.topProducts || []).map((row, index) => <tr key={`${row.name}-${index}`}><td>{row.name}</td><td>{number(row.quantity)}</td><td>{money(row.revenue_paisa)}</td></tr>)}
          {!analytics?.topProducts?.length && <tr><td colSpan="3" className="empty">No product sales recorded.</td></tr>}
        </tbody></table></div>
      </div>
      <div className="notice">Gross margin is not represented as verified net profit. Inventory value and wastage are estimates based on current recorded cost and stock movements.</div>

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

  /* ------------------ Deals, recipes and stock ------------------ */
  const renderDealsStock = () => {
    const addDealComponent = () => {
      const product = products.find(p => Number(p.id) === Number(dealComponentProduct));
      const quantity = Number(dealComponentQty);
      if (!product || !Number.isFinite(quantity) || quantity <= 0) { notify("Choose a product and valid quantity."); return; }
      setDealComponents(old => {
        const existing = old.find(x => Number(x.productId) === Number(product.id));
        return existing ? old.map(x => Number(x.productId) === Number(product.id) ? { ...x, quantity: Number(x.quantity) + quantity } : x)
          : [...old, { productId: Number(product.id), product_name: product.name, quantity }];
      });
      setDealComponentProduct(""); setDealComponentQty("1");
    };
    const saveDealDraft = () => run(async () => {
      if (!dealDraft.name.trim() || !dealComponents.length) throw new Error("Enter a deal name and add its components.");
      const payload = { name: dealDraft.name.trim(), description: dealDraft.description, pricePaisa: toPaisa(dealDraft.price), startDate: dealDraft.startDate || null, endDate: dealDraft.endDate || null, isActive: 1, items: dealComponents.map(x => ({ productId: x.productId, quantity: x.quantity })) };
      if (editingDealId) await api.updateDeal(editingDealId, payload); else await api.createDeal(payload);
      setDealDraft({ name: "", description: "", price: "", startDate: "", endDate: "" }); setDealComponents([]); setEditingDealId(null);
      setDeals(getRows(await api.deals())); notify("Deal saved.");
    });
    const editDeal = deal => {
      setEditingDealId(Number(deal.id));
      setDealDraft({ name: deal.name || "", description: deal.description || "", price: String(Number(deal.price_paisa || 0) / 100), startDate: deal.start_date || "", endDate: deal.end_date || "" });
      setDealComponents((deal.items || []).map(x => ({ productId: Number(x.product_id), product_name: x.product_name, quantity: Number(x.quantity) })));
    };
    const addRecipeIngredient = () => {
      const ingredient = products.find(p => Number(p.id) === Number(recipeIngredient));
      const quantity = Number(recipeQty);
      if (!ingredient || !Number.isFinite(quantity) || quantity <= 0) { notify("Choose ingredient and enter a valid quantity."); return; }
      if (Number(recipeProduct) === Number(ingredient.id)) { notify("A product cannot be its own ingredient."); return; }
      setRecipeDraft(old => {
        const existing = old.find(x => Number(x.ingredientProductId) === Number(ingredient.id));
        return existing ? old.map(x => Number(x.ingredientProductId) === Number(ingredient.id) ? { ...x, quantity: Number(x.quantity) + quantity } : x)
          : [...old, { ingredientProductId: Number(ingredient.id), ingredient_name: ingredient.name, unit: ingredient.unit, quantity }];
      });
      setRecipeIngredient(""); setRecipeQty("1");
    };
    const saveRecipeDraft = () => run(async () => {
      if (!recipeProduct || !recipeDraft.length) throw new Error("Select a menu product and add ingredients.");
      await api.saveRecipe(Number(recipeProduct), recipeDraft.map(x => ({ ingredientProductId: x.ingredientProductId, quantity: x.quantity })));
      setRecipeRows(getRows(await api.recipes())); setRecipeDraft([]); notify("Recipe saved. Ingredient stock will be deducted on sales.");
    });
    const submitStockAdjustment = () => run(async () => {
      if (!stockProduct || Number(stockQty) <= 0) throw new Error("Select a stock item and enter a quantity.");
      await api.adjustStock({ productId: Number(stockProduct), type: stockType, quantity: Number(stockQty), unitCostPaisa: stockCost ? toPaisa(stockCost) : 0, notes: stockNotes });
      setMovementRows(getRows(await api.movements(300))); await loadEntity("products"); setStockQty("1"); setStockCost(""); setStockNotes(""); notify("Stock movement recorded.");
    });
    const low = products.filter(p => Number(p.stock_quantity || 0) <= Number(p.low_stock_alert || 0));
    return <>
      <div className="page-head"><div><h2>Deals & Inventory</h2><p>Configure combo offers, ingredient recipes, stock-in/out and wastage.</p></div><button className="btn" onClick={() => run(async () => { setDeals(getRows(await api.deals())); setRecipeRows(getRows(await api.recipes())); setMovementRows(getRows(await api.movements(300))); await loadEntity("products"); })}><RefreshCw size={14}/> Refresh</button></div>
      <div className="grid stats"><div className="stat"><div className="stat-top">Active Deals</div><div className="stat-value">{deals.filter(x => Number(x.is_active) === 1).length}</div></div><div className="stat"><div className="stat-top">Low Stock</div><div className="stat-value">{low.length}</div></div><div className="stat"><div className="stat-top">Recipe Lines</div><div className="stat-value">{recipeRows.length}</div></div><div className="stat"><div className="stat-top">Stock Movements</div><div className="stat-value">{movementRows.length}</div></div></div>
      <div className="panel"><div className="panel-title">Create / Edit Deal</div><div className="form-grid" style={{marginTop:12}}><div className="field"><label>Deal Name *</label><input value={dealDraft.name} onChange={e=>setDealDraft(x=>({...x,name:e.target.value}))} placeholder="Family Combo"/></div><div className="field"><label>Deal Price (PKR) *</label><input type="number" min="0" step="0.01" value={dealDraft.price} onChange={e=>setDealDraft(x=>({...x,price:e.target.value}))}/></div><div className="field"><label>Description</label><input value={dealDraft.description} onChange={e=>setDealDraft(x=>({...x,description:e.target.value}))}/></div><div className="field"><label>Start Date (optional)</label><input type="date" value={dealDraft.startDate} onChange={e=>setDealDraft(x=>({...x,startDate:e.target.value}))}/></div><div className="field"><label>End Date (optional)</label><input type="date" value={dealDraft.endDate} onChange={e=>setDealDraft(x=>({...x,endDate:e.target.value}))}/></div></div>
        <div className="form-grid" style={{marginTop:12}}><div className="field"><label>Component Product</label><select value={dealComponentProduct} onChange={e=>setDealComponentProduct(e.target.value)}><option value="">Select product</option>{activeProducts.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="field"><label>Quantity</label><input type="number" min="0.001" step="0.001" value={dealComponentQty} onChange={e=>setDealComponentQty(e.target.value)}/></div><div className="field" style={{alignSelf:"end"}}><button className="btn" onClick={addDealComponent}><Plus size={14}/> Add Component</button></div></div>
        {!!dealComponents.length && <div style={{marginTop:12}}>{dealComponents.map((x,i)=><div className="health-row" key={`${x.productId}-${i}`}><span>{x.product_name} × {number(x.quantity)}</span><button className="icon-btn" onClick={()=>setDealComponents(old=>old.filter((_,j)=>j!==i))}><Trash2 size={13}/></button></div>)}</div>}
        <div className="quick-actions" style={{marginTop:14}}><button className="btn primary" onClick={saveDealDraft}><Save size={14}/>{editingDealId?"Update Deal":"Save Deal"}</button><button className="btn" onClick={()=>{setEditingDealId(null);setDealDraft({name:"",description:"",price:"",startDate:"",endDate:""});setDealComponents([]);}}>Clear</button></div>
      </div>
      <div className="panel"><div className="panel-title">Deals</div><div className="table-wrap"><table><thead><tr><th>Deal</th><th>Components</th><th>Price</th><th>Active</th><th>Actions</th></tr></thead><tbody>{deals.map(d=><tr key={d.id}><td>{d.name}</td><td>{(d.items||[]).map(x=>`${x.product_name} × ${number(x.quantity)}`).join(", ")}</td><td>{money(d.price_paisa)}</td><td>{Number(d.is_active)?"Yes":"No"}</td><td><div className="actions"><button className="icon-btn" onClick={()=>editDeal(d)}><Edit size={13}/></button><button className="icon-btn" onClick={()=>run(async()=>{if(window.confirm(`Delete deal ${d.name}?`)){await api.removeDeal(d.id);setDeals(getRows(await api.deals()));notify("Deal deleted.");}})}><Trash2 size={13}/></button></div></td></tr>)}{!deals.length&&<tr><td colSpan="5" className="empty">No deals configured yet.</td></tr>}</tbody></table></div></div>
      <div className="panel"><div className="panel-title">Product Recipe / Ingredient Usage</div><div className="panel-sub">For each menu product, define ingredient quantities used per one sold unit. Ingredients are deducted automatically during checkout.</div><div className="form-grid" style={{marginTop:12}}><div className="field"><label>Menu Product</label><select value={recipeProduct} onChange={e=>{const value=e.target.value;setRecipeProduct(value);setRecipeDraft(recipeRows.filter(x=>Number(x.product_id)===Number(value)).map(x=>({ingredientProductId:Number(x.ingredient_product_id),ingredient_name:x.ingredient_name,unit:x.unit,quantity:Number(x.quantity)})));}}><option value="">Select menu product</option>{activeProducts.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div><div className="field"><label>Ingredient Stock Item</label><select value={recipeIngredient} onChange={e=>setRecipeIngredient(e.target.value)}><option value="">Select ingredient</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></div><div className="field"><label>Qty per Menu Item</label><input type="number" min="0.001" step="0.001" value={recipeQty} onChange={e=>setRecipeQty(e.target.value)}/></div><div className="field" style={{alignSelf:"end"}}><button className="btn" onClick={addRecipeIngredient}><Plus size={14}/> Add Ingredient</button></div></div>
        {!!recipeDraft.length&&<div style={{marginTop:12}}>{recipeDraft.map((x,i)=><div className="health-row" key={i}><span>{x.ingredient_name} · {number(x.quantity)} {x.unit}</span><button className="icon-btn" onClick={()=>setRecipeDraft(old=>old.filter((_,j)=>j!==i))}><Trash2 size={13}/></button></div>)}</div>}<button className="btn primary" style={{marginTop:14}} onClick={saveRecipeDraft}><Save size={14}/> Save Recipe</button>
        <div className="table-wrap" style={{marginTop:15}}><table><thead><tr><th>Menu Product</th><th>Ingredient</th><th>Qty per item</th><th></th></tr></thead><tbody>{recipeRows.map((r,i)=><tr key={`${r.product_id}-${r.ingredient_product_id}-${i}`}><td>{r.product_name}</td><td>{r.ingredient_name}</td><td>{number(r.quantity)} {r.unit}</td><td><button className="icon-btn" onClick={()=>run(async()=>{const remaining=recipeRows.filter(x=>Number(x.product_id)===Number(r.product_id)&&Number(x.ingredient_product_id)!==Number(r.ingredient_product_id));if(remaining.length)await api.saveRecipe(Number(r.product_id),remaining.map(x=>({ingredientProductId:x.ingredient_product_id,quantity:x.quantity})));else await api.deleteRecipe(Number(r.product_id));setRecipeRows(getRows(await api.recipes()));if(Number(recipeProduct)===Number(r.product_id))setRecipeDraft(remaining.map(x=>({ingredientProductId:Number(x.ingredient_product_id),ingredient_name:x.ingredient_name,unit:x.unit,quantity:Number(x.quantity)})));notify("Recipe ingredient removed.");})}><Trash2 size={13}/></button></td></tr>)}{!recipeRows.length&&<tr><td colSpan="4" className="empty">No recipes saved.</td></tr>}</tbody></table></div></div>
      <div className="panel"><div className="panel-title">Stock In / Stock Out / Wastage</div><div className="form-grid" style={{marginTop:12}}><div className="field"><label>Stock Item</label><select value={stockProduct} onChange={e=>setStockProduct(e.target.value)}><option value="">Select item</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {number(p.stock_quantity)} {p.unit}</option>)}</select></div><div className="field"><label>Movement</label><select value={stockType} onChange={e=>setStockType(e.target.value)}><option value="stock_in">Stock In</option><option value="stock_out">Stock Out</option><option value="wastage">Wastage</option><option value="adjustment">Adjustment / Stock Out</option></select></div><div className="field"><label>Quantity</label><input type="number" min="0.001" step="0.001" value={stockQty} onChange={e=>setStockQty(e.target.value)}/></div><div className="field"><label>Unit Cost (PKR, optional)</label><input type="number" min="0" step="0.01" value={stockCost} onChange={e=>setStockCost(e.target.value)}/></div><div className="field"><label>Notes</label><input value={stockNotes} onChange={e=>setStockNotes(e.target.value)}/></div></div><button className="btn primary" style={{marginTop:14}} onClick={submitStockAdjustment}><Save size={14}/> Record Stock Movement</button></div>
      <div className="panel"><div className="panel-title">Low Stock Alerts</div><div className="table-wrap"><table><thead><tr><th>Item</th><th>Available</th><th>Reorder Alert</th><th>Unit</th></tr></thead><tbody>{low.map(p=><tr key={p.id}><td>{p.name}</td><td>{number(p.stock_quantity)}</td><td>{number(p.low_stock_alert)}</td><td>{p.unit}</td></tr>)}{!low.length&&<tr><td colSpan="4" className="empty">No low-stock items.</td></tr>}</tbody></table></div></div>
      <div className="panel"><div className="panel-title">Recent Stock Movements</div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Qty</th><th>Notes</th></tr></thead><tbody>{movementRows.slice(0,100).map(row=><tr key={row.id}><td>{formatDate(row.created_at)}</td><td>{row.product_name||"Deleted product"}</td><td>{row.movement_type}</td><td>{number(row.quantity)} {row.unit}</td><td>{row.notes||"—"}</td></tr>)}{!movementRows.length&&<tr><td colSpan="5" className="empty">No stock movement history.</td></tr>}</tbody></table></div></div>
    </>;
  };

  /* ------------------ Owner-managed Ingredients & Recipes workspace ------------------ */
  const renderIngredients = () => {
    const ingredientCategory = categories.find(c => String(c.name || "").trim().toLowerCase() === "ingredients");
    const ingredientRows = products.filter(p =>
      ingredientCategory && Number(p.category_id) === Number(ingredientCategory.id)
    );
    const menuRows = activeProducts.filter(p =>
      !ingredientCategory || Number(p.category_id) !== Number(ingredientCategory.id)
    );
    const ingredientOptions = ingredientRows.filter(p => Number(p.is_active ?? 1) === 1 || Number(p.stock_quantity || 0) >= 0);
    const recipeProducts = new Set(recipeRows.map(x => Number(x.product_id)));
    const totalIngredientValue = ingredientRows.reduce((sum, p) => sum + Number(p.stock_quantity || 0) * Number(p.cost_paisa || 0), 0);
    const lowIngredients = ingredientRows.filter(p => Number(p.stock_quantity || 0) <= Number(p.low_stock_alert || 0));

    const addIngredientMaster = () => run(async () => {
      const name = ingredientDraft.name.trim();
      const unit = ingredientDraft.unit.trim();
      const openingStock = Number(ingredientDraft.openingStock || 0);
      const lowStock = Number(ingredientDraft.lowStock || 0);
      const cost = Number(ingredientDraft.cost || 0);
      if (!name) throw new Error("Enter an ingredient name, for example Flour or Mozzarella Cheese.");
      if (!unit) throw new Error("Enter the stock unit, for example g, kg, ml, litre or pcs.");
      if (![openingStock, lowStock, cost].every(Number.isFinite) || openingStock < 0 || lowStock < 0 || cost < 0) {
        throw new Error("Stock, low-stock level and cost must be valid non-negative numbers.");
      }
      let category = ingredientCategory;
      if (!category) {
        await api.create("categories", { name: "Ingredients", description: "Owner-managed raw materials used in product recipes." });
        const nextCategories = await loadEntity("categories");
        category = nextCategories.find(c => String(c.name || "").trim().toLowerCase() === "ingredients");
      }
      if (!category) throw new Error("Could not create the Ingredients category. Please refresh and try again.");
      if (ingredientRows.some(p => String(p.name || "").trim().toLowerCase() === name.toLowerCase())) {
        throw new Error("An ingredient with this name already exists.");
      }
      await api.create("products", {
        name,
        sku: `ING-${Date.now()}`,
        barcode: null,
        description: ingredientDraft.notes.trim() || "Raw ingredient / recipe stock item",
        category_id: Number(category.id),
        unit,
        price_paisa: 0,
        cost_paisa: toPaisa(cost),
        stock_quantity: openingStock,
        low_stock_alert: lowStock,
        is_active: 0
      });
      await loadEntity("products");
      setIngredientDraft({ name: "", unit: "g", openingStock: "0", lowStock: "0", cost: "0", notes: "" });
      notify(`${name} added to ingredient inventory. It will not appear as a sellable POS product.`);
    });

    const addIngredientToRecipe = () => {
      const ingredient = ingredientOptions.find(p => Number(p.id) === Number(recipeIngredient));
      const quantity = Number(recipeQty);
      if (!recipeProduct) { notify("Select the product or product size first."); return; }
      if (!ingredient) { notify("Select an ingredient from your ingredient inventory."); return; }
      if (!Number.isFinite(quantity) || quantity <= 0) { notify("Enter a quantity greater than zero."); return; }
      if (Number(recipeProduct) === Number(ingredient.id)) { notify("A product cannot use itself as an ingredient."); return; }
      setRecipeDraft(old => {
        const found = old.find(x => Number(x.ingredientProductId) === Number(ingredient.id));
        return found
          ? old.map(x => Number(x.ingredientProductId) === Number(ingredient.id) ? { ...x, quantity: Number(x.quantity) + quantity } : x)
          : [...old, { ingredientProductId: Number(ingredient.id), ingredient_name: ingredient.name, unit: ingredient.unit, quantity }];
      });
      setRecipeIngredient("");
      setRecipeQty("1");
    };

    const saveRecipe = () => run(async () => {
      if (!recipeProduct) throw new Error("Select the product that you want to make.");
      if (!recipeDraft.length) throw new Error("Add at least one ingredient to this recipe.");
      await api.saveRecipe(Number(recipeProduct), recipeDraft.map(x => ({ ingredientProductId: Number(x.ingredientProductId), quantity: Number(x.quantity) })));
      setRecipeRows(getRows(await api.recipes()));
      setRecipeDraft([]);
      notify("Recipe saved. Ingredient quantities will automatically stock out when this product is sold.");
    });

    const loadRecipeForProduct = productId => {
      setRecipeProduct(productId);
      setRecipeDraft(recipeRows.filter(x => Number(x.product_id) === Number(productId)).map(x => ({
        ingredientProductId: Number(x.ingredient_product_id),
        ingredient_name: x.ingredient_name,
        unit: x.unit,
        quantity: Number(x.quantity)
      })));
    };

    return <>
      <div className="page-head">
        <div>
          <h2>Ingredients & Product Recipes</h2>
          <p>Create your own raw materials, assign them to products, and let SliceMaster deduct the exact quantities whenever an order is completed.</p>
        </div>
        <button className="btn" disabled={loading} onClick={() => run(async () => {
          await Promise.all([loadEntity("products"), loadEntity("categories")]);
          setRecipeRows(getRows(await api.recipes()));
          setMovementRows(getRows(await api.movements(300)));
        })}><RefreshCw size={14}/> Refresh</button>
      </div>

      <div className="grid stats">
        <div className="stat"><div className="stat-top">My ingredients</div><div className="stat-value">{ingredientRows.length}</div><div className="stat-foot">Raw materials created by the owner</div></div>
        <div className="stat"><div className="stat-top">Products with recipes</div><div className="stat-value">{recipeProducts.size}</div><div className="stat-foot">Automatic stock deduction enabled</div></div>
        <div className="stat"><div className="stat-top">Low ingredients</div><div className="stat-value">{lowIngredients.length}</div><div className="stat-foot">Need stock replenishment</div></div>
        <div className="stat"><div className="stat-top">Ingredient stock value</div><div className="stat-value">{money(totalIngredientValue)}</div><div className="stat-foot">Based on recorded unit cost</div></div>
      </div>

      <div className="panel ingredient-builder">
        <div className="panel-head">
          <div><div className="panel-title">1. Create Your Ingredients</div><div className="panel-sub">You decide what ingredients exist. Add anything your shop uses: flour, dough, chicken, cheese, bread, sauce, oil, fries, packaging, toppings, or any custom item.</div></div>
          <span className="badge">Owner managed</span>
        </div>
        <div className="form-grid">
          <div className="field"><label>Ingredient name *</label><input value={ingredientDraft.name} onChange={e => setIngredientDraft(x => ({ ...x, name: e.target.value }))} placeholder="e.g. Mozzarella Cheese" /></div>
          <div className="field"><label>Stock unit *</label><input value={ingredientDraft.unit} onChange={e => setIngredientDraft(x => ({ ...x, unit: e.target.value }))} placeholder="g, kg, ml, litre, pcs" /></div>
          <div className="field"><label>Opening stock</label><input type="number" min="0" step="0.001" value={ingredientDraft.openingStock} onChange={e => setIngredientDraft(x => ({ ...x, openingStock: e.target.value }))} placeholder="e.g. 5000" /></div>
          <div className="field"><label>Low-stock alert</label><input type="number" min="0" step="0.001" value={ingredientDraft.lowStock} onChange={e => setIngredientDraft(x => ({ ...x, lowStock: e.target.value }))} placeholder="e.g. 500" /></div>
          <div className="field"><label>Cost per unit (PKR)</label><input type="number" min="0" step="0.01" value={ingredientDraft.cost} onChange={e => setIngredientDraft(x => ({ ...x, cost: e.target.value }))} placeholder="Optional" /></div>
          <div className="field"><label>Notes (optional)</label><input value={ingredientDraft.notes} onChange={e => setIngredientDraft(x => ({ ...x, notes: e.target.value }))} placeholder="Brand, supplier or other detail" /></div>
        </div>
        <div className="quick-actions" style={{ marginTop: 14 }}><button className="btn primary" disabled={loading} onClick={addIngredientMaster}><Plus size={15}/> Add Ingredient to Inventory</button><span className="panel-sub">Ingredients are stored as inventory-only items and hidden from the normal POS product list.</span></div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><div className="panel-title">2. Your Ingredient Inventory</div><div className="panel-sub">This is your own ingredient list. Set opening stock here; use Deals & Stock Control to record later stock-in, stock-out and wastage.</div></div><button className="btn" onClick={() => setPage("deals-stock")}><Boxes size={14}/> Stock Control</button></div>
        <div className="table-wrap"><table><thead><tr><th>Ingredient</th><th>Available stock</th><th>Unit</th><th>Low-stock alert</th><th>Cost / unit</th><th>Status</th></tr></thead><tbody>
          {ingredientRows.map(item => { const low = Number(item.stock_quantity || 0) <= Number(item.low_stock_alert || 0); return <tr key={item.id}><td><strong>{item.name}</strong><div className="panel-sub">{item.description || "Raw ingredient"}</div></td><td>{number(item.stock_quantity)}</td><td>{item.unit}</td><td>{number(item.low_stock_alert)}</td><td>{money(item.cost_paisa || 0)}</td><td><span className={`badge ${low ? "danger" : "success"}`}>{low ? "Low stock" : "Available"}</span></td></tr>; })}
          {!ingredientRows.length && <tr><td colSpan="6" className="empty">No ingredients created yet. Add your first ingredient above.</td></tr>}
        </tbody></table></div>
      </div>

      <div className="panel ingredient-builder">
        <div className="panel-head"><div><div className="panel-title">3. Build a Recipe for Each Product</div><div className="panel-sub">Choose a product or size, then add the ingredients and the quantity needed to make exactly one unit of that product.</div></div><span className="badge">Automatic stock out</span></div>
        <div className="form-grid">
          <div className="field"><label>Product / size *</label><select value={recipeProduct} onChange={e => loadRecipeForProduct(e.target.value)}><option value="">Choose Small Pizza, Large Pizza, Burger…</option>{menuRows.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          <div className="field"><label>Ingredient *</label><select value={recipeIngredient} onChange={e => setRecipeIngredient(e.target.value)}><option value="">Choose one of your ingredients</option>{ingredientOptions.map(x => <option key={x.id} value={x.id}>{x.name} — {number(x.stock_quantity)} {x.unit} available</option>)}</select></div>
          <div className="field"><label>Quantity per one product *</label><input type="number" min="0.001" step="0.001" value={recipeQty} onChange={e => setRecipeQty(e.target.value)} placeholder="e.g. 200" /></div>
          <div className="field" style={{ alignSelf: "end" }}><button className="btn primary" style={{ width: "100%" }} disabled={!recipeProduct || !recipeIngredient} onClick={addIngredientToRecipe}><Plus size={15}/> Add Ingredient</button></div>
        </div>
        <div className="recipe-draft">
          <div className="recipe-draft-title">Recipe for: {menuRows.find(x => Number(x.id) === Number(recipeProduct))?.name || "Select a product above"}</div>
          {recipeDraft.length ? recipeDraft.map((line, index) => <div className="recipe-line" key={`${line.ingredientProductId}-${index}`}><div><strong>{line.ingredient_name}</strong><small>Quantity consumed for each unit sold</small></div><strong>{number(line.quantity)} {line.unit}</strong><button className="icon-btn" title="Remove ingredient" onClick={() => setRecipeDraft(old => old.filter((_, i) => i !== index))}><Trash2 size={14}/></button></div>) : <div className="empty recipe-empty">No ingredients added. Select a product, choose your ingredients and enter the quantity used for one product.</div>}
        </div>
        <div className="quick-actions" style={{ marginTop: 14 }}><button className="btn primary" disabled={!recipeProduct || !recipeDraft.length || loading} onClick={saveRecipe}><Save size={15}/> Save Product Recipe</button><button className="btn" onClick={() => setRecipeDraft([])}>Clear Recipe Draft</button></div>
        <div className="notice" style={{ marginTop: 14 }}><strong>Example:</strong> Small Pizza = Flour 200 g + Chicken 100 g + Cheese 80 g + Sauce 30 g. Selling 2 Small Pizzas deducts 400 g flour, 200 g chicken, 160 g cheese and 60 g sauce. Large Pizza can have a completely different recipe.</div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><div className="panel-title">4. Saved Product Recipes</div><div className="panel-sub">Review the exact ingredient quantities linked to each product. Remove a line to update the recipe and save it again.</div></div></div>
        <div className="table-wrap"><table><thead><tr><th>Product</th><th>Ingredient</th><th>Quantity per product</th><th>Action</th></tr></thead><tbody>
          {recipeRows.map((row, index) => <tr key={`${row.product_id}-${row.ingredient_product_id}-${index}`}><td><strong>{row.product_name}</strong></td><td>{row.ingredient_name}</td><td>{number(row.quantity)} {row.unit}</td><td><button className="icon-btn" title="Remove ingredient from recipe" onClick={() => run(async () => { const remaining = recipeRows.filter(x => Number(x.product_id) === Number(row.product_id) && Number(x.ingredient_product_id) !== Number(row.ingredient_product_id)); if (remaining.length) await api.saveRecipe(Number(row.product_id), remaining.map(x => ({ ingredientProductId: Number(x.ingredient_product_id), quantity: Number(x.quantity) }))); else await api.deleteRecipe(Number(row.product_id)); setRecipeRows(getRows(await api.recipes())); if (Number(recipeProduct) === Number(row.product_id)) setRecipeDraft(remaining.map(x => ({ ingredientProductId: Number(x.ingredient_product_id), ingredient_name: x.ingredient_name, unit: x.unit, quantity: Number(x.quantity) }))); notify("Recipe ingredient removed."); })}><Trash2 size={14}/></button></td></tr>)}
          {!recipeRows.length && <tr><td colSpan="4" className="empty">No saved recipes yet. Build your first product recipe above.</td></tr>}
        </tbody></table></div>
      </div>

      <div className="panel">
        <div className="panel-title">How automatic deduction works</div>
        <div className="panel-sub" style={{ marginTop: 8, lineHeight: 1.8 }}>When a sale is saved, SliceMaster reads the recipe for every sold product and subtracts the required ingredient quantities from ingredient stock. If available stock is insufficient, checkout is rejected instead of allowing negative stock. Stock deduction must be supported by the matching Electron database and sale handler; this screen uses the existing recipe API.</div>
      </div>
    </>;
  };

  /* ------------------ Content router ------------------ */

  const renderContent = () => {
    if (page === "dashboard") return renderDashboard();
    if (page === "pos") return renderPOS();
    if (page === "deals-stock") return renderDealsStock();
    if (page === "ingredients") return renderIngredients();
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

          <div className="sidebar-bottom" style={{ fontSize: "12px", color: "#9ca3af" }}>
  <div style={{ display: "flex", alignItems: "center", gap: 7, color: "#e5e7eb", fontWeight: 500 }}>
    <ShieldCheck size={14} color="#d5a85c" /> Offline desktop system
  </div>
  <div style={{ marginTop: 5, fontSize: "11px", color: "#9ca3af" }}>
    SliceMaster POS ERP · v3.1.0
  </div>
  <div style={{ marginTop: 8, fontSize: "10px", color: "#6b7280" }}>
    © 2026 POS ERP · Engineered by Hasnain Chohan | 0323-6352450
  </div>
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

            {/* CUSTOMER RECEIPT — optimized for 58mm & 80mm thermal printers */}
      
{printData && (() => {
  const invNo = printData.sale?.invoice_number || printData.sale?.invoice_no || printData.sale?.id || "—";
  const invDate = printData.sale?.created_at ? formatDate(printData.sale.created_at) : new Date().toLocaleString();
  const custName = printData.customerName || printData.sale?.customer_name || "Walk-in Customer";
  const itemsList = Array.isArray(printData.items) ? printData.items : [];
  const totalQty = itemsList.reduce((sum, it) => sum + Number(it.quantity || 0), 0);

  const subtotal = Number(printData.subtotalPaisa ?? 0);
  const discount = Number(printData.discountPaisa ?? 0);
  const tax = Number(printData.taxPaisa ?? 0);
  const total = Number(printData.totalPaisa ?? 0);
  const received = Number(printData.receivedPaisa ?? total);
  const change = Number(printData.changePaisa ?? 0);

  const qrPayload = [
    settings.storeName || "SliceMaster Pizza",
    `Invoice: ${invNo}`,
    `Date: ${invDate}`,
    `Customer: ${custName}`,
    ...itemsList.map(it => {
      const price = Number(it.price_paisa ?? it.unit_price_paisa ?? 0);
      const qty = Number(it.quantity || 0);
      const line = Number(it.line_total_paisa ?? Math.round(price * qty));
      return `${it.name || it.product_name || it.deal_name || "Item"} x${qty} = ${money(line)}`;
    }),
    `Subtotal: ${money(subtotal)}`,
    `Discount: ${money(discount)}`,
    `Tax: ${money(tax)}`,
    `Total: ${money(total)}`,
    `Payment: ${(printData.paymentMethod || "cash").toUpperCase()}`
  ].join("\n");

  return (
    <div className="print-only">
      <div className="receipt-paper">

       <style>{`
  .receipt-paper {
    width: 72mm;
    max-width: 72mm;
    margin: 0 auto;
    box-sizing: border-box;
    background: #fff;
    color: #000;
    padding: 8px 6px;
    font-family: 'Courier New', Courier, monospace !important;
    font-size: 14px !important;
    font-weight: 700;
    line-height: 1.35;
  }

  .receipt-paper * {
    box-sizing: border-box;
    color: #000 !important;
  }

    .receipt-brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #fff !important;
    border: 2.5px solid #000 !important;
    width: 56px;
    height: 56px;
    padding: 0;
    border-radius: 50%;
    margin-bottom: 5px;
  }


  .receipt-store {
    font-size: 18px !important;
    font-weight: 900 !important;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 3px 0 !important;
    white-space: nowrap;
  }

  .receipt-tagline {
    font-size: 13px !important;
    font-weight: 800 !important;
    letter-spacing: 0.5px;
    margin-bottom: 5px !important;
  }

  .receipt-contact {
    font-size: 13px !important;
    font-weight: 700 !important;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }

  .receipt-rule {
    border-top: 1.5px dashed #000 !important;
    margin: 7px 0 !important;
  }

  .receipt-rule-heavy {
    border-top: 2px solid #000 !important;
  }

  .receipt-title {
    text-align: center;
    font-size: 16px !important;
    font-weight: 900 !important;
    letter-spacing: 1px;
    padding: 5px 0 !important;
  }

  .receipt-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    padding: 2px 0 !important;
    font-size: 14px !important;
  }

  .receipt-meta span,
  .receipt-meta strong {
    font-size: 14px !important;
    font-weight: 800 !important;
    white-space: nowrap;
  }

  .receipt-items-head {
    display: flex;
    justify-content: space-between;
    border-top: 1.5px dashed #000 !important;
    border-bottom: 1.5px dashed #000 !important;
    padding: 5px 0 !important;
    font-size: 14px !important;
    font-weight: 900 !important;
    margin-top: 5px !important;
  }

  .receipt-items-head * {
    font-size: 14px !important;
    font-weight: 900 !important;
  }

  .receipt-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 7px;
    padding: 5px 0 !important;
    border-bottom: 1px dotted #555 !important;
    font-size: 14px !important;
  }

  .receipt-item-info {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .receipt-item-info strong {
    display: block;
    font-size: 15px !important;
    font-weight: 900 !important;
  }

  .receipt-item-info small {
    display: block;
    font-size: 13px !important;
    font-weight: 700 !important;
    margin-top: 2px !important;
  }

  .receipt-item > strong {
    white-space: nowrap;
    font-size: 15px !important;
    font-weight: 900 !important;
  }

  .receipt-total-row {
    display: flex;
    justify-content: space-between;
    gap: 5px;
    padding: 2px 0 !important;
    font-size: 14px !important;
  }

  .receipt-total-row span,
  .receipt-total-row strong {
    font-size: 14px !important;
    font-weight: 800 !important;
  }

  .receipt-grand {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 2px solid #000 !important;
    border-bottom: 2px solid #000 !important;
    padding: 7px 2px !important;
    margin: 8px 0 !important;
    gap: 5px;
  }

  .receipt-grand,
  .receipt-grand * {
    font-size: 17px !important;
    font-weight: 900 !important;
    white-space: nowrap;
  }

  .receipt-qr {
    text-align: center;
    border-top: 1.5px dashed #000 !important;
    border-bottom: 1.5px dashed #000 !important;
    padding: 9px 0 !important;
    margin: 9px 0 !important;
  }

  .receipt-qr * {
    font-size: 13px !important;
    font-weight: 800 !important;
  }

  .receipt-qr-frame {
    display: inline-block;
    border: 1.5px solid #000 !important;
    padding: 5px !important;
    background: #fff !important;
  }

  .receipt-thanks {
    font-size: 15px !important;
    font-weight: 900 !important;
    text-align: center;
    margin-top: 8px !important;
  }

  .receipt-message {
    text-align: center;
    font-size: 13px !important;
    font-weight: 700 !important;
    margin-top: 3px !important;
  }

  .receipt-bottom,
  .receipt-bottom * {
    text-align: center;
    font-size: 13px !important;
    font-weight: 700 !important;
    line-height: 1.4 !important;
  }

  .receipt-bottom {
    border-top: 1.5px solid #000 !important;
    padding-top: 6px !important;
    margin-top: 8px !important;
  }

  @media print {
    @page {
      size: 80mm auto;
      margin: 0;
    }

    html, body {
      width: 80mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }

    body * {
      visibility: hidden !important;
    }

    .print-only,
    .print-only * {
      visibility: visible !important;
    }

    .print-only {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 80mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }

    .receipt-paper {
      width: 72mm !important;
      max-width: 72mm !important;
      margin: 0 auto !important;
      padding: 3mm 1.5mm !important;
      overflow: visible !important;
      color: #000 !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .receipt-item,
    .receipt-grand,
    .receipt-total-row,
    .receipt-meta,
    .receipt-bottom {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
  }
`}</style>


{/* BRAND HEADER */}
        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div className="receipt-brand-mark">
            <svg
              width="42"
              height="42"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://w3.org"
              aria-label="Pizza Logo"
            >
              {/* Crust */}
              <path
                d="M10 18C23 11 41 11 54 18L50 25C39 19 25 19 14 25L10 18Z"
                fill="#000000"
                stroke="#000000"
                strokeWidth="3"
                strokeLinejoin="round"
              />
              {/* Pizza Slice Triangle */}
              <path
                d="M14 25L32 56L50 25"
                stroke="#000000"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Pepperoni Toppings */}
              <circle cx="27" cy="31" r="3.5" fill="#000000" />
              <circle cx="38" cy="30" r="3" fill="#000000" />
              <circle cx="32" cy="41" r="3.5" fill="#000000" />
            </svg>
          </div>

          <h2 className="receipt-store">
            {settings.storeName || "SliceMaster Pizza"}
          </h2>

          <div className="receipt-tagline">
            FRESHLY MADE · SERVED WITH LOVE
          </div>

          {settings.showAddress && settings.address && (
            <div className="receipt-contact">{settings.address}</div>
          )}

          {settings.showPhone && settings.phone && (
            <div className="receipt-contact">Tel: {settings.phone}</div>
          )}

          {settings.showEmail && settings.email && (
            <div className="receipt-contact">{settings.email}</div>
          )}
        </div>

        {/* RECEIPT TITLE */}
        <div className="receipt-rule receipt-rule-heavy" />
        <div className="receipt-title">CUSTOMER RECEIPT</div>
        <div className="receipt-rule receipt-rule-heavy" />

        {/* INVOICE DETAILS */}
        <div className="receipt-meta">
          <span>Invoice #</span>
          <strong>{invNo}</strong>
        </div>

        <div className="receipt-meta">
          <span>Date</span>
          <strong>{invDate}</strong>
        </div>

        <div className="receipt-meta">
          <span>Customer</span>
          <strong>{custName}</strong>
        </div>

        {printData.sale?.order_type && (
          <div className="receipt-meta">
            <span>Order Type</span>
            <strong style={{ textTransform: "uppercase" }}>
              {printData.sale.order_type}
            </strong>
          </div>
        )}

        {printData.sale?.table_number && (
          <div className="receipt-meta">
            <span>Table</span>
            <strong>{printData.sale.table_number}</strong>
          </div>
        )}

        {/* ITEMS HEADER */}
        <div className="receipt-items-head">
          <span>ITEM / QTY</span>
          <span>AMOUNT</span>
        </div>

        {/* PRODUCT ITEMS */}
        {itemsList.map((item, index) => {
          const itemName = item.name || item.product_name || item.deal_name || "Product";
          const price = Number(item.price_paisa ?? item.unit_price_paisa ?? 0);
          const qty = Number(item.quantity || 0);
          const line = Number(item.line_total_paisa ?? Math.round(price * qty));

          return (
            <div
              className="receipt-item"
              key={item.id || item.product_id || index}
            >
              <div className="receipt-item-info">
                <strong>{itemName}</strong>
                <small>{qty} × {money(price)}</small>
              </div>
              <strong>{money(line)}</strong>
            </div>
          );
        })}

        {/* TOTALS */}
        <div className="receipt-rule" />

        <div className="receipt-total-row">
          <span>Total Items</span>
          <strong>{totalQty}</strong>
        </div>

        <div className="receipt-total-row">
          <span>Subtotal</span>
          <strong>{money(subtotal)}</strong>
        </div>

        {discount > 0 && (
          <div className="receipt-total-row">
            <span>Discount</span>
            <strong>-{money(discount)}</strong>
          </div>
        )}

        {tax > 0 && (
          <div className="receipt-total-row">
            <span>Tax</span>
            <strong>{money(tax)}</strong>
          </div>
        )}

        {/* GRAND TOTAL */}
        <div className="receipt-grand">
          <span>GRAND TOTAL</span>
          <strong>{money(total)}</strong>
        </div>

        {/* PAYMENT DETAILS */}
        <div className="receipt-total-row">
          <span>Paid ({(printData.paymentMethod || "cash").toUpperCase()})</span>
          <strong>{money(received)}</strong>
        </div>

        <div className="receipt-total-row">
          <span>Change</span>
          <strong>{money(change)}</strong>
        </div>

        {/* QR CODE */}
        <div className="receipt-qr">
          <div className="receipt-qr-frame">
            <QRCodeSVG
              value={qrPayload}
              size={105}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          <div style={{
            fontSize: "9px",
            fontWeight: 900,
            marginTop: 5,
            letterSpacing: "0.5px"
          }}>
            SCAN FOR DIGITAL BILL SUMMARY
          </div>
        </div>

        {/* FOOTER */}
        <div className="receipt-thanks">
          {settings.receiptFooter || "Thank you for visiting!"}
        </div>

        <div className="receipt-message">
          {settings.receiptMessage || "Please visit again."}
        </div>

        {/* DEVELOPER BRANDING */}
        <div className="receipt-bottom">
          <div style={{ fontWeight: 700 }}>
            Powered by  POS ERP · v3.1.0
          </div>

          <div style={{ fontWeight: 900 }}>
            © 2026 POS ERP
          </div>

          <div style={{ fontWeight: 900 }}>
            Engineered by Hasnain Chohan
          </div>

          <div style={{ fontWeight: 700 }}>
            0323-6352450
          </div>
        </div>

      </div>
    </div>
  );
})()}

{toast && <div className="toast">{toast}</div>}
</>
);
}
