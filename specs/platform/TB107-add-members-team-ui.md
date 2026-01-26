# TB107: Add Members to Team UI

**Status:** Implemented
**Last Updated:** 2026-01-25

## Purpose

Allow users to add new members to an existing team through the TeamDetailPanel UI, with search functionality to find entities.

## Implementation

### UI Pattern: Inline Search + Dropdown

Rather than a separate modal, the implementation uses an inline search pattern in the TeamDetailPanel:

1. **Search Input** - Located in the "Team Members" section, shows when team is active
2. **Dropdown Results** - Appears below search when typing, shows matching entities (max 5)
3. **One-Click Add** - Click entity in dropdown to add them immediately
4. **Auto-Clear** - Search field clears after successful add

### Key Files

- `apps/web/src/routes/teams.tsx` - TeamDetailPanel component (lines 1051-1094)
  - `memberSearch` state for search input
  - `availableEntities` memoized list filtering out existing members
  - `handleAddMember()` calls `updateTeam.mutateAsync()` with `addMembers`

### Server Endpoint

`PATCH /api/teams/:id`

```typescript
// Request body
{
  addMembers?: string[];    // Array of entity IDs to add
  removeMembers?: string[]; // Array of entity IDs to remove
  name?: string;            // Optional: update team name
  tags?: string[];          // Optional: update tags
}
```

### Cache Invalidation

On successful member add/remove:
- Invalidates `['teams']` - refreshes teams list
- Invalidates `['teams', id]` - refreshes team detail
- Invalidates `['teams', id, 'members']` - refreshes members list

### Member Display

Members are displayed in a list below the search input, each showing:
- Entity type icon (color-coded)
- Entity name (clickable link via EntityLink)
- Entity type badge
- Remove button (appears on hover)

## Verification

- 67 Playwright tests passing (`apps/web/tests/teams.spec.ts`)
- Tests specifically cover:
  - `team detail panel has add member search`
  - `add member search shows results`
  - `can add member to team via UI`
  - `can remove member from team via UI`
  - `member remove button appears on hover`

## Test IDs

- `add-member-search` - Search input
- `add-member-results` - Dropdown results container
- `add-member-option-{id}` - Individual entity option in dropdown
- `member-item-{id}` - Member row in members list
- `remove-member-{id}` - Remove button for member

## Accessibility

- Search input is keyboard accessible
- Remove buttons appear on hover/focus
- Entity links support keyboard navigation
