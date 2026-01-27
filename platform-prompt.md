study specs/README.md
then study the implementation checklist in specs/platform/PLAN.md and pick the most important thing to do - your task is implement then to validate that this functionality works by manually testing via Claude in Chrome or writing a playwright test to fully cover the scenario

IMPORTANT:

- focus on implementing user-facing app functionality that works
- use tight, quick feedback loops to ensure the UI/UX is always working as expected with a high quality UX
- utilize the idea of "tracer bullets" from Andrew Hunt and David Thomas's book "The Pragmatic Programmer" to create small, full-stack chunks of work that can be verified immediately using playwright
- NEVER assume your task is complete until you've verified the functionality works exactly as expected
- if you find an item that's already been completed, make sure to mark it as completed in the relevant spec(s)
- if you find any bugs, failing tests, broken builds, type errors, etc., either fix them within your task or add them to the relevant implementation checklist to be fixed by another agent
- update the checklist in specs/platform/PLAN.md when you're done
- create or update any corresponding specs in specs/platform/ as applicable and add any new specs to specs/README.md
- commit and push once all specs have been updated / createed
- ALWAYS exit (NOT terminate) after finishing your task and pushing your changes
- do NOT start a second task, it's important to exit and allow the next agent in the loop to pick up the next task with a fresh context window

**MOST IMPORTANT:**

- when all implementation checklist items are complete in all specs/platform/PLAN.md, terminate your loop by running: claude-loop-kill {Your loop ID}
- do NOT terminate your loop unless all items in the implementation checklists are completed
