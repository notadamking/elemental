# TB123: Teams Must Have Entity Members

## Purpose

Enforce that teams always have at least one member. This prevents the creation of empty teams that clutter the system and have no meaningful purpose. Teams are collections of entities that work together - a team without members is an invalid state.

## Features

### Server-Side Validation

1. **Team Creation Validation**: `POST /api/teams` requires at least one member ID in the request body
2. **Member Removal Prevention**: `PATCH /api/teams/:id` prevents removing members if it would leave the team empty
3. **Can-Remove-Member Check**: `GET /api/teams/:id/can-remove-member/:entityId` endpoint to check if removal is allowed

### Client-Side UI

1. **CreateTeamModal Updates**:
   - Members field marked as required (red asterisk)
   - Helper text when no members selected: "Teams must have at least one member"
   - Create Team button disabled until at least one member is selected
   - Title tooltip on disabled button explains why

2. **TeamDetailPanel Updates**:
   - Warning banner when team has only one member remaining
   - Remove member button disabled for the last member
   - Tooltip on disabled button: "Cannot remove the last member from a team"
   - Remove button enabled and functional when multiple members exist

## Implementation

### Server Endpoints

#### POST /api/teams - Modified Validation
```typescript
// Before: members was optional
// After: members array required with at least one element
if (!members || !Array.isArray(members) || members.length === 0) {
  return c.json({
    error: { code: 'VALIDATION_ERROR', message: 'Teams must have at least one member' }
  }, 400);
}
```

#### PATCH /api/teams/:id - Last Member Prevention
```typescript
// After processing addMembers and removeMembers
if (currentMembers.length === 0) {
  return c.json({
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Cannot remove the last member from a team. Teams must have at least one member.'
    }
  }, 400);
}
```

#### GET /api/teams/:id/can-remove-member/:entityId
Returns:
```typescript
interface CanRemoveMemberResponse {
  canRemove: boolean;
  reason: string | null;
}
```

### Data TestIds

- `last-member-warning`: Warning banner shown when team has only one member
- `remove-member-{entityId}`: Remove member button (disabled when last member)
- `create-team-submit`: Create team button (disabled when no members selected)
- `member-search-input`: Search input for finding entities to add
- `selected-members`: Container for selected member chips in create modal

## Acceptance Criteria

### Server-Side
- [x] POST /api/teams returns 400 if members array is empty or missing
- [x] POST /api/teams returns 400 error message contains "at least one member"
- [x] POST /api/teams succeeds when at least one valid member ID provided
- [x] PATCH /api/teams/:id returns 400 if removeMembers would leave team empty
- [x] PATCH /api/teams/:id error message contains "Cannot remove the last member"
- [x] PATCH /api/teams/:id succeeds when removing members but at least one remains
- [x] GET /api/teams/:id/can-remove-member/:entityId returns { canRemove: false } for last member
- [x] GET /api/teams/:id/can-remove-member/:entityId returns { canRemove: true } when multiple members exist
- [x] GET /api/teams/:id/can-remove-member/:entityId returns { canRemove: false } for non-member

### Client-Side - CreateTeamModal
- [x] Members field shows red asterisk indicating required
- [x] Helper text visible when no members selected
- [x] Create Team button disabled when no members selected
- [x] Create Team button has tooltip explaining why disabled
- [x] Create Team button enabled after selecting a member
- [x] Helper text hidden after selecting a member
- [x] Can successfully create team with members via UI

### Client-Side - TeamDetailPanel
- [x] Warning banner visible when team has exactly one member
- [x] Warning banner not visible when team has multiple members
- [x] Remove button disabled for last member
- [x] Remove button has tooltip "Cannot remove the last member from a team"
- [x] Remove button enabled when multiple members exist
- [x] Remove button has tooltip "Remove from team" when enabled

## Implementation Status

- [x] Server endpoint validation for POST /api/teams
- [x] Server endpoint validation for PATCH /api/teams/:id
- [x] Server endpoint GET /api/teams/:id/can-remove-member/:entityId
- [x] Web: CreateTeamModal requires at least one member
- [x] Web: TeamDetailPanel shows warning for last member
- [x] Web: TeamDetailPanel disables remove button for last member
- [x] Playwright tests (16 tests passing) - `apps/web/tests/tb123-teams-must-have-members.spec.ts`

## Related

- TB121: Plans Must Have Task Children (similar collection integrity pattern)
- TB122: Workflows Must Have Task Children (similar collection integrity pattern)
- TB107: Add Members to Team UI (member management UI)
