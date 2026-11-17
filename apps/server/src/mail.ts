// E-Mail-Versand. Der Server ruft nur diese Schnittstelle auf; der Anbieter ist austauschbar (Standard: Resend über HTTPS, passt zu Cloudflare Workers).
export interface Mail { to: string; subject: string; text: string }
export type Mailer = (m: Mail) => Promise<void>;

export function resendMailer(apiKey: string, from: string, fetchFn: (url: string, init: any) => Promise<{ ok: boolean; status: number }> = (u, i) => fetch(u, i)): Mailer {
  return async (m) => {
    const res = await fetchFn("https://api.resend.com/emails", { method: "POST", headers: { authorization: "Bearer " + apiKey, "content-type": "application/json" }, body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text }) });
    if (!res.ok) throw new Error("E-Mail-Anbieter antwortete mit Fehler " + res.status);
  };
}
