import { supabaseRequest } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await supabaseRequest<Array<{
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
    }>>("/rest/v1/products?select=id,name,slug,description,category,price_cents,inventory,active,featured,image_key&active=eq.true&order=featured.desc,created_at.desc");
    const products = rows.map((item) => ({
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
    }));
    return Response.json(products);
  } catch {
    return Response.json([], { status: 200 });
  }
}
