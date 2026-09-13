export type AdminSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
};

const STORAGE_KEY = "medutura-admin-session";

function browserConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Falta configurar Supabase en esta página.");
  return { url, anonKey };
}

function saveSession(data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: { email?: string };
}): AdminSession {
  const session = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    email: data.user?.email || "",
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

async function authRequest(path: string, body: Record<string, unknown>) {
  const { url, anonKey } = browserConfig();
  const response = await fetch(`${url}${path}`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.msg || data?.error_description || data?.message || "No pudimos iniciar la sesión.");
  }
  return data;
}

export async function signInWithPassword(email: string, password: string): Promise<AdminSession> {
  const data = await authRequest("/auth/v1/token?grant_type=password", { email, password });
  return saveSession(data);
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AdminSession;
    if (!session.refreshToken || !session.accessToken) throw new Error("Invalid session");
    if (session.expiresAt > Date.now() + 60_000) return session;
    const data = await authRequest("/auth/v1/token?grant_type=refresh_token", {
      refresh_token: session.refreshToken,
    });
    const refreshed = saveSession(data);
    if (!refreshed.email) {
      refreshed.email = session.email;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(refreshed));
    }
    return refreshed;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export async function signOutAdmin() {
  const raw = localStorage.getItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const session = JSON.parse(raw) as AdminSession;
    const { url, anonKey } = browserConfig();
    await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: anonKey, Authorization: `Bearer ${session.accessToken}` },
    });
  } catch {
    // Local state is already cleared.
  }
}
