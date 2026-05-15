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
  SESSION_REMEMBER_TTL,
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
  rememberMe: z.boolean().optional(),
});

const SendCodeBody = z.object({
  email: z.string().email(),
});

const VerifyCodeBody = z.object({
  email: z.string().email(),
  code: z.string(),
  rememberMe: z.boolean().optional(),
});

const router: IRouter = Router();

function setSessionCookie(res: Response, sid: string, rememberMe = false) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(rememberMe ? { maxAge: SESSION_REMEMBER_TTL } : { maxAge: SESSION_TTL }),
  });
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function getGoogleCallbackUrl(req: Request): string {
  const appUrl = process.env.APP_URL;
  if (appUrl) return `${appUrl}/api/auth/google/callback`;
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
  return `${proto}://${req.get("host")}/api/auth/google/callback`;
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

  const { username, password, rememberMe } = parsed.data;
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
  const ttl = rememberMe ? SESSION_REMEMBER_TTL : SESSION_TTL;
  const sid = await createSession(sessionData, ttl);
  setSessionCookie(res, sid, rememberMe);
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

  const { email, code, rememberMe } = parsed.data;

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
  const ttl = rememberMe ? SESSION_REMEMBER_TTL : SESSION_TTL;
  const sid = await createSession(sessionData, ttl);
  setSessionCookie(res, sid, rememberMe);
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

router.get("/auth/google", (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    res.redirect("/login?error=google_not_configured");
    return;
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCallbackUrl(req),
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });
  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

router.get("/auth/google/callback", async (req: Request, res: Response): Promise<void> => {
  const { code, error } = req.query as { code?: string; error?: string };
  if (error || !code) {
    res.redirect("/login?error=google_cancelled");
    return;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.redirect("/login?error=google_not_configured");
    return;
  }

  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: getGoogleCallbackUrl(req),
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json() as any;
    if (!tokens.access_token) {
      res.redirect("/login?error=google_token_failed");
      return;
    }

    const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const gUser = await userInfoRes.json() as any;
    if (!gUser.email) {
      res.redirect("/login?error=google_no_email");
      return;
    }

    let [user] = await db.select().from(usersTable).where(eq(usersTable.email, gUser.email));
    if (!user) {
      const base = (gUser.email as string).split("@")[0].replace(/[^a-z0-9_]/gi, "_").slice(0, 26);
      const [newUser] = await db.insert(usersTable).values({
        email: gUser.email,
        username: `${base}_${Date.now().toString().slice(-4)}`,
        firstName: gUser.given_name ?? null,
        lastName: gUser.family_name ?? null,
        profileImageUrl: gUser.picture ?? null,
      }).returning();
      user = newUser;
    } else if (gUser.picture && gUser.picture !== user.profileImageUrl) {
      await db.update(usersTable).set({ profileImageUrl: gUser.picture }).where(eq(usersTable.id, user.id));
      user = { ...user, profileImageUrl: gUser.picture };
    }

    const sessionData: SessionData = {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, profileImageUrl: user.profileImageUrl },
      access_token: "",
    };
    const sid = await createSession(sessionData, SESSION_REMEMBER_TTL);
    setSessionCookie(res, sid, true);
    res.redirect("/");
  } catch (err: any) {
    console.error("Google OAuth error:", err?.message);
    res.redirect("/login?error=google_error");
  }
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
