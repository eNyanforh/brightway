import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { messagingApi, subscribeMessaging } from "../../api/messaging";
// One background stream per app surface; the inbox owns its richer selected-thread stream.
export default function MessagingRealtime() {
  const { pathname } = useLocation();
  const inbox = pathname === "/messages" || /^\/organization-workspace\/[^/]+\/messages/.test(pathname);
  useEffect(() => {
    if (inbox || typeof EventSource === "undefined") return;
    const api = messagingApi(); let pending = false;
    const beat = async () => { if (pending || document.visibilityState !== "visible") return; pending = true; try { await api.heartbeat(); } catch { /* The next heartbeat rechecks the current session. */ } finally { pending = false; } };
    const close = subscribeMessaging({}, name => {
      if (["sync", "notification:new", "notification:read", "conversation:read"].includes(name)) window.dispatchEvent(new Event("brightway:notifications"));
    });
    void beat(); const timer = setInterval(beat, 20000); document.addEventListener("visibilitychange", beat);
    return () => { close(); clearInterval(timer); document.removeEventListener("visibilitychange", beat); };
  }, [inbox]);
  return null;
}
