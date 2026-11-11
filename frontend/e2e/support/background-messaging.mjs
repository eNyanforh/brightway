// Keep unrelated browser journeys independent of ongoing presence/notification traffic.
export function backgroundMessaging(route) {
  const path = new URL(route.request().url()).pathname;
  if (path === "/api/v1/messaging/heartbeat") return route.fulfill({ json: { success: true, data: { saved: true } } });
  if (path === "/api/v1/messaging/events") return route.fulfill({ contentType: "text/event-stream", body: ": synthetic background channel\n\n" });
  return null;
}
