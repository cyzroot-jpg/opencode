import { expect, test } from "bun:test"
import { DateTime } from "effect"
import { SessionMessage } from "../src/session/message.js"
import { treeEntries } from "../src/session/history.js"

const user = (seq: number, id: string, text: string) => ({
  seq,
  message: {
    id: SessionMessage.ID.make(id),
    type: "user" as const,
    text,
    time: { created: DateTime.makeUnsafe(seq) },
  } satisfies SessionMessage.Info,
})

const compaction = (seq: number, nodeID: string, keepID?: string) => ({
  seq,
  message: {
    id: SessionMessage.ID.make(`msg_c${seq}`),
    type: "compaction" as const,
    status: "completed" as const,
    reason: "manual" as const,
    summary: `summary ${nodeID}`,
    metadata: { contextTree: { nodeID }, ...(keepID ? { keepID } : {}) },
    time: { created: DateTime.makeUnsafe(seq) },
  } satisfies SessionMessage.Info,
})

test("applies a compaction tagged for an ancestor node", () => {
  const tree = {
    version: 1 as const,
    root: "msg_u1",
    active: "msg_u2",
    nodes: {
      msg_u1: { label: "one" },
      msg_u2: { parent: "msg_u1", label: "two" },
    },
  }
  const entries = [user(0, "msg_u1", "one"), compaction(1, "msg_u1"), user(2, "msg_u2", "two")]
  expect(treeEntries(tree, entries).map((entry) => String(entry.message.id))).toEqual(["msg_c1", "msg_u2"])
})

test("keeps the recent tail referenced by the node compaction", () => {
  const tree = {
    version: 1 as const,
    root: "msg_u1",
    active: "msg_u2",
    nodes: {
      msg_u1: { label: "one" },
      msg_u2: { parent: "msg_u1", label: "two" },
    },
  }
  const entries = [
    user(0, "msg_u1", "one"),
    compaction(1, "msg_u1", "msg_u1"),
    user(2, "msg_u2", "two"),
  ]
  const [checkpoint] = treeEntries(tree, entries)
  const message = checkpoint?.message
  expect(message?.type).toBe("compaction")
  if (message?.type !== "compaction") throw new Error("expected a compaction checkpoint")
  expect(JSON.stringify(message.metadata)).toContain("one")
})

test("prefers the deepest compacted node on the active path", () => {
  const tree = {
    version: 1 as const,
    root: "msg_u1",
    active: "msg_u2",
    nodes: {
      msg_u1: { label: "one" },
      msg_u2: { parent: "msg_u1", label: "two" },
    },
  }
  const entries = [
    user(0, "msg_u1", "one"),
    compaction(1, "msg_u1"),
    user(2, "msg_u2", "two"),
    compaction(3, "msg_u2"),
  ]
  expect(treeEntries(tree, entries).map((entry) => String(entry.message.id))).toEqual(["msg_c3"])
})

test("does not apply a compaction from another branch", () => {
  const tree = {
    version: 1 as const,
    root: "msg_u1",
    active: "msg_u3",
    nodes: {
      msg_u1: { label: "one" },
      msg_u2: { parent: "msg_u1", label: "two" },
      msg_u3: { parent: "msg_u1", label: "three" },
    },
  }
  const entries = [
    user(0, "msg_u1", "one"),
    user(1, "msg_u2", "two"),
    compaction(2, "msg_u2"),
    user(3, "msg_u3", "three"),
  ]
  expect(treeEntries(tree, entries).map((entry) => String(entry.message.id))).toEqual(["msg_u1", "msg_u3"])
})