import { describe, expect, test } from "bun:test"
import { SessionContextTree } from "../src/session/context-tree.js"
import { SessionContextTreeSearch } from "../src/session/context-tree-search.js"

const tree: SessionContextTree.Info = {
  version: 1,
  root: "u1",
  active: "u2",
  nodes: {
    u1: { label: "initial task" },
    u2: { parent: "u1", label: "shipping investigation", links: ["u6"] },
    u3: { parent: "u1", label: "discount root cause" },
    u4: { parent: "u3", label: "tax root cause" },
    u5: { parent: "u2", label: "shipping follow-up" },
    u6: { label: "linked investigation" },
  },
}

describe("SessionContextTreeSearch", () => {
  test("finds a linked branch by label", () => {
    expect(SessionContextTreeSearch.search(tree, "discount").map((hit) => hit.id)).toEqual(["u3"])
    expect(SessionContextTreeSearch.search(tree, "root cause").map((hit) => hit.id)).toEqual(["u3", "u4"])
  })

  test("does not suggest the active path, descendants, or existing links", () => {
    expect(SessionContextTreeSearch.search(tree, "shipping")).toEqual([])
    expect(SessionContextTreeSearch.search(tree, "linked")).toEqual([])
    expect(SessionContextTreeSearch.search(tree, "")).toEqual([])
  })

  test("ranks the better match first", () => {
    const ranked = SessionContextTreeSearch.search(tree, "discount root cause")
    expect(ranked[0]?.id).toBe("u3")
    expect(ranked[0]!.score).toBeGreaterThan(ranked[1]?.score ?? 0)
  })

  test("rejects links that do not add a new branch", () => {
    expect(SessionContextTreeSearch.linkIssue(tree, "u2")).toBe("The active node is already in context")
    expect(SessionContextTreeSearch.linkIssue(tree, "u1")).toBe("That node is already on the active ancestry")
    expect(SessionContextTreeSearch.linkIssue(tree, "u5")).toBe("That node is a descendant of the active node")
    expect(SessionContextTreeSearch.linkIssue(tree, "u6")).toBe("That node is already linked")
    expect(SessionContextTreeSearch.linkIssue(tree, "missing")).toBe("Unknown context tree node: missing")
  })

  test("accepts a useful sibling and enforces the link budget", () => {
    const noLinks = { ...tree, nodes: { ...tree.nodes, u2: { parent: "u1", label: "shipping" } } }
    expect(SessionContextTreeSearch.linkIssue(noLinks, "u3")).toBeUndefined()
    const limited = { ...tree, nodes: { ...tree.nodes, u2: { parent: "u1", label: "shipping", links: ["u3", "u4"] } } }
    expect(SessionContextTreeSearch.linkIssue(limited, "u6", 2)).toBe("Link limit reached (2)")
  })
})