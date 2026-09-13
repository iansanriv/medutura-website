import { dbBinding } from "@/components/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = dbBinding();
    const result = await db.prepare(`
      SELECT id, name, slug, description, category,
        price_cents AS priceCents, inventory, active, featured,
        image_key AS imageKey
      FROM products
      WHERE active = 1
      ORDER BY featured DESC, created_at DESC
    `).all();
    const products = (result.results || []).map((item) => ({
      ...item,
      active: Boolean(item.active),
      featured: Boolean(item.featured),
      imageUrl: item.imageKey ? `/api/images/${encodeURIComponent(String(item.imageKey))}` : null,
    }));
    return Response.json(products);
  } catch {
    return Response.json([], { status: 200 });
  }
}

