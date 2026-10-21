import { z } from 'zod'
import { DEFAULT_MIN_DAYS, type MemberRule } from '#shared/utils/access'

const bodySchema = z.object({
  /** null = zurück zur .env */
  rule: z.enum(['server', 'dauer', 'rolle', 'keine']).nullable(),
  roleId: z.string().regex(/^\d{5,25}$/).nullable().optional(),
  minDays: z.number().int().min(1).max(365).optional(),
})

const LABEL: Record<MemberRule, string> = { server: 'jedes Server-Mitglied', dauer: 'Server-Mitglied seit Mindestzeit', rolle: 'nur mit Clan-Rolle', keine: 'niemand, alle Neuen fragen an' }

/** Wer ohne Freigabe in den Planner kommt (shared/utils/access.ts) */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const { rule, roleId, minDays } = await readValidatedBody(event, bodySchema.parse)
  if (rule === 'rolle' && !roleId) throw createError({ statusCode: 400, statusMessage: 'Bitte die Clan-Rolle auswählen.' })
  saveMemberRule(rule ? { rule, roleId: rule === 'rolle' ? roleId! : null, minDays: minDays ?? DEFAULT_MIN_DAYS } : null)
  const now = memberRule()
  const ev = currentEvent()
  if (ev) writeLog(useDb(), ev.id, leader, { action: 'freigabe eingestellt', detail: `Ohne Freigabe: ${LABEL[now.rule]}${now.roleId && now.rule === 'rolle' ? ` (Rolle ${now.roleId})` : ''}${now.rule === 'dauer' ? ` (${now.minDays} Tage)` : ''}${now.source === 'env' ? ', aus der .env' : ''}` })
  return { memberRule: now }
})
