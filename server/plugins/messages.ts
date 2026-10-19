/** Beim Start: Nachrichten, die vor einem Neustart noch nicht verschickt waren, weiter abarbeiten */
export default defineNitroPlugin(() => {
  setTimeout(() => kickMessageWorker(), 5000)
})
