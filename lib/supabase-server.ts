type JsonBody = Record<string, unknown> | Array<unknown>;

export type SupabaseUser = {
  id: string;
  email: string;
  user_metadata?: { full_name?: string; name?: string };
};

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | JsonBody;
  useAnonKey?: boolean;
};

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    throw new Error("Falta completar la configuración de Supabase.");
  }

  return { url, anonKey, serviceKey };
}

function isJsonBody(value: RequestOptions["body"]): value is JsonBody {
  return Boolean(value) &&
    typeof value === "object" &&
    !(value instanceof FormData) &&
    !(value instanceof Blob) &&
    !(value instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(value);
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return null as T;
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const detail = data && typeof data === "object"
      ? String((data as { message?: string; error_description?: string; error?: string }).message ||
          (data as { error_description?: string }).error_description ||
          (data as { error?: string }).error || "")
      : String(data || "");
    throw new Error(detail || `Supabase respondió con código ${response.status}.`);
  }

  return data as T;
}

export async function supabaseRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { url, anonKey, serviceKey } = config();
  const key = options.useAnonKey ? anonKey : serviceKey;
  const headers = new Headers(options.headers);
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  headers.set("Accept", "application/json");

  let body = options.body;
  if (isJsonBody(body)) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(body);
  }

  const response = await fetch(`${url}${path}`, {
    ...options,
    headers,
    body: body as BodyInit | undefined,
    cache: "no-store",
  });
  return parseResponse<T>(response);
}

export async function supabaseRpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
  return supabaseRequest<T>(`/rest/v1/rpc/${name}`, { method: "POST", body });
}

export async function getAuthenticatedUser(request: Request): Promise<SupabaseUser> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Inicia sesión para continuar.");

  const { url, anonKey } = config();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const user = await parseResponse<SupabaseUser>(response);
  if (!user?.id || !user.email) throw new Error("La sesión administrativa no es válida.");
  return user;
}

export async function requireStoreAdmin(request: Request): Promise<SupabaseUser> {
  const user = await getAuthenticatedUser(request);
  const email = user.email.toLowerCase();
  const allowedEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const byUser = await supabaseRequest<Array<{ id: number; user_id: string | null; email: string }>>(
    `/rest/v1/admins?select=id,user_id,email&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
  );
  if (byUser.length) return user;

  const byEmail = await supabaseRequest<Array<{ id: number; user_id: string | null; email: string }>>(
    `/rest/v1/admins?select=id,user_id,email&email=ilike.${encodeURIComponent(email)}&limit=1`,
  );
  if (byEmail.length) {
    if (!byEmail[0].user_id) {
      await supabaseRequest(`/rest/v1/admins?id=eq.${byEmail[0].id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { user_id: user.id },
      });
    }
    return user;
  }

  if (!allowedEmails.includes(email)) throw new Error("No tienes acceso al panel de Medutura.");

  await supabaseRequest("/rest/v1/admins", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: { user_id: user.id, email },
  });
  return user;
}

export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function storagePath(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export async function uploadProductImage(key: string, file: File) {
  return supabaseRequest(`/storage/v1/object/product-images/${storagePath(key)}`, {
    method: "POST",
    headers: { "Content-Type": file.type, "x-upsert": "false" },
    body: file,
  });
}

export async function replaceProductImage(key: string, file: File) {
  return supabaseRequest(`/storage/v1/object/product-images/${storagePath(key)}`, {
    method: "POST",
    headers: { "Content-Type": file.type, "x-upsert": "true" },
    body: file,
  });
}

export async function deleteProductImage(key: string) {
  return supabaseRequest(`/storage/v1/object/product-images/${storagePath(key)}`, {
    method: "DELETE",
  });
}

export async function downloadProductImage(key: string) {
  const { url, serviceKey } = config();
  return fetch(`${url}/storage/v1/object/authenticated/product-images/${storagePath(key)}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    cache: "force-cache",
  });
}
