import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import {
  clearSession,
  getSessionId,
  createSession,
  SESSION_COOKIE,
  SESSION_TTL,
  type SessionData,
} from "../lib/auth";
import { sendEmailTo } from "./notifications";

const RegisterBody = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email().optional(),
  password: z.string().min(8),
});

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const SendCodeBody = z.object({
  email: z.string().email(),
});

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(rememberMe ? { maxAge: SESSION_REMEMBER_TTL } : { maxAge: SESSION_TTL }),
  });
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json({ user: req.isAuthenticated() ? req.user : null });
});

router.post("/auth/register", async (req: Request, res: Response): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { username, email, password } = parsed.data;

  const conditions = [eq(usersTable.username, username)];
  if (email) conditions.push(eq(usersTable.email, email));
  const existing = await db.select().from(usersTable).where(or(...conditions));

  if (existing.length > 0) {
    res.status(409).json({ error: "Username or email already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db
    .insert(usersTable)
    .values({ username, email: email ?? null, passwordHash })
    .returning();

  const sessionData: SessionData = {
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profileImageUrl: user.profileImageUrl },
    access_token: "",
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ user: sessionData.user });
});

router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { username, password } = parsed.data;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.username, username), eq(usersTable.email, username)));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const sessionData: SessionData = {
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profileImageUrl: user.profileImageUrl },
    access_token: "",
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({ user: sessionData.user });
});

router.post("/auth/logout", async (req: Request, res: Response): Promise<void> => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

router.get("/logout", async (req: Request, res: Response): Promise<void> => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect("/login");
});

router.get("/logout", async (req: Request, res: Response): Promise<void> => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.redirect("/login");
});

export default router;
