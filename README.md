# SliceMaster POS ERP

Offline-first desktop application for pizza shop management and business operations.

## Technology
- Electron
- React
- Vite
- Tailwind CSS
- SQLite
- better-sqlite3
- electron-builder

## Requirements
- Windows 10/11 (64-bit)
- Node.js 24.x
- npm
- Visual Studio Build Tools with Desktop development with C++

## Installation
```powershell
npm install
```

## Development
```powershell
npm run dev
```

## Rebuild native SQLite module
```powershell
npm run rebuild
```

## Build Windows installer
```powershell
npm run build
```

The installer output is written to `release/`.

## Current scope
This ZIP contains Phase 1 setup and a minimal Electron/React starter window.
SQLite schema, database operations, IPC business APIs, backup/restore, POS modules,
printing and final packaging refinements are planned for subsequent phases.

The production database will be stored in Electron's `userData` directory,
outside the application installation directory.