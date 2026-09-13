import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { dbBinding, requireStoreAdmin, slugify } from "@/components/lib/server";

async function authorize() {
  const user = await getChatGPTUser();
  if (!user) throw new Error("No autorizado.");
  await requireStoreAdmin(user);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorize();
    const { id } = await params;
    const productId = Number(id);
    const form = await request.formData();
    const db = dbBinding();
    const current = await db.prepare("SELECT image_key AS imageKey FROM products WHERE id = ?").bind(productId).first<{ imageKey: string | null }>();
    if (!current) return Response.json({ error: "Producto no encontrado." }, { status: 404 });
    const name = String(form.get("name") || "").trim();
    const priceCents = Math.round(Number(form.get("price")) * 100);
    const inventory = Math.max(0, Math.floor(Number(form.get("inventory"))));
    if (!name || !Number.isFinite(priceCents) || priceCents < 1 || !Number.isFinite(inventory)) return Response.json({ error: "Revisa los campos requeridos." }, { status: 400 });
    let imageKey = current.imageKey;
    const image = form.get("image");
    if (image instanceof File && image.size > 0) {
      if (!env.BUCKET || !image.type.startsWith("image/") || image.size > 8_000_000) return Response.json({ error: "La imagen debe pesar menos de 8 MB." }, { status: 400 });
      const extension = image.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const nextKey = `products/${crypto.randomUUID()}.${extension}`;
      await env.BUCKET.put(nextKey, image.stream(), { httpMetadata: { contentType: image.type } });
      if (imageKey) await env.BUCKET.delete(imageKey);
      imageKey = nextKey;
    }
    await db.prepare(`UPDATE products SET name = ?, slug = ?, description = ?, category = ?, price_cents = ?, inventory = ?, active = ?, featured = ?, image_key = ?, updated_at = ? WHERE id = ?`).bind(name, `${slugify(name)}-${productId}`, String(form.get("description") || "").trim(), String(form.get("category") || "Accesorios").trim(), priceCents, inventory, form.get("active") === "on" ? 1 : 0, form.get("featured") === "on" ? 1 : 0, imageKey, new Date().toISOString(), productId).run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorize();
    const { id } = await params;
    const db = dbBinding();
    const product = await db.prepare("SELECT image_key AS imageKey FROM products WHERE id = ?").bind(Number(id)).first<{ imageKey: string | null }>();
    await db.prepare("DELETE FROM products WHERE id = ?").bind(Number(id)).run();
    if (product?.imageKey && env.BUCKET) await env.BUCKET.delete(product.imageKey);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo borrar." }, { status: 500 });
  }
}

