import { SessionContextTree } from "@opencode/core/session/context-tree"
import { createEffect, createMemo, createSignal, onMount } from "solid-js"
import { useClient } from "../../context/client"
import { useData } from "../../context/data"
import { DialogSelect, type DialogSelectOption } from "../../ui/dialog-select"
import { useDialog } from "../../ui/dialog"
import { useToast } from "../../ui/toast"
import { errorMessage } from "../../util/error"

const NEW_ROOT = "__opencode_new_root__"

export function DialogContextTree(props: {
  sessionID: string
  mode: "switch" | "link"
  onSwitch?: () => void
  onNewRoot?: () => void
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

  const update = async (next: SessionContextTree.Info) => {
    const current = session()
    if (!current) return
    try {
      await client.api.session.update({
        sessionID: props.sessionID,
        metadata: SessionContextTree.set(current.metadata, next),
      })
      setTree(next)
    } catch (error) {
      toast.show({ message: errorMessage(error), variant: "error", duration: 5000 })
    }
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
    void update(initialized)
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
                props.onNewRoot?.()
                dialog.clear()
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
          if (props.mode === "link") {
            if (!active || id === active) return
            void update(links.includes(id) ? SessionContextTree.unlink(current, id) : SessionContextTree.link(current, id))
            return
          }
          void update(SessionContextTree.switchTo(current, id)).then(() => {
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
      title={props.mode === "link" ? "Link context node" : "Context tree"}
      options={options()}
      current={tree()?.active}
    />
  )
}