import jwt from "@elysiajs/jwt";
import Elysia, { t } from "elysia";

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
            <button
              hx-post="/api/logout"
              hx-redirect="/login"
              class="btn-register"
              hx-swap="none"
            >
              Logout
            </button>
          </div>
        `
        : `
          <div class="nav-right">
            <a href="/login">Inloggen</a>
            <a href="/register" class="btn-register">Registreren</a>
          </div>
        `;
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  );
