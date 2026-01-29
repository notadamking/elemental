# Agent Role Definitions

Agent Role Definitions allow you to store system prompts and behavioral configurations for AI agents. This enables consistent, versioned, and reusable agent configurations across your workspace.

## Overview

A Role Definition consists of:
- **System Prompt**: The main instructions for the agent (stored as a Document)
- **Capabilities**: Default skills, languages, and concurrency limits
- **Behaviors**: Event-triggered prompt fragments (onStartup, onTaskAssigned, etc.)
- **Role-specific settings**: Worker mode, steward focus, etc.

## Types

### AgentRoleDefinition

```typescript
interface AgentRoleDefinition {
  role: AgentRole;  // 'director' | 'worker' | 'steward'
  name: string;
  description?: string;
  systemPromptRef: DocumentId;  // Reference to prompt Document
  capabilities: AgentCapabilities;
  behaviors?: AgentBehaviors;
  tags?: string[];
  createdAt: Timestamp;
  createdBy: EntityId;
  updatedAt: Timestamp;
}
```

### AgentBehaviors

Behavioral hooks are prompt fragments appended to the agent's context on specific events:

```typescript
interface AgentBehaviors {
  onStartup?: string;      // Appended when agent starts
  onTaskAssigned?: string; // Appended when task is assigned
  onStuck?: string;        // Appended when agent appears stuck
  onHandoff?: string;      // Appended before creating a handoff
  onError?: string;        // Appended when handling errors
}
```

### Role-Specific Variants

- **DirectorRoleDefinition**: For director agents
- **WorkerRoleDefinition**: Adds optional `workerMode: 'ephemeral' | 'persistent'`
- **StewardRoleDefinition**: Adds optional `stewardFocus: 'merge' | 'health' | 'reminder' | 'ops'`

## Usage

### Creating a Role Definition

```typescript
import { createRoleDefinitionService } from '@elemental/orchestrator-sdk';
import { createElementalAPI } from '@elemental/sdk';
import { createStorage, initializeSchema } from '@elemental/storage';

// Setup
const backend = createStorage({ path: './data.db' });
initializeSchema(backend);
const api = createElementalAPI(backend);
const roleDefService = createRoleDefinitionService(api);

// Create a role definition
const roleDef = await roleDefService.createRoleDefinition({
  role: 'worker',
  name: 'Frontend Developer',
  description: 'Specialized in React and TypeScript development',
  systemPrompt: `You are a frontend developer specializing in React and TypeScript.
Your responsibilities include:
- Writing clean, maintainable React components
- Following TypeScript best practices
- Writing unit tests for your code`,
  capabilities: {
    skills: ['frontend', 'react', 'typescript', 'css'],
    languages: ['typescript', 'javascript'],
    maxConcurrentTasks: 1,
  },
  behaviors: {
    onStartup: 'Check for any existing work in progress before starting new tasks.',
    onStuck: 'Break down the problem into smaller parts. If still stuck, ask for help.',
  },
  workerMode: 'persistent',
  tags: ['frontend', 'senior'],
  createdBy: userEntityId,
});
```

### Retrieving a Role Definition

```typescript
// Get by ID
const roleDef = await roleDefService.getRoleDefinition(roleDefId);

// Get the system prompt text
const promptText = await roleDefService.getSystemPrompt(roleDefId);

// Get default role definition for a role type
const defaultDirector = await roleDefService.getDefaultRoleDefinition('director');
```

### Listing and Filtering

```typescript
// List all role definitions
const all = await roleDefService.listRoleDefinitions();

// Filter by role
const workers = await roleDefService.listRoleDefinitions({ role: 'worker' });

// Filter by worker mode
const ephemeral = await roleDefService.listRoleDefinitions({ workerMode: 'ephemeral' });

// Filter by steward focus
const mergeStewards = await roleDefService.listRoleDefinitions({ stewardFocus: 'merge' });

// Filter by tags
const frontendDefs = await roleDefService.listRoleDefinitions({ tags: ['frontend'] });

// Filter by name (partial match, case-insensitive)
const reactDefs = await roleDefService.listRoleDefinitions({ nameContains: 'react' });

// Get all for a specific role
const allWorkers = await roleDefService.getRoleDefinitionsByRole('worker');
```

### Updating a Role Definition

```typescript
// Update name and description
await roleDefService.updateRoleDefinition(roleDefId, {
  name: 'Senior Frontend Developer',
  description: 'Updated description',
});

// Update system prompt (creates new Document version)
await roleDefService.updateRoleDefinition(roleDefId, {
  systemPrompt: 'New and improved prompt...',
});

// Update capabilities (merged with existing)
await roleDefService.updateRoleDefinition(roleDefId, {
  capabilities: {
    maxConcurrentTasks: 2,  // Changed
    // skills and languages remain unchanged
  },
});

// Update behaviors (merged with existing)
await roleDefService.updateRoleDefinition(roleDefId, {
  behaviors: {
    onError: 'New error handling instructions',
    // Other behaviors remain unchanged
  },
});
```

