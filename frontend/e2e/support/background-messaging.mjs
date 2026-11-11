// Keep isolated browser journeys independent of background presence and Campus-discovery reads.
export function backgroundMessaging(route) {
  const path = new URL(route.request().url()).pathname;
  if (path === "/api/v1/messaging/heartbeat") return route.fulfill({ json: { success: true, data: { saved: true } } });
  if (path === "/api/v1/messaging/events") return route.fulfill({ contentType: "text/event-stream", body: ": synthetic background channel\n\n" });
  if (route.request().method() === "GET" && ["/api/v1/my-campus", "/api/v1/my-campus/guardians"].includes(path)) return route.fulfill({ json: { success: true, data: { items: [] } } });
  return null;
}
