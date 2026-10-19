/** Stand der eigenen Freigabe und die Kontaktpersonen zur Auswahl (für die Startseite, wenn der Sitzplan gesperrt ist) */
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const { access, person } = await accessOf(user.discordId)
  const contacts = access === 'approval_needed' || access === 'approval_pending'
    ? useDb().select({ id: tables.contacts.id, nick: tables.contacts.nick }).from(tables.contacts).all().sort((a, b) => a.nick.localeCompare(b.nick, 'de'))
    : []
  return { access, nick: person?.nick ?? null, contactId: person?.contactId ?? null, contacts }
})
