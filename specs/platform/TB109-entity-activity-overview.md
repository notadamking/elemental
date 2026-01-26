# TB109: Entity Activity Overview

## Purpose

Enhance the EntityDetailPanel with a rich activity feed that shows recent events by the entity. The activity feed provides quick visibility into what the entity has been doing (tasks completed, messages sent, documents edited), with proper icons, human-readable descriptions, and timestamps. A "View all activity" link navigates to the timeline filtered by that entity.

## Implementation

### Components

#### ActivityFeedItem (`apps/web/src/routes/entities.tsx`)
- Replaces the basic EventItem component
- Shows events with:
  - **Icon**: Event-type and element-type specific icons
    - Task: ListTodo icon (blue)
    - Message: MessageSquare icon (purple)
    - Document: FileText icon (yellow)
    - Created: Plus icon (green)
    - Closed/Completed: CheckCircle icon (green)
    - Deleted: X icon (red)
  - **Icon Background**: Color-coded based on event/element type (e.g., bg-green-100, bg-blue-100)
  - **Description**: Human-readable text like "Completed task", "Sent message", "Edited document"
  - **Timestamp**: Relative time (e.g., "2m ago", "1h ago", "3d ago")
  - **Element ID**: Shown in monospace for reference

#### View All Activity Link
- Appears when entity has events
- Navigates to `/dashboard/timeline?actor=:entityId`
- Uses ChevronRight icon to indicate navigation

### Router Changes (`apps/web/src/router.tsx`)
- Timeline route now accepts `actor` search param
- Validates and passes actor param through URL

### Timeline Integration (`apps/web/src/routes/timeline.tsx`)
- Reads `actor` param from URL search
- Initializes filter state with actor if present
- Syncs filter when URL actor changes via useEffect
- Preserves actor param when navigating between pages

### Navigation Updates
- Sidebar, CommandPalette, Dashboard all updated to include `actor: undefined` in timeline links
- Ensures TypeScript type safety with required search params

## Files Modified

1. `apps/web/src/router.tsx` - Added actor param to timeline route
2. `apps/web/src/routes/timeline.tsx` - Read and apply actor filter from URL
3. `apps/web/src/routes/entities.tsx` - Added ActivityFeedItem, View all activity link
4. `apps/web/src/components/navigation/CommandPalette.tsx` - Updated timeline navigation
5. `apps/web/src/routes/dashboard.tsx` - Updated View all link
6. `apps/web/src/components/layout/Sidebar.tsx` - Updated timeline nav item

## Implementation Checklist

- [x] Create ActivityFeedItem component with icons, descriptions, timestamps
- [x] Add "View all activity" button/link
- [x] Update router to support actor param
- [x] Update timeline page to read actor from URL
- [x] Update all timeline navigation calls
- [x] Write Playwright tests

## Test Coverage

**File:** `apps/web/tests/tb109-entity-activity-overview.spec.ts`

### Tests (10 total, 6 passing, 4 skipped due to no test data)

1. **Activity Feed Display**
   - Recent activity section renders in entity detail panel
   - Activity feed shows loading state initially
   - Activity items display icon, description, and timestamp
   - Activity items show max 10 recent events
   - Activity descriptions are human-readable

2. **View All Activity Link**
   - View all activity button is visible when events exist
   - View all activity navigates to timeline with actor filter
   - Timeline page shows events filtered by actor

3. **Activity Icons**
   - Different event types show different icons

4. **Empty State**
   - Shows "No recent activity" when entity has no events

## Verification

Run tests:
```bash
cd apps/web
npx playwright test tb109-entity-activity-overview.spec.ts
```

Manual verification:
1. Navigate to Entities page
2. Click an entity to open detail panel
3. Scroll to "Recent Activity" section
4. Verify activities show icons, descriptions, timestamps
5. Click "View all activity"
6. Verify navigation to timeline with actor filter in URL
