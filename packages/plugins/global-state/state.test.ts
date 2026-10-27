import { expect, test } from "bun:test"
import { apply, createState, renderState } from "./index.ts"

test("tracks changed files, todos and shell commands", () => {
  const state = createState()
  apply(
    state,
    "edit",
    {},
    {
      metadata: { files: [{ file: "src/a.ts", status: "modified", additions: 3, deletions: 1 }] },
    },
  )
  apply(
    state,
    "todowrite",
    {},
    {
      metadata: { todos: [{ content: "ship the change", status: "in_progress" }] },
    },
  )
  apply(state, "shell", { command: "bun test", workdir: "/repo" }, {})
  const text = renderState(state, "/repo")
  expect(text).toContain("src/a.ts (modified, +3 -1)")
  expect(text).toContain("[•] ship the change")
  expect(text).toContain("bun test (in /repo)")
})

test("tracks a write result and replaces stale file stats", () => {
  const state = createState()
  apply(state, "write", {}, { output: { resource: "src/new.ts", existed: false } })
  apply(
    state,
    "edit",
    {},
    {
      metadata: { files: [{ file: "src/new.ts", status: "modified", additions: 2, deletions: 0 }] },
    },
  )
  const text = renderState(state, "/repo")
  expect(text).toContain("src/new.ts (modified, +2 -0)")
  expect(text).not.toContain("src/new.ts (added")
})

test("renders nothing without tracked state", () => {
  expect(renderState(createState(), "/repo")).toBeUndefined()
})
