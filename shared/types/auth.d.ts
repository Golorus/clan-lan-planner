declare module '#auth-utils' {
  interface User {
    discordId: string
    username: string
    displayName: string | null
    /** nur für die Anzeige; geprüft wird auf dem Server immer gegen NUXT_LEADER_DISCORD_ID */
    isLeader: boolean
  }
}

export {}
