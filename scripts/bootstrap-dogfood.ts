#!/usr/bin/env bun
/**
 * Bootstrap script for dogfooding - creates the Plan and all remaining tasks
 * with proper notes referencing specs.
 */

import { createStorage, initializeSchema } from '../src/storage/index.js';
import { createElementalAPI } from '../src/api/elemental-api.js';
import { createPlan, PlanStatus } from '../src/types/plan.js';
import { createTask, TaskStatus, Priority, Complexity } from '../src/types/task.js';
import type { ElementId, EntityId } from '../src/types/element.js';

const ACTOR = 'operator' as EntityId;

// All remaining tasks from specs/README.md
const REMAINING_TASKS = [
  // Storage & Infrastructure (Priority: High)
  {
    title: 'systems/storage.md Phase 4: Browser backend (sql.js adapter, OPFS integration, WASM loading)',
    priority: 2 as Priority,
    notes: 'Spec: specs/systems/storage.md\nImplement browser storage backend using sql.js with OPFS for persistence.',
    tags: ['storage', 'browser'],
  },
  {
    title: 'systems/id-generation.md Phase 3: Storage integration (element count query, length caching)',
    priority: 3 as Priority,
    notes: 'Spec: specs/systems/id-generation.md\nIntegrate ID generation with storage for element count queries and length caching.',
    tags: ['id', 'storage'],
  },

  // Sync System (Priority: High)
  {
    title: 'api/sync.md Phase 8: Browser sync (HTTP endpoints, browser export/import)',
    priority: 3 as Priority,
    notes: 'Spec: specs/api/sync.md\nImplement HTTP endpoints for browser-based sync operations.',
    tags: ['sync', 'browser'],
  },

  // Type Integration (Priority: Medium)
  {
    title: 'types/task.md Phase 5: Further dependency system integration (dependency-based priority, complexity inheritance)',
    priority: 3 as Priority,
    notes: 'Spec: specs/types/task.md\nAdd dependency-based priority calculation and complexity inheritance.',
    tags: ['task', 'dependencies'],
  },
  {
    title: 'types/document.md Phase 6: Integration with Task, Message, Library (description, design, content, attachments)',
    priority: 3 as Priority,
    notes: 'Spec: specs/types/document.md\nIntegrate Document refs with Task (description, design), Message (content, attachments), and Library (parent-child).',
    tags: ['document', 'integration'],
  },

  // Collection Type Integration (Priority: Medium)
  {
    title: 'types/plan.md Phase 6: Plan listing, tasks-in-plan query, progress in results',
    priority: 3 as Priority,
    notes: 'Spec: specs/types/plan.md\nAdd CLI listing for plans with task counts and progress display.',
    tags: ['plan', 'cli'],
  },
  {
    title: 'types/workflow.md Phase 2-3: Auto-completion/failure detection, pouring (playbook loading, variable resolution, condition evaluation, task creation, dependency wiring)',
    priority: 2 as Priority,
    notes: 'Spec: specs/types/workflow.md\nImplement workflow pouring: load playbook, resolve variables, evaluate conditions, create tasks, wire dependencies.',
    tags: ['workflow', 'playbook'],
  },
  {
    title: 'types/workflow.md Phase 4-5: Ephemeral support (filtering, burn, GC), task-to-workflow linking',
    priority: 3 as Priority,
    notes: 'Spec: specs/types/workflow.md\nAdd ephemeral workflow support with burn, garbage collection, and task linking.',
    tags: ['workflow', 'ephemeral'],
  },
  {
    title: 'types/workflow.md Phase 6: Workflow queries (listing, tasks-in-workflow, ready tasks)',
    priority: 4 as Priority,
    notes: 'Spec: specs/types/workflow.md\nAdd workflow listing and query capabilities.',
    tags: ['workflow', 'queries'],
  },
  {
    title: 'types/playbook.md Phase 5: Inheritance (playbook loading, chain resolution, variable/step merging)',
    priority: 3 as Priority,
    notes: 'Spec: specs/types/playbook.md\nImplement playbook inheritance with extends chain resolution.',
    tags: ['playbook', 'inheritance'],
  },
  {
    title: 'types/playbook.md Phase 6: YAML support (schema, parser, file discovery)',
    priority: 3 as Priority,
    notes: 'Spec: specs/types/playbook.md\nAdd YAML playbook file support with schema validation.',
    tags: ['playbook', 'yaml'],
  },
  {
    title: 'types/playbook.md Phase 7: Pour-time validation, validation CLI command',
    priority: 4 as Priority,
    notes: 'Spec: specs/types/playbook.md\nAdd playbook validation at pour-time and CLI validate command.',
    tags: ['playbook', 'validation'],
  },
  {
    title: 'types/channel.md Phase 2-4: Find-or-create logic, name uniqueness, membership operations (add, remove, leave), membership events',
    priority: 3 as Priority,
    notes: 'Spec: specs/types/channel.md\nImplement channel membership operations and find-or-create logic.',
    tags: ['channel', 'membership'],
  },
  {
    title: 'types/channel.md Phase 6: Message integration (sender membership validation, direct message helper, auto-create direct channels)',
    priority: 3 as Priority,
    notes: 'Spec: specs/types/channel.md\nIntegrate channels with message sending including membership validation.',
    tags: ['channel', 'message'],
  },
  {
    title: 'types/message.md Phase 3-5: Channel membership validation, Document reference validation, thread integrity, content/attachments hydration',
    priority: 3 as Priority,
    notes: 'Spec: specs/types/message.md\nAdd message validation for channel membership, document refs, and thread integrity.',
    tags: ['message', 'validation'],
  },
  {
    title: 'types/library.md Phase 2-5: Library deletion, document association (add, remove, multi-membership, listing), hierarchy (nesting, cycle detection, queries), root listing, statistics',
    priority: 4 as Priority,
    notes: 'Spec: specs/types/library.md\nImplement library document management with hierarchy support.',
    tags: ['library', 'hierarchy'],
  },
  {
    title: 'types/team.md Phase 2-6: Team deletion, membership events, task integration (team as assignee, tasks-for-team, claim mechanism), metrics',
    priority: 4 as Priority,
    notes: 'Spec: specs/types/team.md\nImplement team task integration with claim mechanism and metrics.',
    tags: ['team', 'task'],
  },

  // Events & Audit (Priority: Medium)
  {
    title: 'systems/events.md Phase 3: Membership operations integration (blocked on collection types)',
    priority: 4 as Priority,
    notes: 'Spec: specs/systems/events.md\nAdd event recording for membership operations (requires collection types).',
    tags: ['events', 'membership'],
  },
  {
    title: 'systems/events.md Phase 6: Reconstruction (point-in-time state, timeline generation, reconstruction API)',
    priority: 4 as Priority,
    notes: 'Spec: specs/systems/events.md\nImplement event reconstruction for point-in-time state queries.',
    tags: ['events', 'reconstruction'],
  },

  // CLI Commands (Priority: Medium)
  {
    title: 'api/cli.md Phase 5: Collection commands (plan create/list/show/close, workflow pour/list/show/burn/squash/gc, playbook list/show/validate/create, channel create/join/leave/list/members, library create/list/add/remove, team create/add/remove/list/members)',
    priority: 2 as Priority,
    notes: 'Spec: specs/api/cli.md\nImplement CLI commands for all collection types.',
    tags: ['cli', 'collections'],
  },
  {
    title: 'api/cli.md Phase 8: Shell completion, command aliases',
    priority: 5 as Priority,
    notes: 'Spec: specs/api/cli.md\nAdd shell completion scripts and command aliases.',
    tags: ['cli', 'completion'],
  },
  {
    title: 'types/message.md Phase 7: CLI commands (send, thread)',
    priority: 4 as Priority,
    notes: 'Spec: specs/types/message.md\nImplement message send and thread CLI commands.',
    tags: ['cli', 'message'],
  },

  // Error Handling & Validation (Priority: Low)
  {
    title: 'api/errors.md Phase 6: Documentation (common causes, resolutions, examples)',
    priority: 5 as Priority,
    notes: 'Spec: specs/api/errors.md\nDocument error codes with common causes and resolutions.',
    tags: ['errors', 'docs'],
  },

  // Testing & Performance (Priority: Low)
  {
    title: 'systems/storage.md Phase 8: Cross-runtime compatibility tests',
    priority: 5 as Priority,
    notes: 'Spec: specs/systems/storage.md\nAdd tests verifying storage works across Bun, Node, and browser.',
    tags: ['storage', 'testing'],
  },
  {
    title: 'systems/dependencies.md Phase 8: Performance tests for large dependency graphs',
    priority: 5 as Priority,
    notes: 'Spec: specs/systems/dependencies.md\nAdd performance benchmarks for dependency graph operations.',
    tags: ['dependencies', 'testing'],
  },
  {
    title: 'api/query-api.md Phase 5: Optimize batch fetching',
    priority: 4 as Priority,
    notes: 'Spec: specs/api/query-api.md\nOptimize batch fetching for list operations.',
    tags: ['api', 'performance'],
  },
  {
    title: 'api/query-api.md Phase 8: Performance tests for queries',
    priority: 5 as Priority,
    notes: 'Spec: specs/api/query-api.md\nAdd performance benchmarks for query operations.',
    tags: ['api', 'testing'],
  },
  {
    title: 'types/task.md Phase 6: Unit tests for ready/blocked computation with dependencies, E2E tests for task lifecycle',
    priority: 5 as Priority,
    notes: 'Spec: specs/types/task.md\nAdd comprehensive tests for ready/blocked computation.',
    tags: ['task', 'testing'],
  },
  {
    title: 'types/message.md Phase 8: Integration tests for threading, E2E tests for message flows',
    priority: 5 as Priority,
    notes: 'Spec: specs/types/message.md\nAdd integration tests for message threading.',
    tags: ['message', 'testing'],
  },
  {
    title: 'types/document.md Phase 7: E2E tests for Document lifecycle',
    priority: 5 as Priority,
    notes: 'Spec: specs/types/document.md\nAdd E2E tests for document versioning lifecycle.',
    tags: ['document', 'testing'],
  },
  {
    title: 'types/entity.md Phase 7: E2E tests for entity lifecycle',
    priority: 5 as Priority,
    notes: 'Spec: specs/types/entity.md\nAdd E2E tests for entity registration and updates.',
    tags: ['entity', 'testing'],
  },
  {
    title: 'types/plan.md Phase 8: Unit tests for status transitions, progress calculation; integration tests; E2E tests',
    priority: 5 as Priority,
    notes: 'Spec: specs/types/plan.md\nAdd comprehensive tests for plan operations.',
    tags: ['plan', 'testing'],
  },
  {
    title: 'types/workflow.md Phase 8: Unit tests for pouring logic; integration tests for full pour flow; E2E tests',
    priority: 5 as Priority,
    notes: 'Spec: specs/types/workflow.md\nAdd comprehensive tests for workflow pouring.',
    tags: ['workflow', 'testing'],
  },
  {
    title: 'types/playbook.md Phase 9: Unit tests for inheritance; integration tests for full pour; E2E tests',
    priority: 5 as Priority,
    notes: 'Spec: specs/types/playbook.md\nAdd comprehensive tests for playbook inheritance.',
    tags: ['playbook', 'testing'],
  },
  {
    title: 'types/channel.md Phase 9: Integration tests for membership; E2E tests for messaging flow',
    priority: 5 as Priority,
    notes: 'Spec: specs/types/channel.md\nAdd integration tests for channel membership flows.',
    tags: ['channel', 'testing'],
  },
  {
    title: 'types/library.md Phase 7: Unit tests for association/hierarchy; integration tests; E2E tests',
    priority: 5 as Priority,
    notes: 'Spec: specs/types/library.md\nAdd comprehensive tests for library hierarchy.',
    tags: ['library', 'testing'],
  },
  {
    title: 'types/team.md Phase 8: Integration tests for task assignment; E2E tests for team workflows',
    priority: 5 as Priority,
    notes: 'Spec: specs/types/team.md\nAdd integration tests for team task assignment.',
    tags: ['team', 'testing'],
  },
  {
    title: 'api/errors.md Phase 7: Integration tests for propagation, CLI output tests',
    priority: 5 as Priority,
    notes: 'Spec: specs/api/errors.md\nAdd tests for error propagation and CLI formatting.',
    tags: ['errors', 'testing'],
  },
];

