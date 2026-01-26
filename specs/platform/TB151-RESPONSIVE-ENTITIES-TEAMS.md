# TB151: Responsive Entities & Teams Pages

## Overview

Make the Entities and Teams pages fully responsive with mobile-optimized layouts, touch-friendly interactions, and full-screen modals on mobile devices.

## Status: Complete

## Implementation Summary

### Components Created

1. **MobileEntityCard** (`apps/web/src/components/entity/MobileEntityCard.tsx`)
   - Card-based entity display for mobile devices
   - 44px minimum touch targets
   - Entity type icon and badge
   - Name with search highlighting
   - ID display (mono font)
   - Active/inactive status badge
   - Tags preview (max 2 with overflow indicator)
   - Chevron indicator for navigation

2. **MobileTeamCard** (`apps/web/src/components/team/MobileTeamCard.tsx`)
   - Card-based team display for mobile devices
   - 44px minimum touch targets
   - Team icon
   - Name with search highlighting
   - ID display (mono font)
   - Member count badge
   - Active/deleted status badge
   - Tags preview (max 2 with overflow indicator)
   - Chevron indicator for navigation

### Pages Updated

1. **EntitiesPage** (`apps/web/src/routes/entities.tsx`)
   - Added `useIsMobile` hook for responsive behavior
   - Mobile: Stacked MobileEntityCard list
   - Desktop: Grid-based EntityCard layout
   - Mobile: MobileDetailSheet for entity details
   - Desktop: Side panel for entity details
   - Responsive header with shortened button text on mobile
   - Responsive filter tabs (horizontally scrollable on mobile)
   - Responsive search box

2. **TeamsPage** (`apps/web/src/routes/teams.tsx`)
   - Added `useIsMobile` hook for responsive behavior
   - Mobile: Stacked MobileTeamCard list
   - Desktop: Grid-based TeamCard layout
   - Mobile: MobileDetailSheet for team details
   - Desktop: Side panel for team details
   - Responsive header with shortened button text on mobile
   - Responsive search box

### Modals Updated

1. **RegisterEntityModal**
   - Full-screen on mobile devices
   - Stacked action buttons on mobile (submit on top, cancel below)
   - Touch-friendly form inputs with larger padding
   - Dark mode support with CSS variables
   - Responsive type selection options

2. **CreateTeamModal**
   - Full-screen on mobile devices
   - Stacked action buttons on mobile
   - Touch-friendly form inputs
   - Dark mode support with CSS variables
   - Touch-friendly member search and selection

## Responsive Behavior

### Mobile (< 640px)
- Full-width stacked card list
- MobileDetailSheet for item details (full-screen overlay)
- Full-screen modals
- Shortened button text ("Add" instead of "Register Entity"/"New Team")
- Horizontally scrollable filter tabs
- Touch targets minimum 44px

### Tablet/Desktop (>= 640px)
- Grid-based card layout (1-3 columns based on viewport)
- Side panel for item details
- Centered dialog modals
- Full button text ("Register Entity", "New Team")
- Inline filter tabs
- Entity/team count visible in header

## Files Changed

- `apps/web/src/routes/entities.tsx` - Responsive entities page
- `apps/web/src/routes/teams.tsx` - Responsive teams page
- `apps/web/src/components/entity/MobileEntityCard.tsx` - New component
- `apps/web/src/components/team/MobileTeamCard.tsx` - New component
- `apps/web/tests/tb151-responsive-entities-teams.spec.ts` - Playwright tests

## Test Coverage

19 Playwright tests covering:
- Mobile entity list display
- Desktop entity grid display
- Full-screen register modal on mobile
- Centered register modal on desktop
- Modal close functionality
- Viewport transitions (desktop to mobile)
- Mobile team list display
- Desktop team grid display
- Full-screen create team modal on mobile
- Centered create team modal on desktop
- Member search in create team modal
- Button text changes based on viewport

## Dependencies

- `useIsMobile` hook from `hooks/useBreakpoint.ts`
- `MobileDetailSheet` component from `components/shared/MobileDetailSheet.tsx`
- Existing `EntityCard` and `TeamCard` components (for desktop)

## Design Decisions

1. **Separate mobile card components**: Rather than conditionally rendering within existing cards, we created dedicated mobile card components for cleaner code and better maintainability.

2. **Full-screen modals on mobile**: Following platform conventions, modals take the full screen on mobile for better usability.

3. **Stacked buttons on mobile**: Action buttons stack vertically with the primary action on top for thumb-friendly access.

4. **CSS variables for theming**: All colors use CSS variables for consistent dark mode support.

5. **Touch target compliance**: All interactive elements maintain minimum 44px touch targets for accessibility.
