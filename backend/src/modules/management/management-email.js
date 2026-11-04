export function createManagementEmail({ apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, fetcher = globalThis.fetch } = {}) {
  const unavailable = () => Object.assign(Error("Management email delivery is temporarily unavailable."), { status: 503 });
  function check() { if (!apiKey || !from || /[\r\n]/.test(from)) throw unavailable(); }
  return { check, async send({ email, code, deliveryId, purpose }) {
    check();
    try {
      const response = await fetcher("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `management/${deliveryId}` }, body: JSON.stringify({ from, to: [email], subject: purpose === "ENROLL" ? "Set up BrightWay Management" : "Recover BrightWay Management access", text: `Your BrightWay Management email code is ${code}. It expires in 10 minutes. Enter it only in the management portal. ${purpose === "RECOVERY" ? "Your authenticator or an unused management backup code is also required. " : ""}This code cannot verify or recover a personal BrightWay account. If you did not request it, ignore this message.` }) });
      if (!response.ok || typeof (await response.json()).id !== "string") throw unavailable();
    } catch { throw unavailable(); }
  } };
}
