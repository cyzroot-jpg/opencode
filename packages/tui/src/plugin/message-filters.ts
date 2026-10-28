import type { SessionMessageInfo } from "@opencode/client"
import type { MessageFilter } from "@opencode/plugin/tui/context"
import { createSignal } from "solid-js"

type Entry = { readonly id: string; readonly filter: MessageFilter }

const [filters, setFilters] = createSignal<readonly Entry[]>([])

export function registerMessageFilter(id: string, filter: MessageFilter) {
  setFilters((current) => [...current.filter((entry) => entry.id !== id), { id, filter }])
  return () => {
    setFilters((current) => current.filter((entry) => entry.id !== id))
  }
}

export function applyMessageFilters(sessionID: string, messages: readonly SessionMessageInfo[]) {
  let result = messages
  for (const entry of filters()) result = entry.filter({ sessionID, messages: result })
  return [...result]
}