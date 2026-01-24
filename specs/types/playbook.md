# Playbook Type Specification

Playbooks are templates for creating Workflows, defining reusable sequences of tasks with variables, conditions, and dependencies. They enable standardized, repeatable processes that can be instantiated multiple times with different parameters.

## Purpose

Playbooks provide:
- Reusable workflow templates
- Parameterized task sequences
- Conditional step inclusion
- Dependency specification
- Template composition via inheritance

## Properties

### Identity

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Unique name for referencing |
| `title` | `string` | Yes | Display title, 1-500 characters |
| `descriptionRef` | `DocumentId` | No | Reference to description Document |
| `version` | `number` | Yes | Template version number |

### Template Definition

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `steps` | `PlaybookStep[]` | Yes | Task templates to create |
| `variables` | `PlaybookVariable[]` | Yes | Variable definitions |

### Composition

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `extends` | `string[]` | No | Parent playbooks to inherit from |

## PlaybookStep

Each step defines a task to create during instantiation:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique step identifier |
| `title` | `string` | Yes | Task title (supports variables) |
| `description` | `string` | No | Task description (supports variables) |
| `taskType` | `string` | No | Task type classification |
| `priority` | `Priority` | No | Default priority |
| `complexity` | `Complexity` | No | Default complexity |
| `assignee` | `string` | No | Assignee (can be variable) |
| `dependsOn` | `string[]` | No | Step IDs this step depends on |
| `condition` | `string` | No | Condition for inclusion |

## PlaybookVariable

Each variable defines a parameter for instantiation:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | `string` | Yes | Variable name |
| `description` | `string` | No | Human-readable description |
| `type` | `VariableType` | Yes | `string`, `number`, or `boolean` |
| `required` | `boolean` | Yes | Whether value must be provided |
| `default` | `any` | No | Default value if not provided |
| `enum` | `any[]` | No | Allowed values |

## Variable Substitution

Variables are substituted using `{{variableName}}` syntax:

### Pattern

- Format: `{{variableName}}`
- Regex: `\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}`
- Escaping: Use `\{\{` for literal braces

### Substitution Locations

Variables can appear in:
- Step `title`
- Step `description`
- Step `assignee`
- Condition expressions

### Type Coercion

- String: Used as-is
- Number: Converted to string in templates
- Boolean: Converted to "true"/"false" strings

## Condition Evaluation

Step conditions determine whether to include the step:

### Syntax

| Expression | Meaning |
|------------|---------|
| `{{var}}` | Include if var is truthy |
| `!{{var}}` | Include if var is falsy |
| `{{var}} == value` | Include if var equals value |
| `{{var}} != value` | Include if var doesn't equal value |

### Truthiness

Truthy: Any value except:
- Empty string `""`
- `"false"` (case-insensitive)
- `"0"`
- `"no"` (case-insensitive)
- `"off"` (case-insensitive)
- Undefined/null (missing variable)

### Missing Variables

If a variable in a condition is not provided:
- Treated as empty string
- Evaluates as falsy
- Step is excluded

## Inheritance

Playbooks can extend other playbooks:

### Mechanism

1. Load parent playbook(s) in order
2. Merge variables (child overrides parent)
3. Merge steps (child adds to parent)
4. Apply child's modifications

### Inheritance Rules

- Variables: Same name replaces parent's definition
- Steps: Same ID replaces parent's step
- New steps: Added after parent's steps
- Multiple extends: Applied left to right

### Diamond Problem

If A extends B and C, both extend D:
- D's definitions loaded once
- B's modifications applied
- C's modifications applied (may override B)
- A's modifications applied last

## Versioning

Playbooks are versioned for tracking changes:

- `version` starts at 1
- Increment on significant changes
- Workflows record which version they used
- Old workflows unaffected by new versions

## Validation

### Playbook Validation

Before a playbook can be used:
1. All variable names are valid identifiers
2. All step IDs are unique
3. `dependsOn` references valid step IDs
4. `condition` syntax is valid
5. `extends` references existing playbooks
6. No circular inheritance

### Pour-time Validation

When instantiating:
1. All required variables provided
2. Enum values within allowed list
3. Type constraints satisfied
4. No unresolved variables after substitution

## Storage

Playbooks can be stored:

### In Database

- As regular elements
- Type: `playbook`
- Full element features (tags, metadata)

### As YAML Files

- In `.elemental/playbooks/` directory
- File extension: `.playbook.yaml`
- Loaded on demand

### YAML Format

Playbooks in YAML follow this structure:
- name: string
- title: string
- version: number
- variables: array
- steps: array
- extends: array (optional)

## Instantiation Process

"Pouring" a playbook creates a workflow:

