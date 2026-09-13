import { deleteProductImage, requireStoreAdmin, slugify, supabaseRequest, uploadProductImage } from "@/lib/supabase-server";

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  let imageKey: string | null = null;
  try {
    await requireStoreAdmin(request);
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const description = String(form.get("description") || "").trim();
    const category = String(form.get("category") || "Accesorios").trim();
    const priceCents = Math.round(Number(form.get("price")) * 100);
    const inventory = Math.max(0, Math.floor(Number(form.get("inventory"))));
    const featured = form.get("featured") === "on";
    const active = form.get("active") === "on";

    if (!name || !Number.isFinite(priceCents) || priceCents < 1 || !Number.isFinite(inventory)) {
      return Response.json({ error: "Revisa el nombre, precio e inventario." }, { status: 400 });
    }

    const image = form.get("image");
    if (!(image instanceof File) || image.size < 1) {
      return Response.json({ error: "Añade una foto para este producto." }, { status: 400 });
    }
    const extension = imageExtensions[image.type];
    if (!extension || image.size > 8_000_000) {
      return Response.json({ error: "Usa una imagen JPG, PNG o WebP de menos de 8 MB." }, { status: 400 });
    }

    imageKey = `products/${crypto.randomUUID()}.${extension}`;
    await uploadProductImage(imageKey, image);
    const now = new Date().toISOString();
    const rows = await supabaseRequest<Array<{ id: number }>>("/rest/v1/products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        name,
        slug: `${slugify(name)}-${crypto.randomUUID().slice(0, 6)}`,
        description,
        category,
        price_cents: priceCents,
        inventory,
        active,
        featured,
        image_key: imageKey,
        created_at: now,
        updated_at: now,
      },
    });
    return Response.json({ ok: true, id: rows[0]?.id });
  } catch (error) {
    if (imageKey) await deleteProductImage(imageKey).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo guardar el producto." }, { status: 500 });
  }
}
