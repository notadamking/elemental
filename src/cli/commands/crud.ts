/**
 * CRUD Commands - Create, List, Show, Update, Delete operations
 *
 * Provides CLI commands for basic element operations:
 * - create: Create new elements (tasks, etc.)
 * - list: List elements with filtering
 * - show: Show detailed element information
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Command, GlobalOptions, CommandResult, CommandOption } from '../types.js';
import { success, failure, ExitCode } from '../types.js';
import { getFormatter, getOutputMode, getStatusIcon } from '../formatter.js';
import { BunStorageBackend } from '../../storage/bun-backend.js';
import { initializeSchema } from '../../storage/schema.js';
import { createElementalAPI } from '../../api/elemental-api.js';
import { createTask, TaskStatus, TaskTypeValue, type CreateTaskInput, type Priority, type Complexity } from '../../types/task.js';
import type { Element, ElementId, EntityId, ElementType } from '../../types/element.js';
import type { ElementalAPI, TaskFilter } from '../../api/types.js';

// ============================================================================
// Constants
// ============================================================================

const ELEMENTAL_DIR = '.elemental';
const DEFAULT_DB_NAME = 'elemental.db';
const DEFAULT_ACTOR = 'cli-user';

// ============================================================================
// Database Helper
// ============================================================================

/**
 * Resolves database path from options or default location
 */
function resolveDatabasePath(options: GlobalOptions): string | null {
  if (options.db) {
    return options.db;
  }

  // Look for .elemental directory
  const elementalDir = join(process.cwd(), ELEMENTAL_DIR);
  if (existsSync(elementalDir)) {
    return join(elementalDir, DEFAULT_DB_NAME);
  }

  return null;
}

/**
 * Gets actor from options or default
 */
function resolveActor(options: GlobalOptions): EntityId {
  return (options.actor ?? DEFAULT_ACTOR) as EntityId;
}

/**
 * Creates an API instance from options
 */
function createAPI(options: GlobalOptions): { api: ElementalAPI; error?: string } {
  const dbPath = resolveDatabasePath(options);
  if (!dbPath) {
    return {
      api: null as unknown as ElementalAPI,
      error: 'No database found. Run "el init" to initialize a workspace, or specify --db path',
    };
  }

  try {
    const backend = new BunStorageBackend({ path: dbPath, create: true });
    initializeSchema(backend);
    return { api: createElementalAPI(backend) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      api: null as unknown as ElementalAPI,
      error: `Failed to open database: ${message}`,
    };
  }
}

// ============================================================================
// Create Command
// ============================================================================

interface CreateOptions {
  title?: string;
  priority?: string;
  complexity?: string;
  type?: string;
  assignee?: string;
  tag?: string[];
}

const createOptions: CommandOption[] = [
  {
    name: 'title',
    short: 't',
    description: 'Title for the element (required for tasks)',
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: 'Priority level (1-5, 1=critical)',
    hasValue: true,
  },
  {
    name: 'complexity',
    short: 'c',
    description: 'Complexity level (1-5, 1=trivial)',
    hasValue: true,
  },
  {
    name: 'type',
    description: 'Task type (bug, feature, task, chore)',
    hasValue: true,
  },
  {
    name: 'assignee',
    short: 'a',
    description: 'Assignee entity ID',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Add a tag (can be repeated)',
    hasValue: true,
  },
];

