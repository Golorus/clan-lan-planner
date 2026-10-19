/**
 * Orga: markierten Bereich fixieren. Wer außerhalb sitzt, verliert seinen Platz (mit Nachricht); danach setzen sich
 * nur noch Leute ohne Platz, nur im Bereich, und es gibt höchstens so viele Zusagen wie Plätze im Bereich.
 */
export default defineEventHandler(async (event) => {
  return fixArea(await requireLeaderActor(event))
})
