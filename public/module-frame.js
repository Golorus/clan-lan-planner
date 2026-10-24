// Für Seiten von Modulen, die der Planner einrahmt (app/components/ModuleFrame.vue): meldet die Höhe der Seite,
// damit der Rahmen ohne eigene Bildlaufleiste mitwächst. Einbinden mit <script src="/module-frame.js"></script>.
(() => {
  if (window.parent === window) return
  let last = 0
  const report = () => {
    const h = Math.ceil(document.documentElement.getBoundingClientRect().height)
    if (h === last) return
    last = h
    window.parent.postMessage({ moduleFrameHeight: h }, location.origin)
  }
  const start = () => new ResizeObserver(report).observe(document.body)
  if (document.body) start()
  else document.addEventListener('DOMContentLoaded', start)
})()
