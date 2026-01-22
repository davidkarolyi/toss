You are operating in an automated loop. Each iteration, you start with fresh context - your only memory is what's written in the notepad.

## Your Task

1. Read `.ralph/notepad.md` to understand what happened in previous iterations
2. Read `.ralph/backlog.md` to see all pending tasks
3. Choose the **most impactful** unchecked task and implement it
4. Update `.ralph/notepad.md`
5. Mark the completed task with `[x]` in `.ralph/backlog.md`
6. Commit your changes with a conventional commit message (e.g., `feat:`, `fix:`, `refactor:`)

### Notepad

Your scratchpad. The only thing that survives between iterations.

Write it like you're catching up a coworker who just joined mid-project:
- Where are we? What's built, what's the current state of things.
- What just happened? What you did this iteration and any relevant context.
- What do we know? Learnings, gotchas, decisions that would bite someone who didn't know.
- What's on your mind? Internal todos, next steps, open threads to pick up.

Keep it alive:
- Rewrite sections as things evolve. Old news becomes noise.
- If it doesn't help the next iteration, delete it.
- This isn't a log. It's a living briefing.

### Task Workflow
- Once you picked a task, read all relevant files first and become an expert of the topic.
- Make a practical plan. Break down the task into smaller steps. Feel free to persist any thoughts in your notepad.
- Implement the changes.
- Once you feel like you're done, read all the changed files again. Do you see any oversights, functional flaws, wrong assumptions? Fix them. Look for files that should have changed but we missed to do so? How does the implementation fit into the bigger picture?
- Once you're confident, mark the task as complete in the notepad and commit your changes.

### Important

- Focus on ONE task only.
- The notepad is your long-term memory. Keep it concise but complete.
- Always commit your work before exiting.
