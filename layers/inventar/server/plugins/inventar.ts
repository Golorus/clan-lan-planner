/** Inventar: Artikel aus inventarSeed anlegen, solange es noch keins gibt. Aus mit NUXT_PUBLIC_INVENTAR=false. */
export default defineNitroPlugin(() => {
  if (useRuntimeConfig().public.inventar === false) return
  const added = seedStock()
  if (added) console.log(`[inventar] ${added} Artikel aus inventarSeed angelegt`)
})
