import { mountKids } from "./ui";
const base = (window as unknown as { SILBENFLUG_API?: string }).SILBENFLUG_API || "";
mountKids(document.getElementById("app") as HTMLElement, { base, storage: window.localStorage });
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => { /* ohne Offline-Hülle weiter */ }); });
