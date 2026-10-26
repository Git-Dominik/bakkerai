type VerificationEmailOptions = {
  to: string;
  name: string;
  code: string;
  expiresInMinutes: number;
};

type PasswordResetEmailOptions = {
  to: string;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
};

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  devLog: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

async function sendEmail({ to, subject, text, html, devLog }: EmailMessage) {
  const apiKey = Bun.env.RESEND_API_KEY;
  const from = Bun.env.EMAIL_FROM;

  if (!apiKey || !from) {
    if (Bun.env.NODE_ENV === "production") {
      throw new Error(
        "E-mailverzending is niet geconfigureerd (RESEND_API_KEY/EMAIL_FROM).",
      );
    }

    console.warn(
      `[email] RESEND_API_KEY of EMAIL_FROM ontbreekt. ${devLog}`,
    );
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Resend-fout (${response.status}): ${body.slice(0, 300)}`,
    );
  }
}

export async function sendVerificationEmail({
  to,
  name,
  code,
  expiresInMinutes,
}: VerificationEmailOptions) {
  const subject = "Je BakkerBot-verificatiecode";
  const text = [
    `Hallo ${name},`,
    "",
    "Gebruik deze code om je BakkerBot-account te verifiëren:",
    "",
    code,
    "",
    `De code is ${expiresInMinutes} minuten geldig.`,
    "Heb je je niet aangemeld? Negeer deze e-mail.",
    "",
    "BakkerBot",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f1f1f;max-width:520px;margin:0 auto;padding:24px">
      <p>Hallo ${escapeHtml(name)},</p>
      <p>Gebruik deze code om je BakkerBot-account te verifiëren:</p>
      <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
      <p>De code is ${expiresInMinutes} minuten geldig.</p>
      <p>Heb je je niet aangemeld? Negeer deze e-mail.</p>
      <p style="color:#666;margin-top:32px">BakkerBot</p>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    text,
    html,
    devLog: `Verificatiecode voor ${to}: ${code}`,
  });
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetUrl,
  expiresInMinutes,
}: PasswordResetEmailOptions) {
  const subject = "Stel je BakkerBot-wachtwoord opnieuw in";
  const text = [
    `Hallo ${name},`,
    "",
    "We hebben een aanvraag ontvangen om je BakkerBot-wachtwoord opnieuw in te stellen.",
    "Gebruik deze link om een nieuw wachtwoord te kiezen:",
    "",
    resetUrl,
    "",
    `De link is ${expiresInMinutes} minuten geldig en kan maar één keer worden gebruikt.`,
    "Heb je dit niet aangevraagd? Negeer deze e-mail; je wachtwoord blijft ongewijzigd.",
    "",
    "BakkerBot",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f1f1f;max-width:520px;margin:0 auto;padding:24px">
      <p>Hallo ${escapeHtml(name)},</p>
      <p>We hebben een aanvraag ontvangen om je BakkerBot-wachtwoord opnieuw in te stellen.</p>
      <p style="margin:28px 0">
        <a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#1a4a42;color:#ffffff;text-decoration:none;padding:13px 22px;border-radius:8px;font-weight:700">
          Nieuw wachtwoord kiezen
        </a>
      </p>
      <p>De link is ${expiresInMinutes} minuten geldig en kan maar één keer worden gebruikt.</p>
      <p>Heb je dit niet aangevraagd? Negeer deze e-mail; je wachtwoord blijft ongewijzigd.</p>
      <p style="color:#666;margin-top:32px">BakkerBot</p>
    </div>
  `;

  await sendEmail({
    to,
    subject,
    text,
    html,
    devLog: `Resetlink voor ${to}: ${resetUrl}`,
  });
}
