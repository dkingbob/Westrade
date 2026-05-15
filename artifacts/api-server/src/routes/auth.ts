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

const pendingCodes = new Map<string, { code: string; expires: number }>();

const RegisterBody = z.object({
  username: z.string().min(3).max(30),
  email: z.string().email(),
  password: z.string().min(8),
});

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const SendCodeBody = z.object({
  email: z.string().email(),
});

const VerifyCodeBody = z.object({
  email: z.string().email(),
  code: z.string(),
});

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function generateCode(): string {
  return String(Math.floor(10000 + Math.random() * 90000));
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

  const existing = await db
    .select()
    .from(usersTable)
    .where(or(eq(usersTable.username, username), eq(usersTable.email, email)));

  if (existing.length > 0) {
    res.status(409).json({ error: "Username or email already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .insert(usersTable)
    .values({ username, email, passwordHash });

  res.status(201).json({ success: true, message: "Account created. Please sign in." });
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

router.post("/auth/send-code", async (req: Request, res: Response): Promise<void> => {
  const parsed = SendCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { email } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user) {
    res.status(404).json({ error: "No account found with that email" });
    return;
  }

  const code = generateCode();
  const expires = Date.now() + 10 * 60 * 1000;
  pendingCodes.set(email, { code, expires });

  await sendEmailTo(email, "Your Westrade login code", `Your Westrade login code is: ${code}\n\nThis code expires in 10 minutes.`);

  res.json({ success: true });
});

router.post("/auth/verify-code", async (req: Request, res: Response): Promise<void> => {
  const parsed = VerifyCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { email, code } = parsed.data;

  const entry = pendingCodes.get(email);
  if (!entry || entry.code !== String(code) || Date.now() > entry.expires) {
    res.status(401).json({ error: "Invalid or expired code" });
    return;
  }

  pendingCodes.delete(email);

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user) {
    res.status(404).json({ error: "No account found with that email" });
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

router.post("/auth/forgot-password", async (req: Request, res: Response): Promise<void> => {
  const parsed = SendCodeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { email } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email));

  if (!user) {
    res.status(404).json({ error: "No account found with that email" });
    return;
  }

  const code = generateCode();
  const expires = Date.now() + 10 * 60 * 1000;
  pendingCodes.set(email, { code, expires });

  await sendEmailTo(email, "Reset your Westrade password", `You requested a password reset.\n\nYour reset code is: ${code}\n\nEnter this code on the login page to continue. Expires in 10 minutes.\n\nIf you did not request this, ignore this email.`);

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
