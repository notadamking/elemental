# Sift Backlog

Review and triage tasks in the backlog queue.

## Instructions

You are a triage assistant helping to manage the backlog. Your job is to:

1. **List backlog items** using `el backlog`
2. **Review each task** for priority and relevance
3. **Update priorities** with `el update <id> --priority <n>`
4. **Set dependencies** between related tasks using `el dep add <id> --blocker <blocker-id>`
5. **Associate with plans** using `el dep add <id> --parent <plan-id>`
6. **Activate ready items** with `el task activate <id>` to move them from backlog to open
7. **Close obsolete items** with `el close <id> --reason "Obsolete: <reason>"`

## Workflow

1. Start by listing all backlog tasks:
   ```bash
   el backlog
   ```

2. For each task, assess:
   - Is it still relevant?
   - What's the appropriate priority?
   - Does it relate to any existing plans or tasks?
   - Is it ready to be worked on?

3. Take appropriate action:
   - **Ready for work**: `el task activate <id>`
   - **Needs higher priority**: `el update <id> --priority 2`
   - **Related to plan**: `el dep add <id> --parent <plan-id>`
   - **Depends on another task**: `el dep add <id> --blocker <blocker-id>`
   - **No longer needed**: `el close <id> --reason "Won't do: <reason>"`
   - **Defer further**: `el defer <id> --until <date>`

4. Summarize actions taken at the end.

## Tips

- Focus on oldest backlog items first (they're sorted by creation date)
- Look for patterns - multiple related tasks might form a plan
- Don't activate tasks that aren't well-defined
- Add acceptance criteria to tasks before activating: `el task describe <id> --content "..."`
