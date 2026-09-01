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
  );
