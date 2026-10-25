import jwt from "@elysiajs/jwt";
import Elysia, { t } from "elysia";
import { prisma } from "./db";

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

export const compRoutes = new Elysia()
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .get(
    "/comp/header",
    async ({ cookie: { auth }, jwt }) => {
      const token = auth?.value;
      const loggedIn = token !== undefined && (await jwt.verify(token));

      return loggedIn
        ? `
          <div class="nav-right">
            <a class="loginLink" onclick="logout()">Uitloggen</a>
          </div>
        `
        : `
          <div class="nav-right">
            <a class="loginLink" href="/login">Inloggen</a>
            <a class="loginLink btn-register" href="/register">Registreren</a>
          </div>
        `;
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  )
  .get(
    "/comp/account",
    async ({ cookie: { auth }, jwt }) => {
      const claims = auth?.value ? await jwt.verify(auth.value) : false;
      if (!claims || typeof claims.email !== "string") {
        return `<a href="/login">Inloggen</a>`;
      }

      const user = await prisma.user.findUnique({
        where: { email: claims.email },
        select: { name: true },
      });
      if (!user) return `<a href="/login">Inloggen</a>`;

      const name = escapeHtml(user.name);
      const initial = escapeHtml(user.name.trim().slice(0, 1).toUpperCase());
      return `
        <div class="account-profile">
          <span class="account-avatar" aria-hidden="true">${initial}</span>
          <span class="account-name" title="${name}">${name}</span>
          <details class="account-menu">
            <summary class="account-menu-trigger" aria-label="Account opties" title="Account opties">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="5" cy="12" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
              </svg>
            </summary>
            <div class="account-menu-popover">
              <button class="account-menu-item" type="button" onclick="logout()">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 17l5-5-5-5M15 12H3m9-8h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7" />
                </svg>
                <span>Uitloggen</span>
              </button>
            </div>
          </details>
        </div>
      `;
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  );
