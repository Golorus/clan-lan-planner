import { z } from 'zod'

const bodySchema = z.object({ decision: z.enum(['frei', 'abgelehnt', 'zurück']) })

/** Orga entscheidet über eine Anfrage: freigeben, ablehnen oder eine Ablehnung zurücksetzen */
export default defineEventHandler(async (event) => {
  const actor = await requireLeaderActor(event)
  const id = z.coerce.number().int().positive().parse(getRouterParam(event, 'id'))
  const { decision } = await readValidatedBody(event, bodySchema.parse)
  return decideApproval(id, decision, actor)
})
