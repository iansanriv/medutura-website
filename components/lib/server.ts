import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "@/app/chatgpt-auth";

export function dbBinding(): D1Database {
  if (!env.DB) throw new Error("La base de datos no está disponible.");
  return env.DB;
}

export async function requireStoreAdmin(user: ChatGPTUser) {
  const db = dbBinding();
  const count = await db.prepare("SELECT COUNT(*) AS total FROM admins").first<{ total: number }>();

  if (!count?.total) {
    await db
      .prepare("INSERT INTO admins (user_id, email, created_at) VALUES (?, ?, ?)")
      .bind(user.userId, user.email.toLowerCase(), new Date().toISOString())
      .run();
    return user;
  }

  const admin = await db
    .prepare("SELECT id, user_id AS userId FROM admins WHERE user_id = ? OR lower(email) = lower(?) LIMIT 1")
    .bind(user.userId, user.email)
    .first<{ id: number; userId: string | null }>();

  if (!admin) throw new Error("No tienes acceso al panel de Medutura.");
  if (!admin.userId) {
    await db.prepare("UPDATE admins SET user_id = ? WHERE id = ?").bind(user.userId, admin.id).run();
  }
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

