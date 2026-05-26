import { Elysia, t, ElysiaCustomStatusResponse } from "elysia";
import { hash, verify } from "argon2";
import jwt from "@elysiajs/jwt";
import { prisma } from "./db";

export const authRoutes = new Elysia()
  .use(jwt({ name: "jwt", secret: "SuperSecretKey" }))
  .post(
    "/register",
    async ({ body, redirect, jwt, cookie }) => {
      const hashedPassword = await hash(body.password);
      const user = await prisma.user.create({
        data: {
          name: body.username,
          email: body.email,
          password: hashedPassword,
        },
      });

      const token = await jwt.sign({
        email: body.email,
        sub: user.id.toString(),
      });
      cookie.auth.set({
        value: token,
        httpOnly: true,
        maxAge: 7 * 86400,
      });

      return redirect("/");
    },
    {
      body: t.Object({
        username: t.String(),
        email: t.String({ format: "email" }),
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
    async ({ body, jwt, cookie, redirect }) => {
      const user = await prisma.user.findUnique({
        where: { email: body.email },
      });
      if (!user || !(await verify(user.password, body.password))) {
        return new ElysiaCustomStatusResponse("Unauthorized", {
          summary: "Password incorrect",
        });
      }

      const token = await jwt.sign({
        email: body.email,
        sub: user.id.toString(),
      });
      cookie.auth.set({
        value: token,
        httpOnly: true,
        maxAge: 7 * 86400,
      });

      return redirect("/");
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String(),
      }),
    },
  );
