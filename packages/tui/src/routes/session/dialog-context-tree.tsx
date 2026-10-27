import { SessionContextTree } from "@opencode/core/session/context-tree"
import { createEffect, createMemo, createSignal, onMount } from "solid-js"
import { useClient } from "../../context/client"
import { useData } from "../../context/data"
import { DialogConfirm } from "../../ui/dialog-confirm"
import { DialogSelect, type DialogSelectOption } from "../../ui/dialog-select"
import { useDialog } from "../../ui/dialog"
import { useToast } from "../../ui/toast"
import { errorMessage } from "../../util/error"

const NEW_ROOT = "__opencode_new_root__"

export function DialogContextTree(props: {
  sessionID: string
  mode: "switch" | "link" | "delete" | "compact"
  onSwitch?: () => void
}) {
  const data = useData()
  const client = useClient()
  const dialog = useDialog()
  const toast = useToast()

  const build = () =>
    SessionContextTree.initialize(
      data.session.message
        .list(props.sessionID)
        .filter((message) => message.type === "user")
        .map((message) => ({ id: message.id, text: message.text })),
    )

  const session = createMemo(() => data.session.get(props.sessionID))
  const stored = createMemo(() => SessionContextTree.get(session()?.metadata))
  const [tree, setTree] = createSignal(stored() ?? build())

  createEffect(() => {
    const next = stored()
    if (next) setTree(next)
  })

  let pending = Promise.resolve()
  const update = (change: (tree: SessionContextTree.Info) => SessionContextTree.Info) => {
    pending = pending.then(async () => {
      const current = data.session.get(props.sessionID)
      const base = SessionContextTree.get(current?.metadata) ?? tree()
      if (!current || !base) return
      const next = change(base)
      try {
        await client.api.session.update({
          sessionID: props.sessionID,
          metadata: SessionContextTree.set(current.metadata, next),
        })
        setTree(next)
        data.session.invalidate(props.sessionID)
        await data.session.sync(props.sessionID)
        setTree(SessionContextTree.get(data.session.get(props.sessionID)?.metadata) ?? next)
      } catch (error) {
        toast.show({ message: errorMessage(error), variant: "error", duration: 5000 })
      }
    })
    return pending
  }

  onMount(() => {
    dialog.setSize("large")
    if (stored()) return
    const initialized = build()
    if (!initialized) {
      toast.show({ message: "No user messages to build a context tree", variant: "error", duration: 4000 })
      dialog.clear()
      return
    }
    void update((current) => current)
  })

  const options = createMemo((): DialogSelectOption<string>[] => {
    const current = tree()
    if (!current) return []
    const active = current.active
    const links = active ? (current.nodes[active]?.links ?? []) : []
    const newRoot: DialogSelectOption<string>[] =
      props.mode === "switch"
        ? [
            {
              title: "＋ New root",
              value: NEW_ROOT,
              footer: "next prompt",
              onSelect: () => {
                void update((current) => SessionContextTree.armRoot(current)).then(() => {
                  dialog.clear()
                  toast.show({ message: "Next prompt starts a new root", variant: "success", duration: 4000 })
                })
              },
            },
          ]
        : []
    return [
      ...newRoot,
      ...SessionContextTree.order(current).map(({ id, node, depth }) => ({
        title: `${"  ".repeat(depth)}${node.label}`,
        value: id,
        footer: id === active ? "active" : links.includes(id) ? "linked" : undefined,
        onSelect: () => {
          if (props.mode === "compact") {
            void update((tree) => SessionContextTree.switchTo(tree, id)).then(() => {
              dialog.clear()
              props.onSwitch?.()
              void data.session
                .compact({ sessionID: props.sessionID })
                .catch((error) => toast.show({ message: errorMessage(error), variant: "error" }))
              toast.show({ message: `Compacting ${node.label}`, variant: "success", duration: 4000 })
            })
            return
          }
          if (props.mode === "delete") {
            const next = SessionContextTree.remove(current, id)
            const remove = () =>
              update((tree) => SessionContextTree.remove(tree, id)).then(() =>
                toast.show({
                  message:
                    Object.keys(next.nodes).length === 0
                      ? "Context cleared. Next prompt starts a new session."
                      : `Deleted ${node.label}`,
                  variant: "success",
                  duration: 4000,
                }),
              )
            if (!node.parent || !current.nodes[node.parent]) {
              dialog.replace(() => (
                <DialogConfirm
                  title="Delete root node?"
                  message={`Delete "${node.label}" and its branches? If it is the last root, the session starts fresh.`}
                  onConfirm={remove}
                />
              ))
              return
            }
            void remove()
            return
          }
          if (props.mode === "link") {
            if (!active || id === active) return
            void update((tree) =>
              tree.nodes[tree.active ?? ""]?.links?.includes(id)
                ? SessionContextTree.unlink(tree, id)
                : SessionContextTree.link(tree, id),
            )
            return
          }
          void update((tree) => SessionContextTree.switchTo(tree, id)).then(() => {
            dialog.clear()
            props.onSwitch?.()
            toast.show({ message: `Context switched to ${node.label}`, variant: "success", duration: 3000 })
          })
        },
      })),
    ]
  })

  return (
    <DialogSelect
      title={
        props.mode === "link"
          ? "Link context node"
          : props.mode === "delete"
            ? "Delete context node"
            : props.mode === "compact"
              ? "Compact context node"
              : "Context tree"
      }
      options={options()}
      current={tree()?.active}
    />
  )
}