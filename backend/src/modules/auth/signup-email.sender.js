const unavailable = () => Object.assign(new Error("Verification email is temporarily unavailable. Please try again later."), { status: 503 });

// Only server configuration is used. Never return or log provider bodies, keys or codes.
export function createSignupEmailSender({
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.EMAIL_FROM,
  fetcher = globalThis.fetch,
} = {}) {
  function check() {
    if (!apiKey || !from || /[\r\n]/.test(from)) throw unavailable();
  }
  return {
    check,
    async send({ email, code, deliveryId }) {
      check();
      try {
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `signup/${deliveryId}` },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            from, to: [email], subject: "Verify your BrightWay email",
            text: `Your BrightWay verification code is ${code}. It is valid for up to 10 minutes while your signup remains open. Enter it in the signup screen to continue. Do not share this code. If you did not request it, ignore this email.`,
            html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;color:#172033"><h1 style="color:#2563eb">BrightWay</h1><h2>Verify your email</h2><p>Enter this code in the signup screen:</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>This code is valid for up to 10 minutes while your signup remains open. Do not share it.</p><p>If you did not request this code, you can ignore this email.</p></div>`,
          }),
        });
        if (!response.ok) throw unavailable();
        const result = await response.json();
        if (typeof result.id !== "string" || !result.id) throw unavailable();
      } catch { throw unavailable(); }
    },
  };
}
