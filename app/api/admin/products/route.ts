import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { dbBinding, requireStoreAdmin, slugify } from "@/components/lib/server";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  try {
    await requireStoreAdmin(user);
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const category = String(form.get("category") || "Accesorios").trim();
    const priceCents = Math.round(Number(form.get("price")) * 100);
    const inventory = Math.max(0, Math.floor(Number(form.get("inventory"))));
    const featured = form.get("featured") === "on" ? 1 : 0;
    const active = form.get("active") === "off" ? 0 : 1;
    if (!name || !Number.isFinite(priceCents) || priceCents < 1 || !Number.isFinite(inventory)) return Response.json({ error: "Revisa el nombre, precio e inventario." }, { status: 400 });

    let imageKey: string | null = null;
    const image = form.get("image");
    if (image instanceof File && image.size > 0) {
      if (!env.BUCKET) return Response.json({ error: "El almacenamiento de imágenes no está disponible." }, { status: 503 });
      if (!image.type.startsWith("image/") || image.size > 8_000_000) return Response.json({ error: "Usa una imagen JPG, PNG o WebP de menos de 8 MB." }, { status: 400 });
      const extension = image.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      imageKey = `products/${crypto.randomUUID()}.${extension}`;
      await env.BUCKET.put(imageKey, image.stream(), { httpMetadata: { contentType: image.type } });
    }

    const now = new Date().toISOString();
    const slug = `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`;
    const result = await dbBinding().prepare(`INSERT INTO products (name, slug, description, category, price_cents, inventory, active, featured, image_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(name, slug, description, category, priceCents, inventory, active, featured, imageKey, now, now).run();
    return Response.json({ ok: true, id: result.meta.last_row_id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar el producto." }, { status: 500 });
  }
}

