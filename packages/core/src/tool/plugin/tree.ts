export * as ContextTreeTool from "./tree.js"

import { ToolFailure } from "@opencode/ai/effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect, Schema } from "effect"
import { SessionContextTree } from "../../session/context-tree.js"
import { SessionContextTreeSearch } from "../../session/context-tree-search.js"

export const name = "context_tree"

const Input = Schema.Struct({
  action: Schema.Literals(["list", "search", "switch", "link", "unlink", "delete", "root", "compact"]).annotate({
    description:
      "Tree action: list nodes, search branches, switch the active node, link/unlink another node, delete a node and its children, start a new root, or compact a node.",
  }),
  nodeID: Schema.optional(Schema.String).annotate({
    description: "Target node ID from a previous list or search action.",
  }),
  query: Schema.optional(Schema.String).annotate({
    description: "Search text for search, link, or unlink. Link picks the best matching branch when nodeID is omitted.",
  }),
})

const Node = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  parent: Schema.optional(Schema.String),
  depth: Schema.Number,
  active: Schema.Boolean,
  linked: Schema.Boolean,
  score: Schema.optional(Schema.Number),
})

const Output = Schema.Struct({
  message: Schema.String,
  active: Schema.optional(Schema.String),
  nodes: Schema.Array(Node),
})

const describe = (tree: SessionContextTree.Info) => {
  const active = tree.active
  const links = active ? (tree.nodes[active]?.links ?? []) : []
  return SessionContextTree.order(tree)
    .map(({ id, node, depth }) => {
      const marks = [id === active ? "active" : "", links.includes(id) ? "linked" : ""].filter(Boolean)
      return `${"  ".repeat(depth)}${node.label}${marks.length ? ` [${marks.join(", ")}]` : ""} (${id})`
    })
    .join("\n")
}

const hitResult = (tree: SessionContextTree.Info, message: string, hits: SessionContextTreeSearch.Hit[]) => ({
  output: {
    message,
    ...(tree.active ? { active: tree.active } : {}),
    nodes: hits.map((hit) => ({
      id: hit.id,
      label: hit.label,
      depth: hit.depth,
      active: false,
      linked: false,
      score: hit.score,
    })),
  },
  content: message,
  metadata: { contextTree: tree, search: hits },
})

const result = (tree: SessionContextTree.Info, message: string) => {
  const active = tree.active
  const links = active ? (tree.nodes[active]?.links ?? []) : []
  return {
    output: {
      message,
      ...(active ? { active } : {}),
      nodes: SessionContextTree.order(tree).map(({ id, node, depth }) => ({
        id,
        label: node.label,
        ...(node.parent ? { parent: node.parent } : {}),
        depth,
        active: id === active,
        linked: links.includes(id),
      })),
    },
    content: message,
    metadata: { contextTree: tree },
  }
}

export const Plugin = {
  id: "opencode.tool.context-tree",
  effect: Effect.fn("ContextTreeTool.Plugin")(function* (ctx: Context) {
    if (!SessionContextTree.enabled()) return
    yield* ctx.tool.transform((editor) => {
      editor.add({
        name,
        options: { codemode: false },
        description:
          "Inspect or edit this session's context tree. Prefer search with a short query when looking for a prior branch; link can take nodeID or query and automatically picks the single best match. switch changes the active history, link adds another branch path to model context, unlink removes it, root starts a new root on the next prompt, delete removes a node and its children, and compact switches to a node and compacts it.",
        input: Input,
        output: Output,
        execute: (input, context) =>
          Effect.gen(function* () {
            const session = yield* ctx.session.get({ sessionID: context.sessionID })
            const current = SessionContextTree.get(session.metadata)
            if (!current) {
              return yield* new ToolFailure({
                message: "This session has no context tree. Context trees are disabled or not initialized.",
              })
            }
            if (input.action === "list") return result(current, describe(current))
            if (input.action === "search") {
              const query = input.query?.trim()
              if (!query) return yield* new ToolFailure({ message: "search requires query" })
              const hits = SessionContextTreeSearch.search(current, query)
              if (!hits.length) return yield* new ToolFailure({ message: `No branch matched: ${query}` })
              return hitResult(current, `Found ${hits.length} matching branch(es):\n${hits.map((hit) => `- ${hit.label} (${hit.id})`).join("\n")}`, hits)
            }
            if (
              (input.action === "link" || input.action === "unlink") &&
              process.env.TREECODE_CONTEXT_LINK === "0"
            ) {
              return yield* new ToolFailure({ message: "Context tree links are disabled for this experiment" })
            }

            let nodeID = input.nodeID?.trim()
            const query = input.query?.trim()
            if (!nodeID && query && (input.action === "link" || input.action === "unlink" || input.action === "switch")) {
              const hits = SessionContextTreeSearch.search(current, query)
              if (!hits.length) return yield* new ToolFailure({ message: `No branch matched: ${query}` })
              if (hits.length > 1 && hits[0]!.score === hits[1]!.score) {
                return yield* new ToolFailure({ message: `Ambiguous query: ${query}. Use nodeID.` })
              }
              nodeID = hits[0]!.id
            }
            if (input.action !== "root" && input.action !== "compact" && !nodeID) {
              return yield* new ToolFailure({ message: `Action ${input.action} requires nodeID or query` })
            }
            if (nodeID && !current.nodes[nodeID]) {
              return yield* new ToolFailure({ message: `Unknown context tree node: ${nodeID}` })
            }
            if (input.action === "link") {
              const limit = Math.max(1, Number(process.env.TREECODE_CONTEXT_LINK_LIMIT ?? 3) || 3)
              const issue = SessionContextTreeSearch.linkIssue(current, nodeID, limit)
              if (issue) return yield* new ToolFailure({ message: issue })
            }

            let next = current
            switch (input.action) {
              case "switch":
                next = SessionContextTree.switchTo(current, nodeID!)
                break
              case "link":
                next = SessionContextTree.link(current, nodeID!)
                break
              case "unlink":
                next = SessionContextTree.unlink(current, nodeID!)
                break
              case "delete":
                next = SessionContextTree.remove(current, nodeID!)
                break
              case "root":
                next = SessionContextTree.armRoot(current)
                break
              case "compact":
                if (nodeID) next = SessionContextTree.switchTo(current, nodeID)
                break
            }

            if (next !== current) {
              yield* ctx.session.update({
                sessionID: context.sessionID,
                metadata: SessionContextTree.set(session.metadata, next),
              })
            }

            if (input.action === "compact") {
              yield* ctx.session.compact({ sessionID: context.sessionID })
              return result(next, `Compacting ${next.active ?? "the active node"}`)
            }

            const verb =
              input.action === "root"
                ? "The next prompt starts a new root"
                : input.action === "delete"
                  ? `Deleted ${nodeID}`
                  : input.action === "switch"
                    ? `Switched to ${nodeID}`
                    : input.action === "link"
                      ? `Linked ${nodeID}`
                      : `Unlinked ${nodeID}`
            return result(next, `${verb}\n\n${describe(next)}`)
          }).pipe(
            Effect.mapError((error) =>
              error instanceof ToolFailure ? error : new ToolFailure({ message: "Context tree operation failed", error }),
            ),
          ),
      })
    }).pipe(Effect.orDie)
  }),
}