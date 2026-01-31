Okay, first I'll share a few notes about items that were wrong above and need to
be corrected in the docs and the codebase:

1. There is no such thing as worker "capability". Remove all references to it.
2. We need to remove the "smart" dispatch functionality. There are no
   capabilities, dispatching should simply occur by a continuously running process
   that detects an ephemeral worker with no active session.
3. It is NOT the director's responsibility to monitor workers and get them
   unstuck. This is the responsibility of a steward.
4. A director only needs to report work status to the human if requested by the
   human, for which instructions will be defined in the director's role definition.
5. Workers will automatically shut down their process after finishing a task, so
   they will never check their own queue for tasks.

Next, we need to discuss how the automation should actually work end to end:

1. The user discusses a plan/goal or sends a proposed task as a message to the
   director agent
2. The director agent ingests the user's request and based on its role definition
   (passed into the agent appended to its system prompt), the director will then
   create either an individual task or create a plan and then create multiple tasks
   attached to that plan (we might need to update the el create task function to
   accept a plan [ID or name] as an option to automatically add the task to the
   existing plan on creation).
3. From here, we need a daemon or other server process running continuously that
   will poll agent sessions. When an ephemeral worker agent is detected to have
   no active session, this (dispatch) server process will dispatch the highest priority
   unassigned task to that worker. Dispatching should assign the task to the worker agent
   and send a message to that agent with the title, ID, and description of the task and
   any attached documents. The message will have metadata or a tag identifying it as a
   task dispatch message.
4. That same daemon/server process, or another, will poll for messages in each
   ephemeral worker or steward agent's inbox. If an unread message is found, the
   process will check if the agent is currently in an active session. If the message
   is a task dispatch message and the agent is NOT in an active session, the
   process will start (spawn) the agent and send it the message. If the message is
   NOT a task dispatch message and the agent IS in an active session, the process
   will send the message to the agent as user input prefixed with "[MESSAGE RECEIVED
   FROM {entityId}]:". If a dispatch message is sent to an agent, it should be marked
   as read in the inbox. A non-dispatch message should be marked as read whether it
   is sent to an agent or not (ie. if the messaged agent is idle, the message will be
   silently dropped).
5. That same daemon/server process, or another, will poll for messages in each
   persistent worker agent's inbox and the director agent's inbox. If an unread
   message is found, the process will check if the agent has a currently active
   session. If so, the process will send the message to the agent as user input
   prefixed with "[MESSAGE RECEIVED FROM {entityId}]:". Each agent will have
   instructions in their role definition for how to respond to messages received
   from other entities, and can choose to do so with a tool call.
6. That same daemon/server process, or another, will check for steward triggers
   that have been tripped. If a trigger has been tripped, the process will create a
   new workflow from the playbook attached to the trigger.
7. That same daemon/server process, or another, will check for workflows that are
   not completed, that don't have a task that is assigned to a steward agent. When
   found, the process will then check for any steward agents that don't have an
   active session. If a steward without a session is found, the process will
   dispatch the task to that steward. Dispatch should assign the task and send a
   message, similar to worker agent dispatch. The process described in step 5 above
   will then spawn the steward to complete the task.
8. It is each agent's responsibility (defined in their role definition) to close
   a task once they finish it or handoff the task to be completed by another agent
   (or another instance of themselves). Handoffs should work by simply unassigning
   the current agent from the task, such that the process defined in step 3 will
   re-assign the task to a new agent. Handoffs also can have a message provided,
   which should be added as a "[HANDOFF NOTE FROM AGENT SESSION {sessionId}]:
   {handoffMessage}" to the task description. Handoffs should also save a reference
   to the branch/worktree that was being worked on, so the next agent can continue
   from the existing code.
9. Each worker agent (ephemeral or persistent) should be spawned inside a worktree.
   That worktree should be given a specific branch for the task (ephemeral) or session
   (persistent). It is each worker agent's responsibility (ephemeral or persistent) to
   commit and push their work often, according to best principles (ie. commit whenever
   new work has reached a "completion" state). When a task is completed, a pull request
   (merge request) should be created for the branch into the main/master branch.
10. Merge requests should trigger a merge steward to review the request. After reviewing
    the changes, the steward should either merge the branch and delete the corresponding
    branch/worktree or create a handoff referencing the original branch/worktree that the
    merge request was created within, adding any review comments or requested changes in
    the handoff notes.

Alternatively, the user can discuss a plan/goal or send a proposed task as a
message to a persistent worker agent, but in this case, that worker will simply
work on the task in an interactive session, no assignment, no handoffs, just a
standard claude code agent.