// Dependencies: source is blocked by target
const DEPENDENCIES: Array<{ sourceTitle: string; targetTitle: string }> = [
  // Browser sync blocked by browser storage
  {
    sourceTitle: 'api/sync.md Phase 8: Browser sync (HTTP endpoints, browser export/import)',
    targetTitle: 'systems/storage.md Phase 4: Browser backend (sql.js adapter, OPFS integration, WASM loading)',
  },
  // Workflow pouring blocked by playbook YAML
  {
    sourceTitle: 'types/workflow.md Phase 2-3: Auto-completion/failure detection, pouring (playbook loading, variable resolution, condition evaluation, task creation, dependency wiring)',
    targetTitle: 'types/playbook.md Phase 6: YAML support (schema, parser, file discovery)',
  },
  // Ephemeral workflows blocked by workflow pouring
  {
    sourceTitle: 'types/workflow.md Phase 4-5: Ephemeral support (filtering, burn, GC), task-to-workflow linking',
    targetTitle: 'types/workflow.md Phase 2-3: Auto-completion/failure detection, pouring (playbook loading, variable resolution, condition evaluation, task creation, dependency wiring)',
  },
  // Workflow queries blocked by ephemeral support
  {
    sourceTitle: 'types/workflow.md Phase 6: Workflow queries (listing, tasks-in-workflow, ready tasks)',
    targetTitle: 'types/workflow.md Phase 4-5: Ephemeral support (filtering, burn, GC), task-to-workflow linking',
  },
  // Playbook validation blocked by YAML support
  {
    sourceTitle: 'types/playbook.md Phase 7: Pour-time validation, validation CLI command',
    targetTitle: 'types/playbook.md Phase 6: YAML support (schema, parser, file discovery)',
  },
  // Message integration blocked by channel membership
  {
    sourceTitle: 'types/channel.md Phase 6: Message integration (sender membership validation, direct message helper, auto-create direct channels)',
    targetTitle: 'types/channel.md Phase 2-4: Find-or-create logic, name uniqueness, membership operations (add, remove, leave), membership events',
  },
  // Message validation blocked by channel message integration
  {
    sourceTitle: 'types/message.md Phase 3-5: Channel membership validation, Document reference validation, thread integrity, content/attachments hydration',
    targetTitle: 'types/channel.md Phase 6: Message integration (sender membership validation, direct message helper, auto-create direct channels)',
  },
  // Message CLI blocked by message validation
  {
    sourceTitle: 'types/message.md Phase 7: CLI commands (send, thread)',
    targetTitle: 'types/message.md Phase 3-5: Channel membership validation, Document reference validation, thread integrity, content/attachments hydration',
  },
  // Events membership blocked by collection types (channel membership)
  {
    sourceTitle: 'systems/events.md Phase 3: Membership operations integration (blocked on collection types)',
    targetTitle: 'types/channel.md Phase 2-4: Find-or-create logic, name uniqueness, membership operations (add, remove, leave), membership events',
  },
];

