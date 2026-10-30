export * as SessionContextTree from "./context-tree.js"

import { Option, Schema } from "effect"

export const Key = "contextTree"

/** TreeCode experiments can run the same build in linear mode with TREECODE_CONTEXT_TREE=0. */
export const enabled = () => process.env.TREECODE_CONTEXT_TREE !== "0"

/** Headless experiment runs opt into automatic first-prompt initialization with TREECODE_CONTEXT_TREE=1. */
export const autoInitialize = () => process.env.TREECODE_CONTEXT_TREE === "1"

type Metadata = { readonly [key: string]: unknown }

export const Node = Schema.Struct({
  parent: Schema.optional(Schema.String),
  label: Schema.String,
  links: Schema.optional(Schema.Array(Schema.String)),
})
export type Node = typeof Node.Type

export const Info = Schema.Struct({
  version: Schema.Literal(1),
  root: Schema.optional(Schema.String),
  active: Schema.optional(Schema.String),
  pendingRoot: Schema.optional(Schema.Boolean),
  nodes: Schema.Record(Schema.String, Node),
})
export type Info = typeof Info.Type

const decode = Schema.decodeUnknownOption(Info)

export const get = (metadata: Metadata | null | undefined) => {
  const value = metadata?.[Key]
  return value === undefined ? undefined : Option.getOrUndefined(decode(value))
}

export const set = <M extends Metadata>(metadata: M | null | undefined, tree: Info) =>
  ({ ...(metadata ?? {}), [Key]: tree }) as unknown as M

export const detach = <M extends Metadata>(metadata: M | null | undefined) => {
  if (!metadata || metadata[Key] === undefined) return metadata
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== Key)) as M
}

export const label = (text: string) => {
  const value = text.replace(/\s+/g, " ").trim()
  return value.length > 80 ? `${value.slice(0, 79)}…` : value || "(empty prompt)"
}

export const initialize = (messages: readonly { readonly id: string; readonly text: string }[]) => {
  if (messages.length === 0) return
  const nodes: Record<string, Node> = {}
  let parent: string | undefined
  for (const message of messages) {
    if (nodes[message.id]) continue
    nodes[message.id] = { ...(parent ? { parent } : {}), label: label(message.text) }
    parent = message.id
  }
  if (!parent) return
  return { version: 1 as const, root: messages[0]!.id, active: parent, nodes }
}

export const path = (tree: Info, id: string | undefined) => {
  const result: string[] = []
  const seen = new Set<string>()
  let current = id
  while (current && tree.nodes[current] && !seen.has(current)) {
    seen.add(current)
    result.push(current)
    current = tree.nodes[current]!.parent
  }
  return result.reverse()
}

const last = (tree: Info) => (tree.active && tree.nodes[tree.active] ? tree.active : Object.keys(tree.nodes).at(-1))

export const add = (tree: Info, id: string, text: string) => {
  if (tree.nodes[id]) return tree
  const parent = last(tree)
  const links = parent ? tree.nodes[parent]?.links : undefined
  return {
    ...tree,
    root: tree.root ?? id,
    active: id,
    pendingRoot: false,
    nodes: {
      ...tree.nodes,
      [id]: {
        ...(parent ? { parent } : {}),
        label: label(text),
        ...(links?.length ? { links } : {}),
      },
    },
  }
}

export const addRoot = (tree: Info, id: string, text: string) => {
  if (tree.nodes[id]) return tree
  return {
    ...tree,
    root: tree.root ?? id,
    active: id,
    pendingRoot: false,
    nodes: { ...tree.nodes, [id]: { label: label(text) } },
  }
}

export const armRoot = (tree: Info) => ({ ...tree, pendingRoot: true })

export const switchTo = (tree: Info, id: string) =>
  tree.nodes[id] ? { ...tree, active: id, pendingRoot: false } : tree

export const link = (tree: Info, id: string) => {
  const active = tree.active
  if (!active || !tree.nodes[active] || !tree.nodes[id] || id === active) return tree
  const current = tree.nodes[active]
  if (current.links?.includes(id)) return tree
  return {
    ...tree,
    nodes: { ...tree.nodes, [active]: { ...current, links: [...(current.links ?? []), id] } },
  }
}

export const unlink = (tree: Info, id: string) => {
  const active = tree.active
  if (!active || !tree.nodes[active]) return tree
  const current = tree.nodes[active]
  if (!current.links?.includes(id)) return tree
  const links = current.links.filter((item) => item !== id)
  return {
    ...tree,
    nodes: {
      ...tree.nodes,
      [active]: {
        label: current.label,
        ...(current.parent ? { parent: current.parent } : {}),
        ...(links.length ? { links } : {}),
      },
    },
  }
}

