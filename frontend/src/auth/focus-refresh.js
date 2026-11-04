import { expireReadSnapshots } from "../api/read-cache";
const listeners = new Set();
function focus() {
  expireReadSnapshots();
  for (const listener of [...listeners]) listener();
}
export function subscribeFocus(listener) {
  if (!listeners.size) window.addEventListener("focus", focus);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("focus", focus);
  };
}
