Based on the documentation I gathered, **plugins in Gas Town are automated maintenance tasks that the Maintenance Controller (Deacon) runs on its patrol loops**.

## Plugin System Overview

**What plugins do**: They allow you to define custom automated operations that the Maintenance Controller executes periodically as part of its continuous maintenance cycle.

**How they work**:

- The Maintenance Controller runs a "patrol" (a well-defined workflow) in a continuous loop
- A system daemon pings the controller every few minutes with a "do your job" signal
- The controller executes registered plugins during each patrol cycle
- Plugins handle routine housekeeping that would otherwise require manual intervention

**Use case example from the documentation**:

> "Anything you do often, you can make a plugin that the [Maintenance Controller] will run on its patrol."

**Typical plugin tasks**:

- Clearing stale work items
- Cleaning orphaned processes
- Removing untracked files
- Resetting stuck agent states
- Running health checks
- Custom project-specific cleanup operations

**Key characteristic**: Plugins transform manual, repetitive maintenance tasks into automated background operations, reducing the human operator's housekeeping burden and keeping the system running smoothly during extended unattended operation.

The plugin system essentially extends the Maintenance Controller's built-in behaviors with user-defined automation specific to their workspace needs.
