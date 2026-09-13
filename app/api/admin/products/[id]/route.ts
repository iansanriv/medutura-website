import { deleteProductImage, requireStoreAdmin, slugify, supabaseRequest, uploadProductImage } from "@/lib/supabase-server";

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let nextImageKey: string | null = null;
  try {
    await requireStoreAdmin(request);
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Producto inválido." }, { status: 400 });

    const currentRows = await supabaseRequest<Array<{ image_key: string | null }>>(
      `/rest/v1/products?select=image_key&id=eq.${productId}&limit=1`,
    );
    const current = currentRows[0];
    if (!current) return Response.json({ error: "Producto no encontrado." }, { status: 404 });

    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    const priceCents = Math.round(Number(form.get("price")) * 100);
    const inventory = Math.max(0, Math.floor(Number(form.get("inventory"))));
    if (!name || !Number.isFinite(priceCents) || priceCents < 1 || !Number.isFinite(inventory)) {
      return Response.json({ error: "Revisa los campos requeridos." }, { status: 400 });
    }

    const image = form.get("image");
    if (image instanceof File && image.size > 0) {
      const extension = imageExtensions[image.type];
      if (!extension || image.size > 8_000_000) {
        return Response.json({ error: "La imagen debe ser JPG, PNG o WebP y pesar menos de 8 MB." }, { status: 400 });
      }
      nextImageKey = `products/${crypto.randomUUID()}.${extension}`;
      await uploadProductImage(nextImageKey, image);
    }

    await supabaseRequest(`/rest/v1/products?id=eq.${productId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: {
        name,
        slug: `${slugify(name)}-${productId}`,
        description: String(form.get("description") || "").trim(),
        category: String(form.get("category") || "Accesorios").trim(),
        price_cents: priceCents,
        inventory,
        active: form.get("active") === "on",
        featured: form.get("featured") === "on",
        image_key: nextImageKey || current.image_key,
        updated_at: new Date().toISOString(),
      },
    });

    if (nextImageKey && current.image_key) await deleteProductImage(current.image_key).catch(() => undefined);
    return Response.json({ ok: true });
  } catch (error) {
    if (nextImageKey) await deleteProductImage(nextImageKey).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStoreAdmin(request);
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isInteger(productId) || productId < 1) return Response.json({ error: "Producto inválido." }, { status: 400 });

    const products = await supabaseRequest<Array<{ image_key: string | null }>>(
      `/rest/v1/products?select=image_key&id=eq.${productId}&limit=1`,
    );
    if (!products.length) return Response.json({ error: "Producto no encontrado." }, { status: 404 });

    const referenced = await supabaseRequest<Array<{ id: number }>>(
      `/rest/v1/order_items?select=id&product_id=eq.${productId}&limit=1`,
    );

    if (referenced.length) {
      await supabaseRequest(`/rest/v1/products?id=eq.${productId}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: { active: false, inventory: 0, updated_at: new Date().toISOString() },
      });
      return Response.json({ ok: true, archived: true });
    }

    await supabaseRequest(`/rest/v1/products?id=eq.${productId}`, { method: "DELETE" });
    if (products[0].image_key) await deleteProductImage(products[0].image_key).catch(() => undefined);
    return Response.json({ ok: true, archived: false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo borrar." }, { status: 500 });
  }
}
