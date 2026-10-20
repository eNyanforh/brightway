const unavailable = () => Object.assign(new Error("Password recovery email is temporarily unavailable."), { status: 503 });
export function createPasswordResetSender({ apiKey = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM, fetcher = globalThis.fetch } = {}) {
  function check() { if (!apiKey || !from || /[\r\n]/.test(from)) throw unavailable(); }
  async function sendMessage(email, deliveryId, subject, text) {
    check();
    try {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST", signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": deliveryId },
        body: JSON.stringify({ from, to: [email], subject, text }),
      });
      if (!response.ok || typeof (await response.json()).id !== "string") throw unavailable();
    } catch { throw unavailable(); }
  }
  return {
    check,
    send({ email, code, deliveryId }) {
      return sendMessage(email, `password-reset/${deliveryId}`, "Reset your BrightWay password", `Your BrightWay password reset code is ${code}. It expires in 10 minutes. Enter it only on BrightWay. Do not share it. If you did not request a password reset, ignore this email; your password has not changed.`);
    },
    notify({ email, deliveryId }) {
      return sendMessage(email, `password-reset-completed/${deliveryId}`, "Your BrightWay password was changed", "Your BrightWay password was changed using email recovery. All previous sessions have been signed out. If you did not make this change, use BrightWay password recovery immediately and contact BrightWay support through the official service. This message contains no password or reset code.");
    },
  };
}
