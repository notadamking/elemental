# TB148: Responsive Plans & Workflows Pages

## Status: COMPLETED

## Overview

This ticket implements responsive designs for the Plans and Workflows pages, following the patterns established in TB144-TB147.

## Goals

1. Create mobile-optimized card views for Plans and Workflows lists
2. Add full-screen detail sheets on mobile (using MobileDetailSheet component)
3. Add floating action buttons (FAB) for creating plans and pouring workflows on mobile
4. Make create/pour modals responsive (full-screen on mobile, centered modal on desktop)
5. Adapt header layout for mobile viewports

## Implementation

### Plans Page

#### Mobile Viewport (< 640px)
- Card-based list view using `MobilePlanCard` component
- Full-screen detail sheet when plan is selected (using `MobileDetailSheet`)
- Search bar displayed at full width
- Scrollable status filter
- Floating action button (FAB) for creating plans
- Full-screen create modal with back button navigation

#### Tablet/Desktop Viewport (>= 640px)
- Standard card list view using `PlanListItem` component
- Side panel for plan details
- Header with search bar and create button
- Status filter and view toggle visible
- Centered modal for creating plans

### Workflows Page

#### Mobile Viewport (< 640px)
- Card-based list view using `MobileWorkflowCard` component
- Full-screen detail sheet when workflow is selected (using `MobileDetailSheet`)
- Scrollable status filter
- Floating action button (FAB) for pouring workflows
- Full-screen pour modal with back button navigation

#### Tablet/Desktop Viewport (>= 640px)
- Standard card list view using `WorkflowListItem` component
- Side panel for workflow details
- Header with title and pour button
- Status filter visible
- Centered modal for pouring workflows

## Components Created

### `MobilePlanCard.tsx`
A touch-friendly plan card designed for mobile list views:
- Shows plan title, ID, status badge, and tags
- Progress ring visualization
- 44px minimum touch target
- Search highlighting support

### `MobileWorkflowCard.tsx`
A touch-friendly workflow card designed for mobile list views:
- Shows workflow title, ID, status badge
- Ephemeral indicator badge
- Tags display
- 44px minimum touch target

## Files Modified

- `apps/web/src/routes/plans.tsx` - Added responsive layout, mobile components
- `apps/web/src/routes/workflows.tsx` - Added responsive layout, mobile components
- `apps/web/src/components/plan/MobilePlanCard.tsx` - New mobile card component
- `apps/web/src/components/workflow/MobileWorkflowCard.tsx` - New mobile card component

## Test Coverage

### Playwright Tests (`tb148-responsive-plans-workflows.spec.ts`)

#### Plans Page Tests
- Mobile: Search bar, status filter, card list view, FAB, create modal
- Tablet: Desktop list view, create button, view toggle, side panel
- Desktop: Search bar, status filter, view toggle, desktop list view, create button, side panel
- Viewport transitions: Desktop to mobile adaptation

#### Workflows Page Tests
- Mobile: Status filter, card list view, FAB, pour modal
- Tablet: Desktop list view, pour button
- Desktop: Status filter, desktop list view, pour button
- Viewport transitions: Desktop to mobile adaptation

## Acceptance Criteria

- [x] Plans page shows mobile card view on small screens
- [x] Plans page shows desktop card list on larger screens
- [x] Plans detail panel appears as full-screen sheet on mobile
- [x] Plans detail panel appears as side panel on desktop
- [x] Create Plan FAB visible on mobile, button on desktop
- [x] Create Plan modal is full-screen on mobile, centered on desktop
- [x] Workflows page shows mobile card view on small screens
- [x] Workflows page shows desktop card list on larger screens
- [x] Workflows detail panel appears as full-screen sheet on mobile
- [x] Workflows detail panel appears as side panel on desktop
- [x] Pour Workflow FAB visible on mobile, button on desktop
- [x] Pour Workflow modal is full-screen on mobile, centered on desktop
- [x] All tests pass

## Related Tickets

- TB144: Responsive Foundation & CSS Infrastructure
- TB145: Responsive AppShell & Sidebar
- TB146: Responsive Dashboard Page
- TB147: Responsive Tasks Page
- TB149: Responsive Documents Page (next)
