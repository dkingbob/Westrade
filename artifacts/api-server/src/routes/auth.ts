import { Router, type Request, type Response } from "express";
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
  SESSION_REMEMBER_TTL,
  type SessionData,
} from "../lib/auth";
import { sendEmailTo } from "./notifications";

const router: Router = Router();

// In-memory store for password reset codes: email -> { code, expiresAt }
const resetCodes = new Map<string, { code: string; expiresAt: number }>();

const RegisterBody = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email().optional(),
  password: z.string().min(8),
});

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

const SendCodeBody = z.object({
  email: z.string().email(),
});

const ResetPasswordBody = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(8),
});

function setSessionCookie(res: Response, sid: string, rememberMe = false) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: rememberMe ? SESSION_REMEMBER_TTL : SESSION_TTL,
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

  const { username, password, rememberMe } = parsed.data;
  const [user] = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.username, username), eq(usersTable.email, username)));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const sessionData: SessionData = {
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profileImageUrl: user.profileImageUrl },
    access_token: "",
  };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid, rememberMe ?? false);
  res.json({ user: sessionData.user });
});

router.post("/auth/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const parsed = SendCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  const { email } = parsed.data;

  // Always respond success to avoid leaking account existence
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (user) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    resetCodes.set(email, { code, expiresAt: Date.now() + 15 * 60 * 1000 });

    try {
      await sendEmailTo(email, "Westrade — Password Reset Code", [
        `Your password reset code is: <strong>${code}</strong>`,
        "This code expires in 15 minutes.",
        "If you did not request a password reset, ignore this email.",
      ].join("<br><br>"));
    } catch {
      // log silently — don't expose SMTP errors to client
    }
  }

  res.json({ success: true });
});

router.post("/auth/reset-password", async (req: Request, res: Response): Promise<void> => {
  const parsed = ResetPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { email, code, newPassword } = parsed.data;
  const entry = resetCodes.get(email);

  if (!entry || entry.code !== code || Date.now() > entry.expiresAt) {
    res.status(400).json({ error: "Invalid or expired reset code" });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.email, email));
  resetCodes.delete(email);

  res.json({ success: true });
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

export default router;
