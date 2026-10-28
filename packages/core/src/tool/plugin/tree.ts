export * as ContextTreeTool from "./tree.js"

import { ToolFailure } from "@opencode/ai/effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Effect, Schema } from "effect"
import { SessionContextTree } from "../../session/context-tree.js"

export const name = "context_tree"

const Input = Schema.Struct({
  action: Schema.Literals(["list", "switch", "link", "unlink", "delete", "root", "compact"]).annotate({
    description:
      "Tree action: list nodes, switch the active node, link/unlink another node, delete a node and its children, start a new root, or compact a node.",
  }),
  nodeID: Schema.optional(Schema.String).annotate({
    description: "Target node ID from a previous list action. Not needed for list, root, or compacting the active node.",
  }),
})

const Node = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  parent: Schema.optional(Schema.String),
  depth: Schema.Number,
  active: Schema.Boolean,
  linked: Schema.Boolean,
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
          "Inspect or edit this session's context tree. Use list before choosing a node. switch changes the active history, link adds another branch path to model context, unlink removes it, root starts a new root on the next prompt, delete removes a node and its children, and compact switches to a node and compacts it.",
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

            const nodeID = input.nodeID?.trim()
            if (input.action !== "root" && input.action !== "compact" && !nodeID) {
              return yield* new ToolFailure({ message: `Action ${input.action} requires nodeID` })
            }
            if (nodeID && !current.nodes[nodeID]) {
              return yield* new ToolFailure({ message: `Unknown context tree node: ${nodeID}` })
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