### Deleting a Role Definition

```typescript
const deleted = await roleDefService.deleteRoleDefinition(roleDefId);
// Returns true if deleted, false if not found
```

### Registering an Agent with a Role Definition

```typescript
import { createAgentRegistry } from '@elemental/orchestrator-sdk';

const registry = createAgentRegistry(api);

// Register worker with role definition reference
const worker = await registry.registerWorker({
  name: 'frontend-worker-1',
  workerMode: 'persistent',
  createdBy: userEntityId,
  roleDefinitionRef: roleDef.id,  // Link to role definition
});
```

## Type Guards

```typescript
import {
  isAgentBehaviors,
  isDirectorRoleDefinition,
  isWorkerRoleDefinition,
  isStewardRoleDefinition,
  isAgentRoleDefinition,
} from '@elemental/orchestrator-sdk';

// Check if value is valid AgentBehaviors
if (isAgentBehaviors(value)) {
  // value is AgentBehaviors
}

// Check specific role types
if (isWorkerRoleDefinition(def)) {
  // def has workerMode property
}
```

## Document Storage

Role definitions are stored as two Documents:

1. **System Prompt Document**: Contains the prompt text in markdown format
   - Tags: `['agent-prompt', 'role:{role}']`
   - ContentType: `markdown`

2. **Role Definition Document**: Contains the full definition as JSON
   - Tags: `['role-definition', 'agent-prompt', 'role:{role}']`
   - ContentType: `json`
   - Metadata includes the definition for quick access

## Built-in Role Prompts

The orchestrator SDK includes built-in role definition prompts that teach agents their responsibilities, workflows, and CLI commands.

### File Locations

```
packages/orchestrator-sdk/src/prompts/
├── director.md        # Director role definition
├── worker.md          # Worker role definition
├── steward-base.md    # Base steward prompt
├── steward-merge.md   # Merge focus addendum
├── steward-health.md  # Health focus addendum
├── steward-ops.md     # Ops focus addendum
└── steward-reminder.md # Reminder focus addendum
```

### Loading Built-in Prompts

```typescript
import {
  loadRolePrompt,
  loadBuiltInPrompt,
  buildAgentPrompt,
} from '@elemental/orchestrator-sdk';

// Load a role prompt (checks for project overrides first)
const result = loadRolePrompt('worker', undefined, { projectRoot: '/my/project' });
console.log(result?.prompt);  // The prompt content
console.log(result?.source);  // 'built-in' or path to override file

// Load built-in only (skip project overrides)
const builtIn = loadBuiltInPrompt('director');

// For stewards, specify the focus
const mergePrompt = loadRolePrompt('steward', 'merge');
// Returns: steward-base.md + steward-merge.md combined

// Build a complete agent prompt with task context
const fullPrompt = buildAgentPrompt({
  role: 'worker',
  taskContext: 'Implement user login form with email/password validation.',
  projectRoot: '/my/project',
});
```

### Project-Level Overrides

You can override built-in prompts by placing files in `.elemental/prompts/`:

```
my-project/
├── .elemental/
│   └── prompts/
│       ├── worker.md           # Custom worker prompt
│       └── steward-merge.md    # Custom merge steward prompt
└── src/
```

The loader checks for project overrides first, then falls back to built-in prompts.

### Prompt Structure

Built-in prompts follow a consistent structure:

1. **Identity**: Who the agent is, what they own, who they report to
2. **System Overview**: Brief table of all roles
3. **Core Workflows**: Step-by-step guides for key operations
4. **Judgment Scenarios**: Concrete examples of decision-making
5. **CLI Quick Reference**: Essential commands

### Integration with Spawner

When spawning an agent, use `buildAgentPrompt` to compose the initial prompt:

```typescript
import { buildAgentPrompt } from '@elemental/orchestrator-sdk';

const prompt = buildAgentPrompt({
  role: 'worker',
  taskContext: taskDescription,
  projectRoot: workspace,
});

const result = await spawner.spawn(agentId, 'worker', {
  initialPrompt: prompt,
  workingDirectory: worktreePath,
});
```

## Best Practices

1. **Version your prompts**: Since system prompts are stored as Documents, they support versioning. Update the prompt to create a new version.

2. **Use behaviors for context**: Use behavioral hooks to inject context-specific instructions rather than bloating the main system prompt.

3. **Tag for organization**: Use tags to categorize role definitions (e.g., `['frontend', 'senior']`).

4. **Default definitions**: Create default definitions for each role type that can be used as templates.

5. **Capability alignment**: Ensure the capabilities in the role definition match what the agent should actually be able to do.

6. **Use built-in prompts**: Start with the built-in role prompts and customize via project overrides if needed.

7. **Keep prompts concise**: Built-in prompts are designed to be additive to Claude Code's system prompt. They focus on role-specific guidance, not general instructions.
