/** Offene und abgelehnte Freigabe-Anfragen (/orga › Teilnehmer) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  return { requests: approvalRequests() }
})