async function main() {
  // Initialize storage
  const backend = createStorage({ path: '.elemental/elemental.db', create: true });
  initializeSchema(backend);
  const api = createElementalAPI(backend);

  console.log('Creating Plan: Elemental v1.0 Completion');

  // Create the Plan
  const plan = await createPlan({
    title: 'Elemental v1.0 Completion',
    status: PlanStatus.ACTIVE,
    createdBy: ACTOR,
    tags: ['v1', 'dogfood'],
  });

  await api.create(plan as unknown as Record<string, unknown> & { type: typeof plan.type; createdBy: EntityId });
  console.log(`Created plan: ${plan.id}`);

  // Create all tasks
  const taskIdByTitle = new Map<string, ElementId>();

  for (const taskDef of REMAINING_TASKS) {
    const task = await createTask({
      title: taskDef.title,
      status: TaskStatus.OPEN,
      priority: taskDef.priority,
      complexity: 3 as Complexity,
      taskType: 'feature',
      notes: taskDef.notes,
      createdBy: ACTOR,
      tags: taskDef.tags,
    });

    await api.create(task as unknown as Record<string, unknown> & { type: typeof task.type; createdBy: EntityId });
    taskIdByTitle.set(taskDef.title, task.id);

    // Link task to plan via parent-child dependency
    await api.addDependency({
      blockedId: task.id,
      blockerId: plan.id,
      type: 'parent-child',
    });

    console.log(`Created task: ${task.id} - ${taskDef.title.substring(0, 50)}...`);
  }

  // Add blocking dependencies
  console.log('\nAdding dependencies...');
  for (const dep of DEPENDENCIES) {
    const blockedId = taskIdByTitle.get(dep.sourceTitle);
    const blockerId = taskIdByTitle.get(dep.targetTitle);

    if (blockedId && blockerId) {
      await api.addDependency({
        blockedId,
        blockerId,
        type: 'blocks',
      });
      console.log(`Added: ${blockedId} blocked by ${blockerId}`);
    } else {
      console.warn(`Warning: Could not find tasks for dependency: ${dep.sourceTitle.substring(0, 30)}... -> ${dep.targetTitle.substring(0, 30)}...`);
    }
  }

  // Print summary
  const stats = await api.stats();
  console.log('\n=== Summary ===');
  console.log(`Plan: ${plan.id}`);
  console.log(`Total tasks: ${REMAINING_TASKS.length}`);
  console.log(`Dependencies: ${DEPENDENCIES.length}`);
  console.log(`Ready tasks: ${stats.readyTasks}`);
  console.log(`Blocked tasks: ${stats.blockedTasks}`);
}

main().catch(console.error);
