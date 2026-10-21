/** Offene und abgelehnte Freigabe-Anfragen und wer ohne Freigabe durchkommt (/orga › Teilnehmer) */
export default defineEventHandler(async (event) => {
  await requireLeader(event)
  setHeader(event, 'Cache-Control', 'no-store')
  return { requests: approvalRequests(), memberRule: memberRule() }
})
