import { getChatGPTUser } from "@/app/chatgpt-auth";
import { dbBinding, requireStoreAdmin } from "@/components/lib/server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "No autorizado." }, { status: 401 });
  try {
    await requireStoreAdmin(user);
    const { id } = await params;
    const body = await request.json() as { fulfillmentStatus?: string; paymentStatus?: string };
    const allowedFulfillment = ["new", "making", "ready", "shipped", "complete", "cancelled"];
    const allowedPayment = ["pending", "paid", "refunded", "cancelled"];
    if (!allowedFulfillment.includes(body.fulfillmentStatus || "") || !allowedPayment.includes(body.paymentStatus || "")) return Response.json({ error: "Estado inválido." }, { status: 400 });
    await dbBinding().prepare("UPDATE orders SET fulfillment_status = ?, payment_status = ?, updated_at = ? WHERE id = ?").bind(body.fulfillmentStatus, body.paymentStatus, new Date().toISOString(), Number(id)).run();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar." }, { status: 500 });
  }
}

