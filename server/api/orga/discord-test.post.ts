/**
 * Prüft den Bot: schickt dem Projektleiter selbst eine Direktnachricht, mit Test-Knöpfen, wenn die Knöpfe
 * eingerichtet sind (NUXT_DISCORD_PUBLIC_KEY). Die Knöpfe ändern nichts, sie zeigen nur, ob Discord den Planner erreicht.
 */
export default defineEventHandler(async (event) => {
  const user = await requireLeader(event)
  const buttons = testButtons()
  const text = buttons.length
    ? `Test vom ${branding().appName}: Der Bot kann dir Direktnachrichten schicken. 🌵\nDrück die Knöpfe: Kommt eine Antwort, erreicht Discord den Planner. „Formular testen“ läuft genauso wie „Ich habe gebucht“. Eingetragen wird dabei nichts.`
    : `Test vom ${branding().appName}: Der Bot kann dir Direktnachrichten schicken. 🌵\nKnöpfe gibt es noch nicht: Dafür fehlt NUXT_DISCORD_PUBLIC_KEY in der .env.`
  try {
    await sendDirectMessage(user.discordId, text, buttons.length ? buttons : undefined)
    return { ok: true, buttons: buttons.length > 0 }
  }
  catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw createError({ statusCode: 502, statusMessage: 'Discord hat abgelehnt: ' + message })
  }
})
