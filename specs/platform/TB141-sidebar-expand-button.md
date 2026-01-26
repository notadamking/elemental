# TB141: Sidebar Expand Button When Collapsed

**Status:** Implemented
**Last Updated:** 2026-01-25

## Purpose

Provide a visible, accessible way for users to expand the sidebar when it's collapsed, without requiring knowledge of the keyboard shortcut (Cmd+B). This improves accessibility and discoverability for users who:

- Don't have access to a keyboard (mobile/tablet)
- Don't know the keyboard shortcut
- Prefer mouse/touch interactions

## Implementation

### Visual Design

When the sidebar is collapsed:
- An expand button appears at the bottom of the sidebar, below Settings
- Uses the `PanelLeftOpen` icon from lucide-react for clear visual indication
- Styled consistently with other sidebar elements
- Full-width button for easy click/tap target

When the sidebar is expanded:
- The expand button is hidden
- A collapse button appears in the header area (existing behavior)

### Button Behavior

**Expand Button (visible when collapsed):**
- Position: Bottom of sidebar, in its own bordered section
- Icon: `PanelLeftOpen` (5x5, larger than nav icons for visibility)
- Click action: Expands sidebar
- Keyboard: Tab-focusable, activatable with Enter/Space
- Tooltip: "Expand sidebar" with keyboard shortcut hint "⌘B"

**Collapse Button (visible when expanded):**
- Position: Header area, next to logo
- Icon: `ChevronLeft`
- Click action: Collapses sidebar
- Keyboard: Tab-focusable, activatable with Enter/Space

### Accessibility

- `aria-label`: "Expand sidebar" or "Collapse sidebar"
- `aria-expanded`: "false" when collapsed, "true" when expanded
- Focus ring visible on keyboard focus
- Tooltip provides additional context on hover

### Test IDs

| Element | Test ID |
|---------|---------|
| Collapse button (header) | `sidebar-toggle` |
| Expand button (bottom) | `sidebar-expand-button` |

## Files Modified

| File | Changes |
|------|---------|
| `apps/web/src/components/layout/Sidebar.tsx` | Added expand button with tooltip, accessibility attrs |

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/tests/tb141-sidebar-expand-button.spec.ts` | Playwright tests |

## Test Coverage

9 Playwright tests covering:
1. Sidebar starts expanded by default
2. Collapse sidebar hides collapse button and shows expand button
3. Clicking expand button expands the sidebar
4. Expand button has correct accessibility attributes
5. Collapse button has correct accessibility attributes
6. Expand button shows tooltip on hover
7. Expand button is keyboard accessible
8. Cmd+B keyboard shortcut still works for expanding
9. Navigation still works after expanding via button

## Implementation Checklist

- [x] Step 1: Read current sidebar collapse implementation
- [x] Step 2: Add expand button to collapsed sidebar state
- [x] Step 3: Wire button to call `onToggle`
- [x] Step 4: Add tooltip to button
- [x] Step 5: Style button for visual consistency
- [x] Step 6: Add accessibility attributes
- [x] Step 7: Write Playwright tests
- [x] **Verify:** 9 tests passing in `apps/web/tests/tb141-sidebar-expand-button.spec.ts`
