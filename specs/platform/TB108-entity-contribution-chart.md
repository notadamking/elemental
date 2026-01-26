# TB108: Entity Contribution Chart Specification

**Version:** 1.0.0
**Last Updated:** 2026-01-25
**Status:** Implemented

## 1. Overview

### 1.1 Purpose

Add a GitHub-style contribution activity chart to the EntityDetailPanel, showing daily activity levels over the past year. This provides a quick visual overview of an entity's activity patterns.

### 1.2 User Story

As a human operator, I want to see a visual representation of an entity's activity over time so that I can quickly understand their work patterns and productivity.

## 2. Technical Specification

### 2.1 API Endpoint

**GET /api/entities/:id/activity**

Returns daily activity counts for the specified entity.

**Query Parameters:**
| Parameter | Type   | Default | Description                        |
|-----------|--------|---------|-----------------------------------|
| days      | number | 365     | Number of days to include in range |

**Response:**
```typescript
interface ActivityResponse {
  entityId: string;
  startDate: string;      // YYYY-MM-DD
  endDate: string;        // YYYY-MM-DD
  totalEvents: number;    // Total events in range
  activity: {
    date: string;         // YYYY-MM-DD
    count: number;        // Number of events on this day
  }[];
}
```

### 2.2 ContributionChart Component

**Location:** `apps/web/src/components/shared/ContributionChart.tsx`

**Props:**
```typescript
interface ContributionChartProps {
  activity: { date: string; count: number }[];
  days?: number;          // Default: 365
  startDate?: string;     // Override start date
  endDate?: string;       // Override end date
  isLoading?: boolean;    // Show loading skeleton
  testId?: string;        // Test ID prefix
}
```

**Features:**
- Grid of squares representing each day (7 rows x ~52 columns for a year)
- Color intensity based on activity level (0-4 scale):
  - Level 0: No activity (gray)
  - Level 1: Low activity (light green)
  - Level 2: Medium activity (green)
  - Level 3: High activity (darker green)
  - Level 4: Very high activity (darkest green)
- Month labels along the top
- Day of week labels along the left side (Mon, Wed, Fri)
- Hover tooltip showing date and exact count
- Legend showing "Less" to "More" color scale
- Total contributions count at bottom

### 2.3 Color Scaling

Activity levels are calculated as ratios of the maximum activity in the displayed range:
- 0%: Level 0
- 1-25%: Level 1
- 26-50%: Level 2
- 51-75%: Level 3
- 76-100%: Level 4

### 2.4 Integration

The chart is added to the EntityDetailPanel's Overview tab, positioned between the Statistics section and the Assigned Tasks section.

## 3. Implementation Details

### 3.1 Files Modified

| File | Changes |
|------|---------|
| `apps/server/src/index.ts` | Added `/api/entities/:id/activity` endpoint |
| `apps/web/src/routes/entities.tsx` | Added `useEntityActivity` hook, imported `ContributionChart`, added Activity section |
| `apps/web/src/components/shared/ContributionChart.tsx` | New component |

### 3.2 Dependencies

No new dependencies required. Uses existing:
- React hooks (useState, useMemo)
- TanStack Query for data fetching

## 4. Test Coverage

**Test File:** `apps/web/tests/tb108-entity-contribution-chart.spec.ts`

| Test | Description |
|------|-------------|
| contribution chart renders in entity detail panel | Verifies chart appears when opening entity |
| contribution chart shows grid of activity squares | Verifies grid container is visible |
| contribution chart shows total contributions count | Verifies total count with "contributions" text |
| contribution chart has activity level legend | Verifies "Less" and "More" labels |
| contribution chart shows loading state initially | Verifies chart loads after initial loading |
| hovering a day square shows tooltip | Verifies tooltip appears on hover |
| day squares have proper data attributes | Verifies data-date, data-count, data-level attributes |
| contribution chart activity header has Activity icon | Verifies section header |
| activity endpoint returns valid data | Verifies API response structure |
| activity endpoint accepts days parameter | Verifies custom days range works |

**Total Tests:** 10 passing

## 5. Visual Design

### 5.1 Layout

```
Activity
┌────────────────────────────────────────────────────┐
│     Jan  Feb  Mar  Apr  May  Jun  Jul  Aug  ...   │
│     ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐  │
│ Mon │░░│██│░░│▓▓│░░│░░│██│░░│░░│▓▓│██│░░│░░│░░│  │
│     ├──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┤  │
│ Wed │░░│░░│▓▓│░░│██│░░│░░│▓▓│░░│░░│░░│▓▓│██│░░│  │
│     ├──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┼──┤  │
│ Fri │▓▓│░░│░░│██│░░│▓▓│░░│░░│██│░░│▓▓│░░│░░│██│  │
│     └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘  │
│                                                    │
│ 142 contributions in the last year    Less ░▓█ More│
└────────────────────────────────────────────────────┘
```

### 5.2 Tooltip

When hovering over a day square:
```
┌──────────────────────┐
│ 5 contributions      │
│ Tue, Jan 14, 2026    │
└──────────────────────┘
```

## 6. Implementation Checklist

- [x] Server: Add `/api/entities/:id/activity` endpoint
- [x] Server: Support `days` query parameter
- [x] Server: Return activity aggregated by date
- [x] Web: Create ContributionChart component
- [x] Web: Add color scaling based on activity level
- [x] Web: Add month labels
- [x] Web: Add day-of-week labels
- [x] Web: Add hover tooltip with date and count
- [x] Web: Add activity legend (Less/More)
- [x] Web: Add total contributions count
- [x] Web: Add useEntityActivity hook
- [x] Web: Integrate chart into EntityDetailPanel
- [x] Web: Add loading state
- [x] Tests: 10 Playwright tests passing
