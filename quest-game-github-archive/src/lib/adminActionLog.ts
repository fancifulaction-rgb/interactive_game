import { collectClientLog } from './clientLogCollector'

export type AdminActionPhase =
  | 'start'
  | 'rpc_done'
  | 'optimistic'
  | 'reload_skipped'
  | 'reload'
  | 'error'
  | 'done'

let actionSeq = 0

export function nextAdminActionId(label: string): string {
  actionSeq += 1
  return `admin-${actionSeq}-${label.replace(/\s+/g, '-').slice(0, 24)}`
}

export function logAdminAction(
  actionId: string,
  phase: AdminActionPhase,
  data: Record<string, unknown> = {}
): void {
  collectClientLog(
    'adminAction',
    phase,
    { actionId, ...data },
    { level: phase === 'error' ? 'error' : 'info', hypothesisId: 'H-ADMIN' }
  )
}
