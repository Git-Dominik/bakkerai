import { Elysia, t } from "elysia";
import { hash, verify } from "argon2";
import jwt from "@elysiajs/jwt";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";
import {
  AUTH_COOKIE_MAX_AGE,
  JWT_SECRET,
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_TTL_MS,
  VERIFICATION_CODE_TTL_MS,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_RESEND_COOLDOWN_MS,
  getAppUrl,
  isStudentEmail,
  normalizeEmail,
} from "./config";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function codesMatch(expected: string, actual: string) {
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(actual, "hex");

  return a.length === b.length && timingSafeEqual(a, b);
}

function hashVerificationCode(email: string, code: string) {
  return new Bun.CryptoHasher("sha256")
    .update(`${JWT_SECRET}:${normalizeEmail(email)}:${code}`)
    .digest("hex");
}

function hashResetToken(token: string) {
  return new Bun.CryptoHasher("sha256")
    .update(`${JWT_SECRET}:password-reset:${token}`)
    .digest("hex");
}

async function issueVerificationCode(user: {
  id: number;
  name: string;
  email: string;
}) {
  const code = createVerificationCode();
  const now = new Date();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      verificationCodeHash: hashVerificationCode(user.email, code),
      verificationExpiresAt: new Date(
        now.getTime() + VERIFICATION_CODE_TTL_MS,
      ),
      verificationSentAt: now,
      verificationAttempts: 0,
    },
  });

  try {
    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      code,
      expiresInMinutes: Math.round(VERIFICATION_CODE_TTL_MS / 60000),
    });
  } catch (error) {
    await prisma.user
      .update({
        where: { id: user.id },
        data: { verificationSentAt: null },
      })
      .catch(() => {});
    throw error;
  }
}

async function issuePasswordReset(
  user: { id: number; name: string; email: string },
  requestUrl: string,
) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const resetUrl = `${getAppUrl(requestUrl)}/reset-password?token=${encodeURIComponent(token)}`;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      resetTokenHash: hashResetToken(token),
      resetTokenExpiresAt: new Date(now.getTime() + PASSWORD_RESET_TTL_MS),
      resetRequestedAt: now,
    },
  });

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl,
      expiresInMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60000),
    });
  } catch (error) {
    await prisma.user
      .update({
        where: { id: user.id },
        data: { resetRequestedAt: null },
      })
      .catch(() => {});
    throw error;
  }
}

async function setSession(
  jwt: any,
  cookie: any,
  user: { id: number; email: string },
) {
  const token = await jwt.sign({
    email: user.email,
    sub: user.id.toString(),
  });

  cookie.auth.set({
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: Bun.env.NODE_ENV === "production",
    path: "/",
    maxAge: AUTH_COOKIE_MAX_AGE,
  });
}

function validateEmail(email: string) {
  if (!EMAIL_PATTERN.test(email)) {
    return "Vul een geldig e-mailadres in.";
  }

  if (!isStudentEmail(email)) {
    return "Gebruik je @student.talland.nl e-mailadres.";
  }

  return null;
}

