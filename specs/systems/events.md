# Events and Audit Trail Specification

The events system records all mutations to elements, providing a complete audit trail for compliance, debugging, and historical analysis. Events are append-only and immutable, capturing the who, what, and when of every change.

## Purpose

The events system provides:
- Complete audit trail of all changes
- Historical analysis capabilities
- Debugging and troubleshooting support
- Compliance documentation
- Change attribution

## Event Structure

Each event captures a single mutation:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | Auto-incrementing identifier |
| `elementId` | `ElementId` | Element that was changed |
| `eventType` | `EventType` | Category of change |
| `actor` | `EntityId` | Who made the change |
| `oldValue` | `object` | Previous state (partial) |
| `newValue` | `object` | New state (partial) |
| `createdAt` | `Timestamp` | When change occurred |

## Event Types

### Lifecycle Events

| Type | Trigger | Old/New Values |
|------|---------|----------------|
| `created` | Element creation | null / full element |
| `updated` | Element update | changed fields only |
| `closed` | Task/Plan/Workflow closed | status change |
| `reopened` | Closed element reopened | status change |
| `deleted` | Soft delete (tombstone) | status change |

### Dependency Events

| Type | Trigger | Old/New Values |
|------|---------|----------------|
| `dependency_added` | New dependency | null / dependency |
| `dependency_removed` | Dependency removed | dependency / null |

### Tag Events

| Type | Trigger | Old/New Values |
|------|---------|----------------|
| `tag_added` | Tag added | null / tag |
| `tag_removed` | Tag removed | tag / null |

### Membership Events

| Type | Trigger | Old/New Values |
|------|---------|----------------|
| `member_added` | Member joins | null / memberId |
| `member_removed` | Member leaves | memberId / null |

## Value Recording

### Partial Updates

For `updated` events, only changed fields recorded:
- Reduces storage
- Highlights actual changes
- Enables diff computation

### Full State

For `created` events, full element state:
- Complete initial state
- Enables point-in-time reconstruction
- No previous state (null oldValue)

### Computed Diffs

To show changes between versions:
1. Query events in order
2. Apply changes sequentially
3. Compute visual diff if needed

## Actor Attribution

### Actor Field

`actor` is the entity responsible for the change:
- From API call context
- From CLI --actor flag
- From authenticated session
- From system (for automated changes)

### System Actor

Special `system` actor for:
- Automated maintenance
- Cascade effects
- Background processes
- Import operations

## Event Queries

### By Element

All events for a specific element:
- Chronological order
- Filter by event type
- Limit for recent events

### By Actor

All events by a specific entity:
- Track individual contributions
- Audit specific actors
- Attribution reports

### By Time Range

Events within a period:
- Recent activity
- Batch analysis
- Compliance reports

### By Type

Specific event types:
- All task closures
- All deletions
- All dependency changes

## Event Filters

| Filter | Description |
|--------|-------------|
| `eventType` | Single or array of types |
| `actor` | Specific entity |
| `after` | Events after timestamp |
| `before` | Events before timestamp |
| `limit` | Maximum events returned |

## Immutability

Events are append-only:
- No updates allowed
- No deletes allowed
- Provides tamper-evident log
- Enables compliance attestation

### Integrity

Optional integrity features:
- Hash chains (each event hashes previous)
- Periodic checkpoints
- External attestation

## Storage Considerations

### Growth Management

Events accumulate over time:
- Monitor table size
- Consider partitioning (by time)
- Archive old events (future feature)

### Indexes

Essential indexes:
- `element_id` (common lookup)
- `created_at` (time-based queries)
- `actor` (attribution queries)
- `event_type` (type filtering)

### Not Exported

Events are local-only by default:
- Not included in JSONL sync
- Each system has its own audit trail
- Can be exported separately for compliance

## Event Emission

### Synchronous Recording

Events recorded as part of mutation transaction:
- Same transaction as the change
- Guaranteed consistency
- Rollback includes event

### Event Hooks (Future)

Optional post-event hooks:
- Notification triggers
- External system sync
- Real-time updates

## Reconstruction

### Point-in-Time State

Reconstruct element at specific time:
1. Find creation event
2. Apply all events up to target time
3. Return reconstructed state

### Change Timeline

Show element history:
1. Query all events for element
2. Format as timeline
3. Include actor and timestamp

## Implementation Methodology

### Recording Pattern

In every mutation function:
1. Capture old state (if update/delete)
2. Perform mutation
3. Capture new state
4. Record event with states
5. Commit transaction

### Old Value Capture

For updates:
1. Read current element
2. Identify fields being changed
3. Extract current values of those fields
4. Store as oldValue

### New Value Capture

For updates:
1. After mutation
2. Extract only changed fields
3. Store as newValue

For creates:
1. Store full element as newValue

### Transaction Scope

Event and mutation in same transaction:
- Atomic commit
- No orphaned events
- No missing events

## Implementation Checklist

### Phase 1: Type Definitions ✅
- [x] Define `Event` interface
- [x] Define `EventType` union (LifecycleEventType, DependencyEventType, TagEventType, MembershipEventType)
- [x] Define `EventFilter` interface
- [x] Create type guards (isEvent, isEventWithoutId, isValidEventType, isValidEventFilter)
- [x] Create validators (validateEvent, validateEventWithoutId, validateEventType, validateEventFilter, validateEventValue)
- [x] Create factory function (createEvent)
- [x] Create utility functions (isLifecycleEvent, isDependencyEvent, isTagEvent, isMembershipEvent, getEventTypeDisplayName, filterEventsByElement, filterEventsByType, filterEventsByActor, filterEventsByTimeRange, sortEventsByTime, applyEventFilter, computeChangedFields)
- [x] Unit tests (129 tests)

### Phase 2: Schema
- [ ] Create events table
- [ ] Add indexes
- [ ] Test query performance

### Phase 3: Recording
- [ ] Implement event creation
- [ ] Integrate with element mutations
- [ ] Integrate with dependency operations
- [ ] Integrate with tag operations
- [ ] Integrate with membership operations

### Phase 4: Value Capture
- [ ] Implement old value extraction
- [ ] Implement new value extraction
- [ ] Implement diff computation
- [ ] Handle all event types

### Phase 5: Queries
- [ ] Implement getEvents by element
- [ ] Implement getEvents by actor
- [ ] Implement getEvents by time range
- [ ] Implement filtering

### Phase 6: Reconstruction (Optional)
- [ ] Implement point-in-time reconstruction
- [ ] Implement timeline generation
- [ ] Add reconstruction API

### Phase 7: CLI Integration
- [ ] Add events to show command
- [ ] Add history command
- [ ] Add timeline formatting

### Phase 8: Testing
- [ ] Unit tests for event recording
- [ ] Unit tests for value capture
- [ ] Integration tests for full flow
- [ ] Performance tests for high-volume
