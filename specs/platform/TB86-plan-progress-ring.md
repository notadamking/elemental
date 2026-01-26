# TB86: Plan Visual Progress Indicator

## Purpose

Replace text-based progress display with visual circular progress rings in the Plans page. This provides a more intuitive, at-a-glance view of plan completion status.

## Components

### ProgressRing Component

Location: `apps/web/src/components/shared/ProgressRing.tsx`

A reusable SVG-based circular progress indicator.

**Props:**

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `percentage` | `number` | required | Completion percentage (0-100) |
| `size` | `'mini' \| 'small' \| 'medium' \| 'large'` | `'medium'` | Predefined size: mini=32px, small=48px, medium=64px, large=80px |
| `customSize` | `number` | - | Override size in pixels |
| `showPercentage` | `boolean` | `true` | Show percentage text in center |
| `status` | `'healthy' \| 'at-risk' \| 'behind'` | - | Manual color status override |
| `autoStatus` | `boolean` | `true` | Auto-determine status from percentage |
| `testId` | `string` | `'progress-ring'` | Test ID for Playwright tests |

**Size Configuration:**

| Size | Diameter | Stroke Width | Font Size |
|------|----------|--------------|-----------|
| mini | 32px | 3px | 8px |
| small | 48px | 4px | 10px |
| medium | 64px | 5px | 12px |
| large | 80px | 6px | 14px |

**Status Colors:**

| Status | Condition | Color |
|--------|-----------|-------|
| healthy | >= 50% or 100% | Green (#22c55e) |
| at-risk | 25-49% | Yellow (#eab308) |
| behind | < 25% | Red (#ef4444) |

### ProgressRingWithBreakdown Component

A wrapper that adds completed/total counts below the ring.

**Props:**

Extends `ProgressRingProps` with:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `completed` | `number` | required | Number of completed items |
| `total` | `number` | required | Total number of items |
| `itemLabel` | `string` | `'tasks'` | Label for the items |

## API Changes

### GET /api/plans

Added `hydrate.progress=true` query parameter support.

**Request:**
```
GET /api/plans?hydrate.progress=true
```

**Response:**
```json
[
  {
    "id": "el-abc123",
    "type": "plan",
    "title": "Q1 Roadmap",
    "status": "active",
    "_progress": {
      "totalTasks": 10,
      "completedTasks": 7,
      "inProgressTasks": 2,
      "blockedTasks": 0,
      "remainingTasks": 1,
      "completionPercentage": 70
    }
  }
]
```

## UI Integration

### PlanListItem

Shows mini (32px) progress ring on the right side of each plan item.

- Plans with tasks: Shows percentage-filled ring with percentage text
- Plans without tasks: Shows dashed circle with "--" text

### PlanDetailPanel

Shows large (80px) progress ring with breakdown information.

Layout:
```
       ┌────────────┐
       │    70%     │  ← Large progress ring
       └────────────┘
       7 of 10 tasks    ← Completed count
       3 remaining      ← Remaining count

   ┌─────────┬─────────┐
   │ ✓ 7     │ ↻ 2     │  ← Task status summary
   │Completed│In Prog  │
   ├─────────┼─────────┤
   │ ⊗ 0     │ ○ 1     │
   │ Blocked │Remaining│
   └─────────┴─────────┘
```

## Test IDs

| Test ID | Element | Location |
|---------|---------|----------|
| `progress-ring` | ProgressRing container | Component |
| `progress-ring-background` | Background circle | Component |
| `progress-ring-progress` | Progress circle | Component |
| `progress-ring-text` | Percentage text | Component |
| `progress-ring-breakdown` | Breakdown container | Component |
| `progress-breakdown-count` | "X of Y tasks" text | Component |
| `progress-breakdown-remaining` | "N remaining" text | Component |
| `plan-progress-{id}` | Mini ring in list | PlanListItem |
| `plan-progress-empty-{id}` | Empty indicator in list | PlanListItem |
| `plan-detail-progress-ring` | Large ring in detail | PlanDetailPanel |
| `plan-progress-section` | Progress section container | PlanDetailPanel |

## Implementation Checklist

- [x] Create `ProgressRing` component with SVG-based rendering
- [x] Create `ProgressRingWithBreakdown` wrapper component
- [x] Add size presets (mini, small, medium, large)
- [x] Add automatic status color coding based on percentage
- [x] Update `/api/plans` to support `hydrate.progress=true`
- [x] Update `usePlans` hook to request progress hydration
- [x] Update `PlanListItem` to show mini progress ring
- [x] Update `PlanDetailPanel` to use `ProgressRingWithBreakdown`
- [x] Remove unused `ProgressBar` component
- [x] Write Playwright tests (10 tests)
- [x] Verify all tests pass

## Playwright Tests

10 tests in `tests/plans.spec.ts`:

1. API: GET /api/plans with hydrate.progress returns plans with progress
2. API: GET /api/plans without hydrate.progress does not include progress
3. UI: Plan list item shows mini progress ring
4. UI: Mini progress ring shows correct percentage
5. UI: Plan detail panel shows large progress ring with breakdown
6. UI: Progress ring breakdown shows correct task counts
7. UI: Progress ring color changes based on percentage
8. UI: Progress ring updates when task is completed
9. UI: Task status summary is still visible alongside progress ring
10. Integration: Plan detail panel shows progress ring (TB86) - updated from TB24

## Dependencies

- No new npm packages required
- Uses existing design tokens from `tokens.css`
- Compatible with dark/light mode theming
