import { requireStoreAdmin, supabaseRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type ProductRow = {
  id: number;
  name: string;
  slug: string;
  description: string;
  category: string;
  price_cents: number;
  inventory: number;
  active: boolean;
  featured: boolean;
  image_key: string | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  delivery_method: string;
  payment_method: string;
  payment_status: string;
  fulfillment_status: string;
  total_cents: number;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const user = await requireStoreAdmin(request);
    const [products, orders, admins] = await Promise.all([
      supabaseRequest<ProductRow[]>("/rest/v1/products?select=id,name,slug,description,category,price_cents,inventory,active,featured,image_key&order=created_at.desc"),
      supabaseRequest<OrderRow[]>("/rest/v1/orders?select=id,order_number,customer_name,customer_email,customer_phone,delivery_method,payment_method,payment_status,fulfillment_status,total_cents,created_at&order=created_at.desc&limit=100"),
      supabaseRequest<Array<{ id: number; email: string; user_id: string | null }>>("/rest/v1/admins?select=id,email,user_id&order=created_at.asc"),
    ]);

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
      },
      products: products.map((item) => ({
        id: item.id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        category: item.category,
        priceCents: item.price_cents,
        inventory: item.inventory,
        active: item.active,
        featured: item.featured,
        imageKey: item.image_key,
        imageUrl: item.image_key ? `/api/images/${item.image_key.split("/").map(encodeURIComponent).join("/")}` : null,
      })),
      orders: orders.map((item) => ({
        id: item.id,
        orderNumber: item.order_number,
        customerName: item.customer_name,
        customerEmail: item.customer_email,
        customerPhone: item.customer_phone,
        deliveryMethod: item.delivery_method,
        paymentMethod: item.payment_method,
        paymentStatus: item.payment_status,
        fulfillmentStatus: item.fulfillment_status,
        totalCents: item.total_cents,
        createdAt: item.created_at,
      })),
      admins: admins.map((item) => ({ id: item.id, email: item.email, userId: item.user_id })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Acceso no disponible.";
    const status = /sesión|inicia sesión/i.test(message) ? 401 : 403;
    return Response.json({ error: message }, { status });
  }
}
