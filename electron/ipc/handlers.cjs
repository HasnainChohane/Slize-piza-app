
"use strict";

const { ipcMain } = require("electron");
const db = require("../database/db.cjs");

let registered = false;

function registerIpcHandlers() {
  if (registered) return;

  function handle(channel, callback) {
    ipcMain.removeHandler(channel);

    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        const result = await callback(...args);

        return {
          success: true,
          data: result
        };
      } catch (error) {
        console.error(`[SliceMaster IPC] ${channel}:`, error);

        return {
          success: false,
          error: {
            message: error?.message || "Unexpected database error."
          }
        };
      }
    });
  }

  handle("app:get-info", () => db.getAppInfo());

  handle("database:health", () => db.getDatabaseHealth());

  handle("dashboard:get-summary", () => db.getDashboardSummary());

  handle("records:list", entity =>
    db.listRecords(entity)
  );

  handle("records:create", (entity, data) =>
    db.createRecord(entity, data)
  );

  handle("records:update", (entity, id, data) =>
    db.updateRecord(entity, id, data)
  );

  handle("records:delete", (entity, id) =>
    db.deleteRecord(entity, id)
  );

  handle("sales:list", () =>
    db.listSales()
  );

  handle("sales:create", data =>
    db.createSale(data)
  );

  handle("purchases:create", data =>
    db.createPurchase(data)
  );

  handle("backup:create", () =>
    db.createBackup()
  );

  handle("backup:restore", () =>
    db.restoreBackup()
  );

  registered = true;

  console.log("[SliceMaster] All IPC handlers registered.");
}

module.exports = { registerIpcHandlers };
