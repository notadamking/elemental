# TB60: Settings Page - Keyboard Shortcuts

## Purpose

Allow users to view, customize, and manage keyboard shortcuts through a dedicated settings section. Users can see all available shortcuts, modify bindings to their preferences, and reset to defaults if needed.

## Properties / Structure

### Shortcut Categories

| Category | Description | Examples |
|----------|-------------|----------|
| Navigation | Page navigation shortcuts | G T (Tasks), G P (Plans), G H (Dashboard) |
| Actions | Command shortcuts | Cmd+K (Command Palette), Cmd+B (Toggle Sidebar) |
| Views | View mode shortcuts | V L (List View), V K (Kanban View) |

### Shortcut Types

| Type | Format | Example | Notes |
|------|--------|---------|-------|
| Sequential | Space-separated keys | `G T` | Press keys one after another within 1s |
| Modifier | Plus-separated modifiers + key | `Cmd+K` | Hold modifiers while pressing key |

### Storage

| Key | Type | Description |
|-----|------|-------------|
| `settings.customShortcuts` | `Record<string, string>` | Maps action IDs to custom key bindings |

### Action IDs

| ID | Default Keys | Description |
|----|--------------|-------------|
| `nav.dashboard` | G H | Go to Dashboard |
| `nav.taskFlow` | G F | Go to Task Flow |
| `nav.agents` | G A | Go to Agents |
| `nav.dependencies` | G G | Go to Dependencies |
| `nav.timeline` | G L | Go to Timeline |
| `nav.tasks` | G T | Go to Tasks |
| `nav.plans` | G P | Go to Plans |
| `nav.workflows` | G W | Go to Workflows |
| `nav.messages` | G M | Go to Messages |
| `nav.documents` | G D | Go to Documents |
| `nav.entities` | G E | Go to Entities |
| `nav.teams` | G R | Go to Teams |
| `nav.settings` | G S | Go to Settings |
| `action.commandPalette` | Cmd+K | Open Command Palette |
| `action.toggleSidebar` | Cmd+B | Toggle Sidebar |
| `view.list` | V L | List View |
| `view.kanban` | V K | Kanban View |

## Behavior

### Viewing Shortcuts

1. Navigate to Settings > Shortcuts section
2. All shortcuts displayed grouped by category (Navigation, Actions, Views)
3. Each row shows:
   - Description (e.g., "Go to Tasks")
   - Current binding (e.g., "G T")
   - "Customized" badge if modified from default
   - "Customize" button (visible on hover)

### Customizing a Shortcut

1. Click "Customize" button on any shortcut row
2. Edit modal opens with current binding displayed
3. Click capture area to start key capture
4. Press desired key combination:
   - Sequential: Press keys one by one (e.g., X, then T = "X T")
   - Modifier: Hold modifiers while pressing key (e.g., Cmd+Shift+X)
5. Conflict detection warns if binding already used
6. Click "Save" to confirm (disabled if conflict exists)
7. Click "Reset to Default" to revert single shortcut

### Conflict Detection

When user captures a key combination:
1. System checks if combination matches any other shortcut
2. If conflict found:
   - Warning displayed with conflicting shortcut name
   - Save button disabled
3. User must choose a different combination or cancel

### Reset to Defaults

**Single Shortcut:**
- Click "Reset to Default" in edit modal

**All Shortcuts:**
- "Reset to Defaults" button appears when customizations exist
- Shows confirmation modal before resetting
- Clears all custom shortcuts from localStorage

### Global Shortcut Disabling

When edit modal is open:
- Global keyboard shortcuts are disabled via `useDisableKeyboardShortcuts` hook
- Prevents navigation shortcuts from triggering during key capture

## Implementation Details

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/routes/settings.tsx` | Settings page with ShortcutsSection component |
| `apps/web/src/lib/keyboard.ts` | Shortcut system, DEFAULT_SHORTCUTS, custom shortcut management |
| `apps/web/src/hooks/useKeyboardShortcuts.ts` | Shortcut hooks including useDisableKeyboardShortcuts |

### Components

| Component | Purpose |
|-----------|---------|
| `ShortcutsSection` | Main shortcuts settings section |
| `ShortcutRow` | Individual shortcut display row |
| `ShortcutEditModal` | Modal for capturing and saving new shortcuts |

### Functions Added to keyboard.ts

| Function | Purpose |
|----------|---------|
| `getCustomShortcuts()` | Read custom shortcuts from localStorage |
| `setCustomShortcuts()` | Save custom shortcuts to localStorage |
| `getCurrentBinding(actionId)` | Get current binding (custom or default) |
| `checkShortcutConflict(keys, excludeActionId?)` | Check if binding conflicts |
| `resetAllShortcuts()` | Clear all custom shortcuts |
| `setCustomShortcut(actionId, keys)` | Set single custom shortcut |
| `removeCustomShortcut(actionId)` | Remove custom shortcut |

## Implementation Checklist

- [x] Phase 1: Shortcut Listing
  - [x] Create ShortcutsSection component
  - [x] Group shortcuts by category (Navigation, Actions, Views)
  - [x] Display shortcut description and current binding
  - [x] Add "Customized" badge for modified shortcuts
  - [x] Mark shortcuts section as implemented in SETTINGS_SECTIONS

- [x] Phase 2: Customization Modal
  - [x] Create ShortcutEditModal component
  - [x] Implement key capture area (click to focus)
  - [x] Handle sequential shortcuts (multiple keys)
  - [x] Handle modifier shortcuts (Cmd/Ctrl/Alt/Shift+key)
  - [x] Platform-aware display (⌘ on Mac, Ctrl on Windows/Linux)

- [x] Phase 3: Conflict Detection
  - [x] Add checkShortcutConflict function
  - [x] Show conflict warning in modal
  - [x] Disable save button when conflict exists

- [x] Phase 4: Persistence
  - [x] Add localStorage functions for custom shortcuts
  - [x] Add setCustomShortcut and removeCustomShortcut functions
  - [x] Load custom shortcuts on component mount
  - [x] Update display after save

- [x] Phase 5: Reset Functionality
  - [x] Add "Reset to Default" button in edit modal
  - [x] Add "Reset to Defaults" button (visible when customizations exist)
  - [x] Add confirmation modal for reset all
  - [x] Clear localStorage on reset all

- [x] Phase 6: Testing
  - [x] Playwright tests for shortcuts section visibility (22 tests)
  - [x] Tests for customization flow
  - [x] Tests for conflict detection
  - [x] Tests for persistence
  - [x] Tests for reset functionality

## Limitations & Future Work

1. **Hot Reload:** Custom shortcuts require page refresh to take effect in the keyboard manager. Future enhancement could hot-swap shortcuts.

2. **Keyboard Manager Integration:** The global keyboard shortcuts are registered at app startup. Custom shortcuts stored in localStorage are read but not yet applied to the keyboard manager at runtime.

3. **Search/Filter:** Could add search box to filter shortcuts by name/key.

4. **Export/Import:** Could add ability to export/import shortcut configurations.