async function createHandler(
  args: string[],
  options: GlobalOptions & CreateOptions
): Promise<CommandResult> {
  // First argument is the element type
  const [elementType] = args;

  if (!elementType) {
    return failure('Usage: el create <type> [options]\n\nTypes: task', ExitCode.INVALID_ARGUMENTS);
  }

  // Currently only support task creation
  if (elementType !== 'task') {
    return failure(
      `Unsupported element type: ${elementType}. Currently supported: task`,
      ExitCode.INVALID_ARGUMENTS
    );
  }

  // Validate required options for task
  if (!options.title) {
    return failure('--title is required for creating a task', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    const actor = resolveActor(options);

    // Parse priority
    let priority: Priority | undefined;
    if (options.priority) {
      const p = parseInt(options.priority, 10);
      if (isNaN(p) || p < 1 || p > 5) {
        return failure('Priority must be a number from 1 to 5', ExitCode.VALIDATION);
      }
      priority = p as Priority;
    }

    // Parse complexity
    let complexity: Complexity | undefined;
    if (options.complexity) {
      const c = parseInt(options.complexity, 10);
      if (isNaN(c) || c < 1 || c > 5) {
        return failure('Complexity must be a number from 1 to 5', ExitCode.VALIDATION);
      }
      complexity = c as Complexity;
    }

    // Parse task type
    type TaskTypeValueType = (typeof TaskTypeValue)[keyof typeof TaskTypeValue];
    let taskType: TaskTypeValueType | undefined;
    if (options.type) {
      const validTypes: string[] = Object.values(TaskTypeValue);
      if (!validTypes.includes(options.type)) {
        return failure(
          `Invalid task type: ${options.type}. Must be one of: ${validTypes.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      taskType = options.type as TaskTypeValueType;
    }

    // Handle tags (may come as array if --tag is specified multiple times)
    let tags: string[] | undefined;
    if (options.tag) {
      tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Create task input
    const input: CreateTaskInput = {
      title: options.title,
      createdBy: actor,
      ...(priority !== undefined && { priority }),
      ...(complexity !== undefined && { complexity }),
      ...(taskType !== undefined && { taskType }),
      ...(options.assignee && { assignee: options.assignee as EntityId }),
      ...(tags && { tags }),
    };

    // Create the task
    const task = await createTask(input);
    // The API's create method expects ElementInput which Task satisfies
    const created = await api.create(task as unknown as Element & Record<string, unknown>);

    return success(created, `Created task ${created.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to create task: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const createCommand: Command = {
  name: 'create',
  description: 'Create a new element',
  usage: 'el create <type> [options]',
  help: `Create a new element of the specified type.

Supported types:
  task     Work item with status, priority, and assignment

Task options:
  -t, --title <text>      Task title (required)
  -p, --priority <1-5>    Priority (1=critical, 5=minimal, default=3)
  -c, --complexity <1-5>  Complexity (1=trivial, 5=very complex, default=3)
      --type <type>       Task type: bug, feature, task, chore
  -a, --assignee <id>     Assignee entity ID
      --tag <tag>         Add a tag (can be repeated)

Examples:
  el create task --title "Fix login bug" --priority 1 --type bug
  el create task -t "Add dark mode" --tag ui --tag feature`,
  options: createOptions,
  handler: createHandler as Command['handler'],
};

// ============================================================================
// List Command
// ============================================================================

interface ListOptions {
  type?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  tag?: string[];
  limit?: string;
  offset?: string;
}

const listOptions: CommandOption[] = [
  {
    name: 'type',
    short: 't',
    description: 'Filter by element type',
    hasValue: true,
  },
  {
    name: 'status',
    short: 's',
    description: 'Filter by status (for tasks)',
    hasValue: true,
  },
  {
    name: 'priority',
    short: 'p',
    description: 'Filter by priority (for tasks)',
    hasValue: true,
  },
  {
    name: 'assignee',
    short: 'a',
    description: 'Filter by assignee (for tasks)',
    hasValue: true,
  },
  {
    name: 'tag',
    description: 'Filter by tag (can be repeated for AND)',
    hasValue: true,
  },
  {
    name: 'limit',
    short: 'l',
    description: 'Maximum number of results',
    hasValue: true,
  },
  {
    name: 'offset',
    short: 'o',
    description: 'Number of results to skip',
    hasValue: true,
  },
];

async function listHandler(
  args: string[],
  options: GlobalOptions & ListOptions
): Promise<CommandResult> {
  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Build filter from options
    const filter: TaskFilter = {};

    // Type filter (can also be first positional arg)
    const typeArg = args[0] ?? options.type;
    if (typeArg) {
      filter.type = typeArg as Element['type'];
    }

    // Status filter
    if (options.status) {
      const validStatuses: string[] = Object.values(TaskStatus);
      if (!validStatuses.includes(options.status)) {
        return failure(
          `Invalid status: ${options.status}. Must be one of: ${validStatuses.join(', ')}`,
          ExitCode.VALIDATION
        );
      }
      filter.status = options.status as (typeof TaskStatus)[keyof typeof TaskStatus];
    }

    // Priority filter
    if (options.priority) {
      const priority = parseInt(options.priority, 10);
      if (isNaN(priority) || priority < 1 || priority > 5) {
        return failure('Priority must be a number from 1 to 5', ExitCode.VALIDATION);
      }
      filter.priority = priority as 1 | 2 | 3 | 4 | 5;
    }

    // Assignee filter
    if (options.assignee) {
      filter.assignee = options.assignee as EntityId;
    }

    // Tag filter
    if (options.tag) {
      filter.tags = Array.isArray(options.tag) ? options.tag : [options.tag];
    }

    // Pagination
    if (options.limit) {
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        return failure('Limit must be a positive number', ExitCode.VALIDATION);
      }
      filter.limit = limit;
    }

    if (options.offset) {
      const offset = parseInt(options.offset, 10);
      if (isNaN(offset) || offset < 0) {
        return failure('Offset must be a non-negative number', ExitCode.VALIDATION);
      }
      filter.offset = offset;
    }

    // Query elements
    const result = await api.listPaginated<Element>(filter);

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(result.items);
    }

    if (mode === 'quiet') {
      return success(result.items.map((e) => e.id).join('\n'));
    }

    // Human-readable output
    if (result.items.length === 0) {
      return success(null, 'No elements found');
    }

    // Build table data
    const headers = ['ID', 'TYPE', 'TITLE/NAME', 'STATUS', 'CREATED'];
    const rows = result.items.map((item) => {
      const data = item as unknown as Record<string, unknown>;
      const title = data.title ?? data.name ?? '-';
      const status = data.status ? `${getStatusIcon(data.status as string)} ${data.status}` : '-';
      const created = item.createdAt.split('T')[0];
      return [item.id, item.type, title, status, created];
    });

    const table = formatter.table(headers, rows);
    const summary = `\nShowing ${result.items.length} of ${result.total} elements`;

    return success(result.items, table + summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to list elements: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const listCommand: Command = {
  name: 'list',
  description: 'List elements',
  usage: 'el list [type] [options]',
  help: `List elements with optional filtering.

Arguments:
  type                  Element type to list (task, document, etc.)

Options:
  -t, --type <type>     Filter by element type
  -s, --status <status> Filter by status (for tasks)
  -p, --priority <1-5>  Filter by priority (for tasks)
  -a, --assignee <id>   Filter by assignee (for tasks)
      --tag <tag>       Filter by tag (can be repeated)
  -l, --limit <n>       Maximum results (default: 50)
  -o, --offset <n>      Skip first n results

Examples:
  el list task
  el list task --status open
  el list --type task --priority 1 --status in_progress
  el list --tag urgent`,
  options: listOptions,
  handler: listHandler as Command['handler'],
};

// ============================================================================
// Show Command
// ============================================================================

async function showHandler(
  args: string[],
  options: GlobalOptions
): Promise<CommandResult> {
  const [id] = args;

  if (!id) {
    return failure('Usage: el show <id>', ExitCode.INVALID_ARGUMENTS);
  }

  const { api, error } = createAPI(options);
  if (error) {
    return failure(error, ExitCode.GENERAL_ERROR);
  }

  try {
    // Get the element
    const element = await api.get<Element>(id as ElementId);

    if (!element) {
      return failure(`Element not found: ${id}`, ExitCode.NOT_FOUND);
    }

    // Format output based on mode
    const mode = getOutputMode(options);
    const formatter = getFormatter(mode);

    if (mode === 'json') {
      return success(element);
    }

    if (mode === 'quiet') {
      return success(element.id);
    }

    // Human-readable output - format as key-value pairs
    const output = formatter.element(element as unknown as Record<string, unknown>);

    return success(element, output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return failure(`Failed to get element: ${message}`, ExitCode.GENERAL_ERROR);
  }
}

export const showCommand: Command = {
  name: 'show',
  description: 'Show element details',
  usage: 'el show <id>',
  help: `Display detailed information about an element.

Arguments:
  id    Element identifier (e.g., el-abc123)

Examples:
  el show el-abc123
  el show el-abc123 --json`,
  options: [],
  handler: showHandler as Command['handler'],
};
