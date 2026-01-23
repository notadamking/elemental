# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-23

### Added

- **Core Elements**: Tasks, Documents, Plans, Entities, and Messages with branded IDs
- **Storage Layer**: SQLite-backed storage with multi-runtime support (Node.js 18+ and Bun)
- **Dependency Management**: Track blocking relationships, parent-child hierarchies, and gate conditions
- **Event Sourcing**: Complete audit trail with event history for all changes
- **JSONL Sync**: Export/import data in JSONL format for Git-based collaboration
- **CLI Tool**: Full-featured command-line interface (`el` / `elemental`) for managing elements
  - Workspace commands: `init`, `doctor`, `migrate`, `stats`
  - Element CRUD: `create`, `list`, `show`, `update`, `delete`
  - Task management: `ready`, `blocked`, `close`, `reopen`, `assign`, `defer`, `undefer`
  - Dependencies: `dep add`, `dep remove`, `dep list`, `dep tree`
  - Sync: `export`, `import`, `status`
  - Entities: `entity register`, `entity list`
  - History: `history`
- **Programmatic API**: `createElementalAPI()` for library usage
- **Automatic Blocked Status**: Tasks automatically compute blocked status from dependencies
- **Task Hydration**: Batch document fetching for efficient task retrieval
- **Secure Key Rotation**: Signature verification for identity keys
