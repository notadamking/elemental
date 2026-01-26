# TB114: Fix Adding Edges in Dependency Graph

## Purpose

Improve the user experience when adding edges (dependencies) in the dependency graph edit mode by adding visual feedback, loading states, and error handling.

## Changes Made

### Visual Feedback
- Added loading spinner in the dependency type picker modal while creating dependency
- Modal header changes from "Add Dependency" to "Creating dependency..." during save
- All type selection buttons are disabled during save to prevent double-clicks

### Toast Notifications
- Success toast shown when dependency is created: "Dependency created" with description of type
- Error toast shown when creation fails with error message

### Implementation Details

**Files Modified:**
- `apps/web/src/routes/dependency-graph.tsx`

**Changes:**
1. Added `Loader2` icon import from lucide-react for loading spinner
2. Added `toast` import from sonner for notifications
3. Enhanced `useAddDependency` mutation with `onSuccess` and `onError` handlers to show toasts
4. Updated `DependencyTypePicker` modal to show loading spinner and status text

## Verification

All 31 Playwright tests pass for the dependency graph:
- Edit Mode toggle button is displayed and functional
- Node selection workflow in Edit Mode
- Dependency type picker workflow
- POST /api/dependencies endpoint creates a dependency
- Error handling for missing fields, duplicates, and not found

## Implementation Checklist

- [x] Web: Debug edge creation flow in edit mode
- [x] Web: Ensure `POST /api/dependencies` is called correctly
- [x] Web: Handle race condition where graph re-renders before edge added (cache invalidation)
- [x] Web: Add visual feedback: "Creating dependency..." loading state
- [x] Web: Add error toast if edge creation fails
- [x] Web: Refresh graph data after successful edge creation
- [x] **Verify:** 31 Playwright tests passing
