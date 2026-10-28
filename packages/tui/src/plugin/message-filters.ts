import type { SessionMessageInfo } from "@opencode/client"
import type { MessageFilter } from "@opencode/plugin/tui/context"
import { createStore, produce } from "solid-js/store"

const [filters, setFilters] = createStore<Record<string, MessageFilter>>({})

export function registerMessageFilter(id: string, filter: MessageFilter) {
  setFilters(id, filter)
  return () => {
    setFilters(
      produce((draft) => {
        delete draft[id]
      }),
    )
  }
}

export function applyMessageFilters(sessionID: string, messages: readonly SessionMessageInfo[]) {
  let result = messages
  for (const filter of Object.values(filters)) result = filter({ sessionID, messages: result })
  return [...result]
}