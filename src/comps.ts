import jwt from "@elysiajs/jwt";
import Elysia, { t } from "elysia";

export const compRoutes = new Elysia()
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .get(
    "/comp/header",
    async ({ cookie: { auth }, jwt }) => {
      const token = auth?.value;
      const loggedIn = token !== undefined && (await jwt.verify(token));

      return `
        <div class="header">
          ${
            loggedIn
              ? `<button
              hx-post="/api/logout"
              hx-redirect="/login"
              class="nav-button"
              hx-swap="none"
            >
              logout
            </button>
`
              : `
                      <a href="/login" class="nav-button" hx-boost="true">login</a>
                      <a href="/register" class="nav-button" hx-boost="true">register</a>
                      `
          }
        </div>
      `;
    },
    {
      cookie: t.Cookie({
        auth: t.Optional(t.String()),
      }),
    },
  );
