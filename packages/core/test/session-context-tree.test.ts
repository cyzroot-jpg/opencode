import { describe, expect, test } from "bun:test"
import { SessionContextTree } from "../src/session/context-tree.js"

const turn = (seq: number, id: string, type: "user" | "assistant" | "compaction" = "user") => ({
  seq,
  message: { id, type },
})

const entries = [
  turn(0, "u1"),
  turn(1, "a1", "assistant"),
  turn(2, "u2"),
  turn(3, "a2", "assistant"),
  turn(4, "u3"),
  turn(5, "a3", "assistant"),
]

describe("SessionContextTree", () => {
  test("initializes a linear tree from user messages", () => {
    expect(SessionContextTree.initialize([{ id: "u1", text: "first" }])).toEqual({
      version: 1,
      root: "u1",
      active: "u1",
      nodes: { u1: { label: "first" } },
    })
    expect(
      SessionContextTree.initialize([
        { id: "u1", text: "first" },
        { id: "u2", text: "second" },
      ]),
    ).toMatchObject({
      root: "u1",
      active: "u2",
      nodes: { u1: { label: "first" }, u2: { parent: "u1", label: "second" } },
    })
    expect(SessionContextTree.initialize([])).toBeUndefined()
  })

  test("adds a child under the active node and copies its links", () => {
    const base = SessionContextTree.initialize([{ id: "u1", text: "first" }])!
    const node = SessionContextTree.add(base, "u2", "second")
    expect(node.active).toBe("u2")
    expect(node.nodes.u2).toEqual({ parent: "u1", label: "second" })
  })

  test("switches the active node without changing the tree", () => {
    const tree = {
      ...SessionContextTree.initialize([{ id: "u1", text: "first" }])!,
      nodes: {
        u1: { label: "first" },
        u2: { parent: "u1", label: "second" },
        u3: { parent: "u1", label: "third" },
      },
      active: "u2",
    }
    expect(SessionContextTree.switchTo(tree, "u3")).toMatchObject({ active: "u3" })
    expect(SessionContextTree.switchTo(tree, "missing")).toBe(tree)
  })

  test("creates additional roots and arms the next prompt", () => {
    const base = SessionContextTree.initialize([{ id: "u1", text: "first" }])!
    const armed = SessionContextTree.armRoot(base)
    expect(armed.pendingRoot).toBe(true)
    const tree = SessionContextTree.addRoot(armed, "u4", "new root")
    expect(tree).toMatchObject({
      root: "u1",
      active: "u4",
      pendingRoot: false,
      nodes: { u1: { label: "first" }, u4: { label: "new root" } },
    })
    expect(SessionContextTree.order(tree).map((item) => item.id)).toEqual(["u1", "u4"])
    const messages = [
      { id: "u1", type: "user" },
      { id: "a1", type: "assistant" },
      { id: "u4", type: "user" },
      { id: "a4", type: "assistant" },
    ]
    expect(SessionContextTree.visible(tree, messages).map((message) => message.id)).toEqual(["u4", "a4"])
  })

  test("links and unlinks another node", () => {
    const tree = {
      ...SessionContextTree.initialize([{ id: "u1", text: "first" }])!,
      nodes: {
        u1: { label: "first" },
        u2: { parent: "u1", label: "second" },
        u3: { parent: "u1", label: "third" },
      },
      active: "u2",
    }
    expect(SessionContextTree.link(tree, "u3").nodes.u2).toEqual({
      parent: "u1",
      label: "second",
      links: ["u3"],
    })
    expect(SessionContextTree.link(tree, "u1").nodes.u2?.links).toEqual(["u1"])
    expect(SessionContextTree.link(tree, "u2")).toBe(tree)
    const linked = SessionContextTree.link(tree, "u3")
    expect(SessionContextTree.unlink(linked, "u3").nodes.u2).toEqual({ parent: "u1", label: "second" })
  })

  test("keeps only the active ancestry when filtering turns", () => {
    const tree = {
      version: 1 as const,
      root: "u1",
      active: "u2",
      nodes: {
        u1: { label: "first" },
        u2: { parent: "u1", label: "second" },
        u3: { parent: "u1", label: "third" },
      },
    }
    expect(SessionContextTree.filter(tree, entries).map((entry) => entry.message.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
    ])
  })

  test("shows only the active ancestry in order", () => {
    const messages = [
      { id: "u1", type: "user" },
      { id: "a1", type: "assistant" },
      { id: "u2", type: "user" },
      { id: "a2", type: "assistant" },
      { id: "u3", type: "user" },
      { id: "a3", type: "assistant" },
    ]
    const tree = {
      version: 1 as const,
      root: "u1",
      active: "u2",
      nodes: {
        u1: { label: "first" },
        u2: { parent: "u1", label: "second" },
        u3: { parent: "u1", label: "third" },
      },
    }
    expect(SessionContextTree.visible(tree, messages).map((message) => message.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
    ])
    expect(
      SessionContextTree.visible({ ...tree, active: "u1" }, messages).map((message) => message.id),
    ).toEqual(["u1", "a1"])
  })

  test("links another root into the active context", () => {
    const tree = {
      version: 1 as const,
      root: "u1",
      active: "u4",
      nodes: {
        u1: { label: "first" },
        u4: { label: "fourth", links: ["u1"] },
      },
    }
    const roots = [turn(0, "u1"), turn(1, "a1", "assistant"), turn(2, "u4"), turn(3, "a4", "assistant")]
    expect(SessionContextTree.filter(tree, roots).map((entry) => entry.message.id)).toEqual([
      "u4",
      "a4",
      "u1",
      "a1",
    ])
  })

  test("lets linked entries be compressed without changing the active path", () => {
    const tree = {
      version: 1 as const,
      root: "u1",
      active: "u2",
      nodes: {
        u1: { label: "first" },
        u2: { parent: "u1", label: "second", links: ["u3"] },
        u3: { parent: "u1", label: "third" },
      },
    }
    const selected = SessionContextTree.filter(tree, entries, {
      linkEntry: (entry) => (entry.message.type === "assistant" ? undefined : entry),
    })
    expect(selected.map((entry) => entry.message.id)).toEqual(["u1", "a1", "u2", "a2", "u3"])
  })

  test("appends a linked sibling branch", () => {
    const tree = {
      version: 1 as const,
      root: "u1",
      active: "u2",
      nodes: {
        u1: { label: "first" },
        u2: { parent: "u1", label: "second", links: ["u3"] },
        u3: { parent: "u1", label: "third" },
      },
    }
    expect(SessionContextTree.filter(tree, entries).map((entry) => entry.message.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
      "u3",
      "a3",
    ])
  })

  test("appends linked ancestry and drops compaction rows", () => {
    const tree = {
      version: 1 as const,
      root: "u1",
      active: "u1",
      nodes: {
        u1: { label: "first", links: ["u3"] },
        u2: { parent: "u1", label: "second" },
        u3: { parent: "u2", label: "third" },
      },
    }
    const withCompaction = [...entries, turn(6, "c1", "compaction")]
    expect(SessionContextTree.filter(tree, withCompaction).map((entry) => entry.message.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
      "u3",
      "a3",
    ])
  })

  test("removes a node and its descendants", () => {
    const tree = {
      version: 1 as const,
      root: "u1",
      active: "u3",
      nodes: {
        u1: { label: "first", links: ["u2"] },
        u2: { parent: "u1", label: "second" },
        u3: { parent: "u2", label: "third" },
        u4: { label: "fourth", links: ["u1"] },
      },
    }
    const next = SessionContextTree.remove(tree, "u1")
    expect(next).toMatchObject({
      version: 1,
      root: "u4",
      active: "u4",
      pendingRoot: false,
      nodes: { u4: { label: "fourth" } },
    })
  })

test("clears the tree when the last root is removed", () => {
    const tree = {
      version: 1 as const,
      root: "u1",
      active: "u1",
      nodes: { u1: { label: "first" } },
    }
    const next = SessionContextTree.remove(tree, "u1")
    expect(next).toEqual({ version: 1, pendingRoot: true, nodes: {} })
    expect(SessionContextTree.visible(next, [{ id: "u1", type: "user" }])).toEqual([])
    expect(SessionContextTree.filter(next, [turn(0, "u1")])).toEqual([])
  })

  test("reads and detaches metadata without touching other keys", () => {
    const metadata: Record<string, unknown> = { host: "kept", [SessionContextTree.Key]: {} }
    expect(SessionContextTree.get(metadata)).toBeUndefined()
    const tree = SessionContextTree.initialize([{ id: "u1", text: "first" }])!
    expect(SessionContextTree.get(SessionContextTree.set(metadata, tree))).toEqual(tree)
    expect(SessionContextTree.detach(SessionContextTree.set(metadata, tree))).toEqual({ host: "kept" })
    expect(SessionContextTree.detach(null)).toBeNull()
  })
})