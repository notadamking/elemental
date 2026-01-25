# TB63: Settings Page - Sync Config

**Status:** Implemented

## Purpose

Provide a sync settings section in the Settings page that allows users to export and import their Elemental data as JSONL files. This enables:
- Manual backup of data
- Version control of element data via git
- Sharing data across machines
- Data recovery and restoration

## Components

### Server Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/status` | GET | Get current sync status (dirty count, export path) |
| `/api/sync/export` | POST | Export all elements and dependencies to JSONL files |
| `/api/sync/import` | POST | Import elements and dependencies from JSONL content |

### SyncSection Component

The settings page includes a Sync section (`settings.tsx`) with:

1. **Status Display**
   - Export path (read-only, shows `.elemental/` directory)
   - Dirty element count (elements with unsaved changes)
   - Last export timestamp
   - Last import timestamp

2. **Auto-Export Toggle** (disabled, feature coming soon)
   - Enable/disable automatic JSONL export
   - Persisted in localStorage

3. **Export Section**
   - "Export Now" button
   - Shows export result with counts
   - Updates last export time

4. **Import Section**
   - "Import from File" button
   - Hidden file input for `.jsonl` files
   - Multiple file selection (elements + dependencies)
   - Shows import result with counts/conflicts/errors

## Data Flow

### Export
1. User clicks "Export Now"
2. Frontend calls `POST /api/sync/export`
3. Server uses SyncService to export all elements
4. JSONL files written to `.elemental/` directory
5. Success result returned with counts
6. Last export time saved to localStorage

### Import
1. User clicks "Import from File"
2. File picker opens for `.jsonl` files
3. User selects elements.jsonl (and optionally dependencies.jsonl)
4. Frontend reads file contents
5. Frontend calls `POST /api/sync/import` with content
6. Server uses SyncService to merge/import
7. Result returned with counts/conflicts
8. All queries invalidated to refresh UI

## Storage Keys

| Key | Type | Description |
|-----|------|-------------|
| `settings.sync` | SyncSettings | Auto-export toggle, last export/import timestamps |

```typescript
interface SyncSettings {
  autoExport: boolean;
  lastExportAt?: string;
  lastImportAt?: string;
}
```

## Test IDs

| Test ID | Element |
|---------|---------|
| `settings-sync-section` | Main sync section container |
| `export-path` | Export path display |
| `dirty-element-count` | Pending changes count |
| `last-export-time` | Last export timestamp |
| `last-import-time` | Last import timestamp |
| `auto-export-toggle` | Auto-export toggle switch |
| `export-now-button` | Manual export button |
| `export-result` | Export success message |
| `import-button` | Import from file button |
| `import-file-input` | Hidden file input |
| `import-result` | Import result message |

## Implementation Checklist

- [x] Server: Add `GET /api/sync/status` endpoint
- [x] Server: Add `POST /api/sync/export` endpoint
- [x] Server: Add `POST /api/sync/import` endpoint
- [x] Web: Create SyncSection component
- [x] Web: Implement status display with useQuery
- [x] Web: Implement export with useMutation
- [x] Web: Implement import with file picker
- [x] Web: Add auto-export toggle (disabled for now)
- [x] Web: Persist settings in localStorage
- [x] Web: Add all test IDs
- [x] Test: Write Playwright tests (12 tests)
- [x] Verify: All tests passing

## Playwright Tests

12 tests covering:
- Sync section visibility
- Status information display
- Export button presence
- Import button presence
- Auto-export toggle (disabled state)
- Export trigger and result
- Export result counts
- Last export time update
- LocalStorage persistence
- Persistence after reload
- Hidden file input
- Loading state during export
