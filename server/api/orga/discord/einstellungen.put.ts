import { z } from 'zod'

const bodySchema = z.object({ eventRoleId: z.string().regex(/^\d{5,25}$/).nullable() })

/** Event-Rolle in /orga setzen (null = wieder die aus NUXT_DISCORD_EVENT_ROLE_ID); nie die Orga-Rolle */
export default defineEventHandler(async (event) => {
  const leader = await requireLeaderActor(event)
  const { eventRoleId } = await readValidatedBody(event, bodySchema.parse)
  const orga = String(useRuntimeConfig().discord.orgaRoleId || '').trim()
  if (eventRoleId && eventRoleId === orga) {
    throw createError({ statusCode: 400, statusMessage: `Das ist die Orga-Rolle. Die ${branding().eventRoleName} muss eine andere sein, sonst wäre jeder Zugesagte in der Orga.` })
  }
  saveDiscordSettings({ eventRoleId })
  const ev = currentEvent()
  if (ev) writeLog(useDb(), ev.id, leader, { action: 'rolle eingestellt', detail: eventRoleId ? `${branding().eventRoleName} ${eventRoleId}` : `${branding().eventRoleName} aus der .env` })
  return { eventRoleId: roleConfig().eventRoleId }
})
