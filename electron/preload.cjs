
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const desktop = {
  app: {
    getInfo: () => ipcRenderer.invoke("app:get-info")
  },

  database: {
    health: () => ipcRenderer.invoke("database:health")
  },

  dashboard: {
    getSummary: () => ipcRenderer.invoke("dashboard:get-summary")
  },

  records: {
    list: (entity) =>
      ipcRenderer.invoke("records:list", entity),

    create: (entity, data) =>
      ipcRenderer.invoke("records:create", entity, data),

    update: (entity, id, data) =>
      ipcRenderer.invoke("records:update", entity, id, data),

    delete: (entity, id) =>
      ipcRenderer.invoke("records:delete", entity, id)
  },

  sales: {
    list: () => ipcRenderer.invoke("sales:list"),

    create: (data) =>
      ipcRenderer.invoke("sales:create", data)
  },

  purchases: {
    create: (data) =>
      ipcRenderer.invoke("purchases:create", data)
  },

  backup: {
    create: () => ipcRenderer.invoke("backup:create"),

    restore: () => ipcRenderer.invoke("backup:restore")
  }
};

contextBridge.exposeInMainWorld("desktop", desktop);

console.log("[SliceMaster] Desktop API exposed.");