### Steps

1. Load playbook by name or ID
2. Resolve inheritance chain
3. Merge inherited definitions
4. Validate provided variables
5. Evaluate step conditions
6. Filter steps by condition results
7. Substitute variables in templates
8. Create workflow element
9. Create task for each step
10. Create dependencies from dependsOn
11. Return workflow

### Transaction

All steps occur in a transaction:
- If any step fails, rollback all
- Workflow and tasks created atomically

## Implementation Methodology

### Storage Schema

Playbooks stored in `elements` table:
- `type = 'playbook'`
- Steps and variables in JSON `data`
- Name uniqueness enforced

### Variable Resolution

1. Collect variables from inheritance chain
2. Apply defaults for missing optional variables
3. Validate required variables present
4. Validate enum constraints
5. Store resolved values in workflow

### Condition Parser

Simple expression parser:
1. Tokenize expression
2. Identify operator (none, !, ==, !=)
3. Extract variable name
4. Extract comparison value (if any)
5. Return evaluator function

### Substitution Engine

String replacement with variable values:
1. Find all `{{...}}` patterns
2. Look up variable value
3. Convert to string
4. Replace pattern with value
5. Error if variable undefined (unless in condition)

## Implementation Checklist

### Phase 1: Type Definitions ✅
- [x] Define `Playbook` interface extending `Element`
- [x] Define `PlaybookStep` interface
- [x] Define `PlaybookVariable` interface
- [x] Define `VariableType` union
- [x] Create type guards (isPlaybook, validatePlaybook)
- [x] Create branded PlaybookId type
- [x] Create createPlaybook factory function
- [x] Create updatePlaybook function

### Phase 2: Variable System ✅
- [x] Implement variable validation (isValidPlaybookVariable, validatePlaybookVariable)
- [x] Implement type coercion (isValidDefaultForType, isValidEnumForType)
- [x] Implement enum validation
- [x] Implement default resolution (resolveVariables)
- [x] Implement getVariableNames, getRequiredVariableNames, getOptionalVariableNames utilities

### Phase 3: Condition System ✅
- [x] Implement condition parser (parseCondition)
- [x] Implement truthiness evaluation (isTruthy)
- [x] Implement comparison operators (truthy, not, equals, notEquals)
- [x] Handle missing variables (evaluateCondition)

### Phase 4: Substitution ✅
- [x] Implement pattern matching (VARIABLE_SUBSTITUTION_PATTERN)
- [x] Implement variable replacement (substituteVariables)
- [x] Implement extractVariableNames
- [x] Implement hasVariables check
- [x] Error on unresolved variables (with allowMissing option)
- [x] Implement filterStepsByConditions

### Phase 5: Inheritance ✅
- [x] Implement playbook loading (findByName, createPlaybookLoader)
- [x] Implement inheritance chain resolution (resolveInheritanceChain)
- [x] Implement variable merging (mergeVariables)
- [x] Implement step merging (mergeSteps, validateMergedSteps)
- [x] Detect circular inheritance (self-extension check in createPlaybook/updatePlaybook)
- [x] Main entry point (resolvePlaybookInheritance)

### Phase 6: YAML Support ✅
- [x] Define YAML schema (YamlPlaybookFile, YamlPlaybookVariable, YamlPlaybookStep interfaces)
- [x] Implement YAML parser (parseYamlPlaybook, validateYamlPlaybook, convertYamlToPlaybookInput)
- [x] Implement file discovery (discoverPlaybookFiles, findPlaybookFile)
- [x] File reading/writing (readPlaybookFile, loadPlaybookFromFile, writePlaybookFile)
- [ ] Add file watching (optional, deferred)

### Phase 7: Validation ✅
- [x] Implement playbook validation (validatePlaybook, validateSteps, validateVariables)
- [x] Implement pour-time validation (validatePour in workflow-pour.ts)
- [x] Add validation CLI command (el playbook validate with --var and --pour options)

### Phase 8: Integration
- [ ] Integrate with workflow creation
- [ ] Add CLI commands (list, show, validate, create)

### Phase 9: Testing ✅
- [x] Unit tests for variable system (230 tests)
- [x] Unit tests for condition evaluation
- [x] Unit tests for substitution
- [x] Unit tests for inheritance (42 tests covering mergeVariables, mergeSteps, validateMergedSteps, resolveInheritanceChain, resolvePlaybookInheritance, createPlaybookLoader, findByName)
- [x] Integration tests for full pour (workflow-queries.integration.test.ts - Full Pour Flow Integration + Playbook Inheritance Integration sections)
- [x] E2E tests for playbook lifecycle (playbook.test.ts - Playbook Lifecycle E2E section)
