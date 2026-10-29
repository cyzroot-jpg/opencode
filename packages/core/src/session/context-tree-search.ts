export * as SessionContextTreeSearch from "./context-tree-search.js"

import { SessionContextTree } from "./context-tree.js"

export type Hit = {
  readonly id: string
  readonly label: string
  readonly score: number
  readonly depth: number
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

const tokens = (value: string) =>
  normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2)

const score = (label: string, query: string, terms: readonly string[]) => {
  const value = normalize(label)
  const phrase = normalize(query)
  let total = phrase && value.includes(phrase) ? 10 : 0
  for (const term of terms) {
    if (value.includes(term)) total += term.length >= 4 ? 3 : 2
  }
  return total
}

/** Rank nodes outside the active ancestry and current link set. */
export const search = (tree: SessionContextTree.Info, query: string, limit = 5): Hit[] => {
  const phrase = normalize(query)
  if (!phrase) return []
  const terms = tokens(query)
  const active = tree.active
  const onPath = new Set(SessionContextTree.path(tree, active))
  const linked = new Set(active ? (tree.nodes[active]?.links ?? []) : [])
  return SessionContextTree.order(tree)
    .filter(
      ({ id }) =>
        !onPath.has(id) &&
        !linked.has(id) &&
        (!active || !SessionContextTree.path(tree, id).includes(active)),
    )
    .map(({ id, node, depth }) => ({ id, label: node.label, depth, score: score(node.label, phrase, terms) }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score || left.depth - right.depth || left.label.length - right.label.length)
    .slice(0, limit)
}

/** A link is useful only when it adds a branch not already in the active path. */
export const linkIssue = (tree: SessionContextTree.Info, id: string | undefined, limit = 3) => {
  if (!id) return "A link target is required"
  const active = tree.active
  if (!active || !tree.nodes[active]) return "The tree has no active node"
  if (!tree.nodes[id]) return `Unknown context tree node: ${id}`
  if (id === active) return "The active node is already in context"
  const onPath = SessionContextTree.path(tree, active)
  if (onPath.includes(id)) return "That node is already on the active ancestry"
  if (SessionContextTree.path(tree, id).includes(active)) return "That node is a descendant of the active node"
  const links = tree.nodes[active]?.links ?? []
  if (links.includes(id)) return "That node is already linked"
  if (links.length >= limit) return `Link limit reached (${limit})`
  return
}