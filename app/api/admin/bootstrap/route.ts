import { getChatGPTUser } from "@/app/chatgpt-auth";
import { dbBinding, requireStoreAdmin } from "@/components/lib/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "Inicia sesión para continuar." }, { status: 401 });
  try {
    await requireStoreAdmin(user);
    const db = dbBinding();
    const [products, orders, admins] = await Promise.all([
      db.prepare(`SELECT id, name, slug, description, category, price_cents AS priceCents, inventory, active, featured, image_key AS imageKey FROM products ORDER BY created_at DESC`).all(),
      db.prepare(`SELECT id, order_number AS orderNumber, customer_name AS customerName, customer_email AS customerEmail, customer_phone AS customerPhone, delivery_method AS deliveryMethod, payment_method AS paymentMethod, payment_status AS paymentStatus, fulfillment_status AS fulfillmentStatus, total_cents AS totalCents, created_at AS createdAt FROM orders ORDER BY created_at DESC LIMIT 100`).all(),
      db.prepare(`SELECT id, email, user_id AS userId FROM admins ORDER BY created_at ASC`).all(),
    ]);
    return Response.json({
      user,
      products: (products.results || []).map((item) => ({ ...item, active: Boolean(item.active), featured: Boolean(item.featured), imageUrl: item.imageKey ? `/api/images/${encodeURIComponent(String(item.imageKey))}` : null })),
      orders: orders.results || [],
      admins: admins.results || [],
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Acceso no disponible." }, { status: 403 });
  }
}