export const remove = (tree: Info, id: string) => {
  if (!tree.nodes[id]) return tree
  const removed = new Set<string>()
  const pending = [id]
  while (pending.length) {
    const current = pending.pop()!
    if (removed.has(current)) continue
    removed.add(current)
    for (const [child, node] of Object.entries(tree.nodes)) {
      if (node.parent === current) pending.push(child)
    }
  }
  const nodes: Record<string, Node> = {}
  for (const [nodeID, node] of Object.entries(tree.nodes)) {
    if (removed.has(nodeID)) continue
    const links = node.links?.filter((link) => !removed.has(link))
    nodes[nodeID] = {
      label: node.label,
      ...(node.parent && !removed.has(node.parent) ? { parent: node.parent } : {}),
      ...(links?.length ? { links } : {}),
    }
  }
  const remaining = Object.keys(nodes)
  if (remaining.length === 0) return { version: 1 as const, pendingRoot: true, nodes: {} }
  const roots = remaining.filter((nodeID) => !nodes[nodeID]!.parent)
  const parent = tree.nodes[id]?.parent
  return {
    version: 1 as const,
    root: tree.root && nodes[tree.root] ? tree.root : roots[0],
    active:
      tree.active && !removed.has(tree.active)
        ? tree.active
        : parent && nodes[parent]
          ? parent
          : roots[0],
    pendingRoot: false,
    nodes,
  }
}

export const order = (tree: Info) => {
  const result: { readonly id: string; readonly node: Node; readonly depth: number }[] = []
  const children = new Map<string | undefined, string[]>()
  for (const [id, node] of Object.entries(tree.nodes)) {
    const parent = node.parent && tree.nodes[node.parent] ? node.parent : undefined
    children.set(parent, [...(children.get(parent) ?? []), id])
  }
  const seen = new Set<string>()
  const walk = (id: string, depth: number) => {
    if (seen.has(id)) return
    seen.add(id)
    const node = tree.nodes[id]
    if (!node) return
    result.push({ id, node, depth })
    for (const child of children.get(id) ?? []) walk(child, depth + 1)
  }
  const roots = Object.keys(tree.nodes).filter((id) => {
    const node = tree.nodes[id]!
    return !node.parent || !tree.nodes[node.parent]
  })
  if (tree.root && roots.includes(tree.root)) {
    roots.splice(roots.indexOf(tree.root), 1)
    roots.unshift(tree.root)
  }
  for (const root of roots) walk(root, 0)
  for (const id of Object.keys(tree.nodes)) walk(id, 0)
  return result
}

export interface Entry {
  readonly seq: number
  readonly message: {
    readonly id: string
    readonly type: string
  }
}

export const visible = <T extends { readonly id: string; readonly type: string }>(tree: Info, messages: readonly T[]) => {
  if (Object.keys(tree.nodes).length === 0) return []
  const users = messages.flatMap((message, index) => (message.type === "user" ? [{ id: message.id, index }] : []))
  const position = new Map(users.map((user, index) => [user.id, index]))
  const active = tree.active
  if (!active || !position.has(active)) return [...messages]
  const activePath = path(tree, active).filter((id) => position.has(id))
  if (activePath.length === 0) return [...messages]
  const ranges = activePath.map((id) => {
    const index = position.get(id)!
    return {
      start: id === tree.root && index === 0 ? 0 : users[index]!.index,
      end: users[index + 1]?.index ?? messages.length,
    }
  })
  const selected: T[] = []
  const seen = new Set<number>()
  for (const range of ranges) {
    for (let index = range.start; index < range.end; index++) {
      if (seen.has(index)) continue
      seen.add(index)
      selected.push(messages[index]!)
    }
  }
  return selected
}

export const filter = <T extends Entry>(
  tree: Info,
  entries: readonly T[],
  options?: {
    readonly includeCompaction?: boolean
    /** Rewrite or drop entries that come from a linked branch. */
    readonly linkEntry?: (entry: T, nodeID: string) => T | undefined
  },
) => {
  if (Object.keys(tree.nodes).length === 0) return []
  const users = entries.filter((entry) => entry.message.type === "user").map((entry) => entry.message.id)
  const seq = new Map(entries.map((entry) => [entry.message.id, entry.seq]))
  const active = tree.active
  if (!active || !seq.has(active)) return entries
  const activePath = path(tree, active).filter((id) => seq.has(id))
  if (activePath.length === 0) return entries
  const linked: string[] = []
  for (const id of tree.nodes[active]?.links ?? []) {
    if (!tree.nodes[id] || !seq.has(id) || activePath.includes(id) || linked.includes(id)) continue
    const linkedPath = path(tree, id).filter((node) => seq.has(node))
    const common = linkedPath.findLastIndex((node) => activePath.includes(node))
    for (const node of linkedPath.slice(common + 1)) {
      if (!linked.includes(node)) linked.push(node)
    }
  }
  const allowed = [
    ...activePath.map((id) => ({ id, linked: false })),
    ...linked.map((id) => ({ id, linked: true })),
  ]
  const starts = users.map((id) => seq.get(id)!).sort((left, right) => left - right)
  const first = starts[0] ?? 0
  const ranges = allowed.map(({ id, linked }) => {
    const start = seq.get(id)!
    return {
      id,
      start: id === tree.root && start === first ? 0 : start,
      end: starts.find((value) => value > start) ?? Number.POSITIVE_INFINITY,
      linked,
    }
  })
  const selected: T[] = []
  const seen = new Set<number>()
  for (const range of ranges) {
    for (const entry of entries) {
      if (entry.seq < range.start || entry.seq >= range.end) continue
      if ((!options?.includeCompaction && entry.message.type === "compaction") || seen.has(entry.seq)) continue
      seen.add(entry.seq)
      const value = range.linked && options?.linkEntry ? options.linkEntry(entry, range.id) : entry
      if (value) selected.push(value)
    }
  }
  return selected
}