export const authRoutes = new Elysia()
  .use(jwt({ name: "jwt", secret: JWT_SECRET }))
  .post(
    "/register",
    async ({ body, set }) => {
      const name = body.username.trim();
      const email = normalizeEmail(body.email);
      const password = body.password;

      const emailError = validateEmail(email);
      if (emailError) {
        set.status = 400;
        return { error: emailError };
      }

      if (name.length < 2 || name.length > 60) {
        set.status = 400;
        return {
          error: "Gebruik een gebruikersnaam van 2 tot 60 tekens.",
        };
      }

      if (password.length < 8 || password.length > 128) {
        set.status = 400;
        return {
          error: "Gebruik een wachtwoord van 8 tot 128 tekens.",
        };
      }

      const existing = await prisma.user.findUnique({ where: { email } });

      if (existing) {
        if (existing.emailVerified) {
          set.status = 409;
          return {
            error: "Er bestaat al een account met dit e-mailadres.",
          };
        }

        const sentAt = existing.verificationSentAt?.getTime() ?? 0;
        const canResend =
          Date.now() - sentAt >= VERIFICATION_RESEND_COOLDOWN_MS;

        if (canResend) {
          try {
            await issueVerificationCode(existing);
          } catch (error) {
            console.error("[register] resend verification failed:", error);
            set.status = 502;
            return {
              error: "De verificatie-e-mail kon niet worden verzonden. Probeer het later opnieuw.",
              email,
              verify: true,
            };
          }
        }

        return {
          ok: true,
          email,
          message:
            "Dit account wacht nog op verificatie. Controleer je e-mail voor de code.",
        };
      }

      const hashedPassword = await hash(password);

      const user = await prisma.user
        .create({
          data: {
            name,
            email,
            password: hashedPassword,
            emailVerified: false,
          },
        })
        .catch((error) => {
          console.error("[register] create user failed:", error);
          return null;
        });

      if (!user) {
        set.status = 500;
        return {
          error: "Het account kon niet worden aangemaakt. Probeer het opnieuw.",
        };
      }

      try {
        await issueVerificationCode(user);
      } catch (error) {
        console.error("[register] verification email failed:", error);
        set.status = 502;
        return {
          error: "Het account is aangemaakt, maar de verificatie-e-mail kon niet worden verzonden. Vraag op de volgende pagina een nieuwe code aan.",
          email,
          verify: true,
        };
      }

      return {
        ok: true,
        email,
        message:
          "We hebben een verificatiecode naar je e-mailadres gestuurd.",
      };
    },
    {
      body: t.Object({
        username: t.String(),
        email: t.String(),
        password: t.String(),
      }),
    },
  )
  .post(
    "/verify",
    async ({ body, jwt, cookie, set }) => {
      const email = normalizeEmail(body.email);
      const code = body.code.trim();

      const emailError = validateEmail(email);
      if (emailError) {
        set.status = 400;
        return { error: emailError };
      }

      if (!/^\d{6}$/.test(code)) {
        set.status = 400;
        return { error: "Vul de 6-cijferige code uit je e-mail in." };
      }

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        set.status = 400;
        return { error: "De code is ongeldig of verlopen." };
      }

      if (user.emailVerified) {
        return {
          ok: true,
          redirect: "/login",
          message: "Dit account is al geverifieerd. Je kunt inloggen.",
        };
      }

      if (!user.verificationCodeHash || !user.verificationExpiresAt) {
        set.status = 400;
        return {
          error: "Er is geen actieve code. Vraag een nieuwe code aan.",
        };
      }

      if (user.verificationExpiresAt.getTime() < Date.now()) {
        set.status = 400;
        return { error: "De code is verlopen. Vraag een nieuwe code aan." };
      }

      const matches = codesMatch(
        user.verificationCodeHash,
        hashVerificationCode(email, code),
      );

      if (!matches) {
        const attempts = user.verificationAttempts + 1;
        const locked = attempts >= VERIFICATION_MAX_ATTEMPTS;

        await prisma.user.update({
          where: { id: user.id },
          data: {
            verificationAttempts: attempts,
            ...(locked
              ? {
                  verificationCodeHash: null,
                  verificationExpiresAt: null,
                }
              : {}),
          },
        });

        set.status = 400;
        return {
          error: locked
            ? "Te veel onjuiste pogingen. Vraag een nieuwe code aan."
            : `De code is onjuist. Nog ${
                  VERIFICATION_MAX_ATTEMPTS - attempts
              } poging(en).`,
        };
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          emailVerified: true,
          verificationCodeHash: null,
          verificationExpiresAt: null,
          verificationSentAt: null,
          verificationAttempts: 0,
        },
      });

      await setSession(jwt, cookie, user);

      return { ok: true, redirect: "/chat" };
    },
    {
      body: t.Object({
        email: t.String(),
        code: t.String(),
      }),
    },
  )
  .post(
    "/verify/resend",
    async ({ body, set }) => {
      const email = normalizeEmail(body.email);

      const emailError = validateEmail(email);
      if (emailError) {
        set.status = 400;
        return { error: emailError };
      }

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        return {
          ok: true,
          message:
            "Als dit e-mailadres bij ons bekend is, ontvang je een nieuwe code.",
        };
      }

      if (user.emailVerified) {
        set.status = 400;
        return { error: "Dit account is al geverifieerd." };
      }

      const sentAt = user.verificationSentAt?.getTime() ?? 0;
      const elapsed = Date.now() - sentAt;

      if (elapsed < VERIFICATION_RESEND_COOLDOWN_MS) {
        set.status = 429;
        return {
          error: `Wacht ${Math.ceil(
            (VERIFICATION_RESEND_COOLDOWN_MS - elapsed) / 1000,
          )} seconden voordat je een nieuwe code aanvraagt.`,
        };
      }

      try {
        await issueVerificationCode(user);
      } catch (error) {
        console.error("[verify/resend] sending email failed:", error);
        set.status = 502;
        return { error: "De e-mail kon niet worden verzonden. Probeer het later opnieuw." };
      }

      return {
        ok: true,
        message: "We hebben een nieuwe verificatiecode gestuurd.",
      };
    },
    {
      body: t.Object({
        email: t.String(),
      }),
    },
  )
  .post(
    "/forgot-password",
    async ({ body, request, set }) => {
      const email = normalizeEmail(body.email);

      if (!EMAIL_PATTERN.test(email)) {
        set.status = 400;
        return { error: "Vul een geldig e-mailadres in." };
      }

      const user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        const requestedAt = user.resetRequestedAt?.getTime() ?? 0;

        if (Date.now() - requestedAt >= PASSWORD_RESET_COOLDOWN_MS) {
          try {
            await issuePasswordReset(user, request.url);
          } catch (error) {
            console.error("[forgot-password] sending email failed:", error);
          }
        }
      }

      return {
        ok: true,
        message:
          "Als dit e-mailadres bij ons bekend is, ontvang je een e-mail met een resetlink.",
      };
    },
    {
      body: t.Object({
        email: t.String(),
      }),
    },
  )
  .post(
    "/reset-password",
    async ({ body, jwt, cookie, set }) => {
      const token = body.token.trim();

      if (!token) {
        set.status = 400;
        return { error: "Deze resetlink is ongeldig of verlopen." };
      }

      if (body.password.length < 8 || body.password.length > 128) {
        set.status = 400;
        return {
          error: "Gebruik een wachtwoord van 8 tot 128 tekens.",
        };
      }

      const tokenHash = hashResetToken(token);
      const user = await prisma.user.findFirst({
        where: {
          resetTokenHash: tokenHash,
          resetTokenExpiresAt: { gt: new Date() },
        },
      });

      if (!user) {
        set.status = 400;
        return {
          error:
            "Deze resetlink is ongeldig of verlopen. Vraag een nieuwe resetlink aan.",
        };
      }

      const hashedPassword = await hash(body.password);

      const result = await prisma.user.updateMany({
        where: { id: user.id, resetTokenHash: tokenHash },
        data: {
          password: hashedPassword,
          emailVerified: true,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          resetRequestedAt: null,
          verificationCodeHash: null,
          verificationExpiresAt: null,
          verificationSentAt: null,
          verificationAttempts: 0,
        },
      });

      if (result.count === 0) {
        set.status = 400;
        return {
          error:
            "Deze resetlink is ongeldig of verlopen. Vraag een nieuwe resetlink aan.",
        };
      }

      await setSession(jwt, cookie, user);

      return { ok: true, redirect: "/chat" };
    },
    {
      body: t.Object({
        token: t.String(),
        password: t.String(),
      }),
    },
  )
  .post("/logout", async ({ cookie, redirect }) => {
    cookie.auth.remove();
    return redirect("/");
  })
  .post(
    "/login",
    async ({ body, jwt, cookie, set }) => {
      const email = normalizeEmail(body.email);

      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || !(await verify(user.password, body.password))) {
        set.status = 401;
        return { error: "E-mailadres of wachtwoord is onjuist." };
      }

      if (!user.emailVerified) {
        set.status = 403;
        return {
          error: "Verifieer eerst je e-mailadres met de code uit je e-mail.",
          verify: true,
          email,
        };
      }

      await setSession(jwt, cookie, user);

      return { ok: true, redirect: "/chat" };
    },
    {
      body: t.Object({
        email: t.String(),
        password: t.String(),
      }),
    },
  );
