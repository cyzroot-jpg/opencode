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
    expect(SessionContextTree.link(tree, "u1")).toBe(tree)
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

  test("reads and detaches metadata without touching other keys", () => {
    const metadata: Record<string, unknown> = { host: "kept", [SessionContextTree.Key]: {} }
    expect(SessionContextTree.get(metadata)).toBeUndefined()
    const tree = SessionContextTree.initialize([{ id: "u1", text: "first" }])!
    expect(SessionContextTree.get(SessionContextTree.set(metadata, tree))).toEqual(tree)
    expect(SessionContextTree.detach(SessionContextTree.set(metadata, tree))).toEqual({ host: "kept" })
    expect(SessionContextTree.detach(null)).toBeNull()
  })
})