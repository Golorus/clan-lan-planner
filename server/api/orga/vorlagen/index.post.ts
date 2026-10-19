import { z } from 'zod'

const templateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(1900),
})

export default defineEventHandler(async (event) => {
  await requireLeader(event)
  const body = await readValidatedBody(event, templateSchema.parse)
  const T = tables.messageTemplates
  return useDb().insert(T).values(body).returning({ id: T.id }).get()
})
