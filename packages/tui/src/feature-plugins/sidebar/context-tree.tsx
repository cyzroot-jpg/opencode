import { SessionContextTree } from "@opencode/core/session/context-tree"
import { Plugin } from "@opencode/plugin/tui"
import { createMemo, For, Show } from "solid-js"

export function SidebarContextTree(props: { context: Plugin.Context; sessionID: string }) {
  const theme = props.context.theme
  const session = createMemo(() => props.context.data.session.get(props.sessionID))
  const tree = createMemo(() => SessionContextTree.get(session()?.metadata))
  const links = createMemo(() => {
    const current = tree()
    const active = current?.active
    if (!current || !active) return []
    return (current.nodes[active]?.links ?? []).flatMap((id) => {
      const node = current.nodes[id]
      return node ? [{ id, label: node.label, root: node.parent === undefined }] : []
    })
  })

  return (
    <Show when={links().length > 0}>
      <box>
        <text fg={theme.text.base}>
          <b>Linked context</b>
        </text>
        <For each={links()}>
          {(item) => (
            <text fg={theme.text.muted}>
              • {item.label}
              {item.root ? " (root)" : ""}
            </text>
          )}
        </For>
      </box>
    </Show>
  )
}

export default Plugin.define({
  id: "opencode.sidebar.context-tree",
  setup(context) {
    context.ui.slot({
      append: "sidebar.content",
      render: (props) => <SidebarContextTree context={context} sessionID={props.sessionID} />,
    })
  },
})