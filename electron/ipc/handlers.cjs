
"use strict";

const { ipcMain, dialog, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const db = require("../database/db.cjs");

let registered = false;

/* -------------------------------------------------------
   IPC RESPONSE HANDLER
------------------------------------------------------- */

function handle(channel, callback) {
  ipcMain.removeHandler(channel);

  ipcMain.handle(channel, async (event, ...args) => {
    try {
      const data = await callback(...args, event);

      return {
        success: true,
        data
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

/* -------------------------------------------------------
   REGISTER ALL IPC HANDLERS
------------------------------------------------------- */

function registerIpcHandlers() {
  if (registered) return;

  /* APPLICATION */

  handle("app:get-info", () => {
    return db.getAppInfo();
  });

  /* DATABASE */

  handle("database:health", () => {
    return db.getDatabaseHealth();
  });

  handle("dashboard:get-summary", () => {
    return db.getDashboardSummary();
  });

  /* GENERAL RECORDS */

  handle("records:list", (entity) => {
    return db.listRecords(entity);
  });

  handle("records:create", (entity, data) => {
    return db.createRecord(entity, data);
  });

  handle("records:update", (entity, id, data) => {
    return db.updateRecord(entity, id, data);
  });

  handle("records:delete", (entity, id) => {
    return db.deleteRecord(entity, id);
  });

  /* SALES */

  handle("sales:list", () => {
    return db.listSales();
  });

  handle("sales:create", (data) => {
    return db.createSale(data);
  });

  /* PURCHASES */

  handle("purchases:create", (data) => {
    return db.createPurchase(data);
  });

  /* DEALS */

  handle("deals:list", () => {
    return db.listDeals();
  });

  handle("deals:create", (data) => {
    return db.createDeal(data);
  });

  handle("deals:update", (id, data) => {
    return db.updateDeal(id, data);
  });

  handle("deals:delete", (id) => {
    return db.deleteDeal(id);
  });

  /* PRODUCT RECIPES */

  handle("recipes:list", (productId) => {
    return db.listRecipes(productId);
  });

  handle("recipes:save", (productId, items) => {
    return db.saveRecipe(productId, items);
  });

  handle("recipes:delete", (productId) => {
    return db.deleteRecipe(productId);
  });

  /* INVENTORY */

  handle("inventory:adjust", (data) => {
    return db.adjustStock(data);
  });

  handle("inventory:movements", (limit) => {
    return db.getStockMovements(limit);
  });

  /* REPORTS */

  handle("reports:analytics", (startDate, endDate) => {
    return db.getAnalytics(startDate, endDate);
  });

  /* PDF REPORT EXPORT */

  handle("reports:save-pdf", async (html, event) => {
    if (typeof html !== "string") {
      throw new Error("Invalid PDF report content.");
    }

    if (html.length < 100 || html.length > 5 * 1024 * 1024) {
      throw new Error("PDF report content size is invalid.");
    }

    const parentWindow = BrowserWindow.fromWebContents(event.sender);

    const result = await dialog.showSaveDialog(parentWindow, {
      title: "Save SliceMaster Report",
      defaultPath: path.join(
        appDocumentsPath(),
        "SliceMaster-Report.pdf"
      ),
      filters: [
        {
          name: "PDF Documents",
          extensions: ["pdf"]
        }
      ]
    });

    if (result.canceled || !result.filePath) {
      return {
        canceled: true,
        saved: false
      };
    }

    let printWindow;

    try {
      printWindow = new BrowserWindow({
        show: false,
        width: 1200,
        height: 900,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      });

      const encodedHtml = Buffer.from(html, "utf8").toString("base64");

      await printWindow.loadURL(
        `data:text/html;base64,${encodedHtml}`
      );

      const pdfBuffer = await printWindow.webContents.printToPDF({
        pageSize: "A4",
        printBackground: true,
        margins: {
          top: 0.4,
          bottom: 0.4,
          left: 0.4,
          right: 0.4
        }
      });

      await fs.writeFile(result.filePath, pdfBuffer);

      return {
        canceled: false,
        saved: true,
        path: result.filePath,
        filename: path.basename(result.filePath)
      };
    } finally {
      if (printWindow && !printWindow.isDestroyed()) {
        printWindow.close();
      }
    }
  });

  /* BACKUP AND RESTORE */

  handle("backup:create", () => {
    return db.createBackup();
  });

  handle("backup:restore", () => {
    return db.restoreBackup();
  });

  registered = true;

  console.log("[SliceMaster] All IPC handlers registered.");
}

/* -------------------------------------------------------
   HELPERS
------------------------------------------------------- */

function appDocumentsPath() {
  const { app } = require("electron");

  return app.getPath("documents");
}

/* -------------------------------------------------------
   EXPORTS
------------------------------------------------------- */

module.exports = {
  registerIpcHandlers
};
