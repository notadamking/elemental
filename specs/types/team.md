# Team Type Specification

Teams are collections of related Entities, enabling group-based operations, assignment, and organization. Entities can belong to multiple Teams, and Teams can be used for task assignment, metrics aggregation, and access control patterns.

## Purpose

Teams provide:
- Entity grouping and organization
- Group-based task assignment
- Metrics aggregation at team level
- Collaboration unit definition
- Capability-based organization

## Properties

### Content

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Team name, 1-100 characters |
| `descriptionRef` | `DocumentId` | No | Reference to description Document |

### Membership

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `members` | `EntityId[]` | Yes | Current team members |

## Membership Model

### Member Storage

Members stored directly in team as array:
- Simple access pattern
- Efficient for small/medium teams
- Array operations for add/remove

### Multi-Membership

Entities can belong to multiple Teams:
- Frontend Team and Senior Developers
- Agent Pool and Specialized Agents
- No exclusivity constraints

### Member Types

All entity types can be team members:
- Agents: AI agents working together
- Humans: Human team members
- Systems: Service accounts (less common)

## Team Operations

### Create Team

1. Validate name uniqueness
2. Create team element
3. Initialize empty members array
4. Emit creation event

### Add Member

1. Verify entity exists
2. Verify entity not already member
3. Add entity ID to members array
4. Emit `member_added` event

### Remove Member

1. Verify entity is member
2. Remove entity ID from members array
3. Emit `member_removed` event
4. Entity continues to exist

### Dissolve Team

1. Clear members array (or leave for history)
2. Delete team element
3. Members continue to exist
4. Emit deletion event

## Team Assignment

Teams enable group-based task assignment:

### Assign to Team

Instead of assigning to individual:
- Set `assignee` to team ID
- Any team member can claim work
- First to start becomes effective assignee

### Claim Mechanism

When team-assigned task is started:
1. Team member claims task
2. Update `assignee` to individual
3. Preserve team reference in metadata (optional)
4. Continue as individual assignment

### Pool Pattern

Teams as work pools:
- Tasks assigned to team
- Agents query "ready tasks for my teams"
- Claim and execute
- Load balancing via racing

## Metrics Aggregation

Teams enable aggregate tracking:

### Team Metrics

| Metric | Description |
|--------|-------------|
| Tasks Completed | Tasks closed by team members |
| Tasks In Progress | Active tasks for team |
| Average Cycle Time | Time from open to close |
| Throughput | Tasks per time period |

### Attribution

When aggregating:
- Include tasks assigned to team
- Include tasks assigned to team members
- Handle reassignment appropriately

## Query Patterns

### Team Queries

- List all teams
- List teams by member (entity)
- Get team by name
- Search teams

### Member Queries

- List members of team
- Check membership (is entity in team)
- Count members

### Task Queries

- Tasks assigned to team
- Tasks assigned to team members
- Ready tasks for team

## Use Cases

### Agent Pool

Multiple agents working on similar tasks:
- Create "Backend Agents" team
- Add all backend-capable agents
- Assign backend tasks to team
- Agents claim and execute

### Human-Agent Collaboration

Mixed teams:
- Create "Code Review" team
- Add reviewing agents and humans
- Humans handle edge cases
- Agents handle routine reviews

### Capability Groups

Organizing by capability:
- "Database Experts" team
- "Security Specialists" team
- Route tasks by required capability
- Match task needs to team capabilities

### Organizational Units

Mapping to org structure:
- "Platform Team"
- "Product Team"
- Assign ownership at team level
- Report by organizational unit

## Implementation Methodology

### Storage

Teams stored in `elements` table:
- `type = 'team'`
- Type-specific fields in JSON `data`
- Members as JSON array

### Member Operations

Array manipulation on members field:
- Add: Push to array
- Remove: Filter from array
- Check: Includes in array

### Membership Queries

For "teams containing entity":
1. Query all teams
2. Filter where members includes entity
3. Or: JSON array contains query (if supported)

### Task Queries

For "tasks for team":
1. Get team members
2. Query tasks where assignee in team members
3. OR assignee equals team ID

## Implementation Checklist

### Phase 1: Type Definitions ✅
- [x] Define `Team` interface extending `Element`
- [x] Define `HydratedTeam` interface
- [x] Define `TeamId` branded type
- [x] Create type guards (`isTeam`, `validateTeam`)

### Phase 2: Basic Operations ✅
- [x] Implement team creation (`createTeam`)
- [x] Implement team update (name, description) (`updateTeam`)
- [x] Implement team deletion (soft delete pattern)

### Phase 3: Membership ✅
- [x] Implement add member (`addMember`)
- [x] Implement remove member (`removeMember`)
- [x] Implement membership check (`isMember`)
- [x] Implement `getMemberCount`
- [x] Create `MembershipError` for membership operations
- [x] Add membership events (requires event system integration)

### Phase 4: Queries ✅
- [x] Implement team listing utilities (`filterByCreator`, `filterWithDescription`, etc.)
- [x] Implement teams-by-member query (`filterByMember`, `getTeamsForEntity`)
- [x] Implement member listing (`getAllMembers`, `getCommonMembers`)
- [x] Implement team search (`searchByName`, `findByName`, `findById`)
- [x] Implement uniqueness check (`isNameUnique`)
- [x] Implement sorting utilities (`sortByName`, `sortByMemberCount`, `sortByCreationDate`, `sortByUpdateDate`)
- [x] Implement grouping utilities (`groupByCreator`)
- [x] Implement team comparison (`haveCommonMembers`, `getCommonMembers`)

### Phase 5: Task Integration ✅
- [x] Support team as assignee
- [x] Implement tasks-for-team query (`getTasksForTeam`)
- [x] Implement claim mechanism (`claimTaskFromTeam`)

### Phase 6: Metrics ✅
- [x] Implement task aggregation
- [x] Implement throughput calculation
- [x] Add metrics endpoint (`getTeamMetrics`)

### Phase 7: CLI Commands ✅
- [x] team create
- [x] team add (member)
- [x] team remove (member)
- [x] team delete (soft delete)
- [x] team list
- [x] team members

### Phase 8: Testing ✅
- [x] Unit tests for type definitions and validation (141 tests)
- [x] Unit tests for membership operations
- [x] Unit tests for queries and utility functions
- [x] Integration tests for task assignment
- [x] E2E tests for team workflows

## Known Issues

Issues discovered during manual testing (2026-01-24):

| Task ID | Issue | Spec vs Actual |
|---------|-------|----------------|
| el-4lug | Duplicate team names allowed | Spec says "Validate name uniqueness" but not enforced in CLI |
| el-11d5 | Remove non-member succeeds | Spec says "Verify entity is member" but not enforced in CLI |
| el-8cz4 | Delete team with members succeeds | Spec says "Dissolve Team" should handle members, but no --force required |
| el-5ske | No --name filter for team list | Spec says "Get team by name" but CLI lacks --name filter |

These issues indicate the CLI implementation diverges from the specification. The service layer may have the validation but CLI layer bypasses it.
