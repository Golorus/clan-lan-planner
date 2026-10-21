import { z } from 'zod'
import type { MemberRule } from '#shared/utils/access'

const bodySchema = z.object({
  /** null = zurück zur .env */
  rule: z.enum(['server', 'rolle', 'keine']).nullable(),
  roleId: z.string().regex(/^\d{5,25}$/).nullable().optional(),
})

const LABEL: Record<MemberRule, string> = { server: 'jedes Server-Mitglied', rolle: 'nur mit Clan-Rolle', keine: 'niemand, alle Neuen fragen an' }

/** Wer ohne Freigabe in den Planner kommt (shared/utils/access.ts) */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const { rule, roleId } = await readValidatedBody(event, bodySchema.parse)
  if (rule === 'rolle' && !roleId) throw createError({ statusCode: 400, statusMessage: 'Bitte die Clan-Rolle auswählen.' })
  saveMemberRule(rule ? { rule, roleId: rule === 'rolle' ? roleId! : null } : null)
  const now = memberRule()
  const ev = currentEvent()
  if (ev) writeLog(useDb(), ev.id, leader, { action: 'freigabe eingestellt', detail: `Ohne Freigabe: ${LABEL[now.rule]}${now.roleId && now.rule === 'rolle' ? ` (Rolle ${now.roleId})` : ''}${now.source === 'env' ? ', aus der .env' : ''}` })
  return { memberRule: now }
})
