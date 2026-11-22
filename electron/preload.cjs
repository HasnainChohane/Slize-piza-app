"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const desktop = {
  app: { getInfo: () => ipcRenderer.invoke("app:get-info") },
  database: { health: () => ipcRenderer.invoke("database:health") },
  dashboard: { getSummary: () => ipcRenderer.invoke("dashboard:get-summary") },
  records: {
    list: entity => ipcRenderer.invoke("records:list", entity),
    create: (entity, data) => ipcRenderer.invoke("records:create", entity, data),
    update: (entity, id, data) => ipcRenderer.invoke("records:update", entity, id, data),
    delete: (entity, id) => ipcRenderer.invoke("records:delete", entity, id)
  },
  sales: {
    list: () => ipcRenderer.invoke("sales:list"),
    create: data => ipcRenderer.invoke("sales:create", data)
  },
  purchases: { create: data => ipcRenderer.invoke("purchases:create", data) },
  deals: {
    list: () => ipcRenderer.invoke("deals:list"),
    create: data => ipcRenderer.invoke("deals:create", data),
    update: (id, data) => ipcRenderer.invoke("deals:update", id, data),
    delete: id => ipcRenderer.invoke("deals:delete", id)
  },
  recipes: {
    list: productId => ipcRenderer.invoke("recipes:list", productId),
    save: (productId, items) => ipcRenderer.invoke("recipes:save", productId, items),
    delete: productId => ipcRenderer.invoke("recipes:delete", productId),
    delete: productId => ipcRenderer.invoke("recipes:delete", productId)
  },
  inventory: {
    adjust: data => ipcRenderer.invoke("inventory:adjust", data),
    movements: limit => ipcRenderer.invoke("inventory:movements", limit)
  },
  reports: {
    analytics: (startDate, endDate) => ipcRenderer.invoke("reports:analytics", startDate, endDate),
    savePdf: html => ipcRenderer.invoke("reports:save-pdf", html)
  },
  backup: {
    create: () => ipcRenderer.invoke("backup:create"),
    restore: () => ipcRenderer.invoke("backup:restore")
  }
};

contextBridge.exposeInMainWorld("desktop", desktop);
console.log("[SliceMaster] Desktop API exposed.");
