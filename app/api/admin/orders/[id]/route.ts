import { requireStoreAdmin, supabaseRequest, supabaseRpc } from "@/lib/supabase-server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireStoreAdmin(request);
    const { id } = await params;
    const body = await request.json() as { fulfillmentStatus?: string; paymentStatus?: string };
    const allowedFulfillment = ["new", "making", "ready", "shipped", "complete", "cancelled"];
    const allowedPayment = ["pending", "paid", "refunded", "cancelled"];
    if (!allowedFulfillment.includes(body.fulfillmentStatus || "") || !allowedPayment.includes(body.paymentStatus || "")) {
      return Response.json({ error: "Estado inválido." }, { status: 400 });
    }

    const rows = await supabaseRequest<Array<{ payment_status: string; fulfillment_status: string }>>(
      `/rest/v1/orders?select=payment_status,fulfillment_status&id=eq.${encodeURIComponent(id)}&limit=1`,
    );
    const current = rows[0];
    if (!current) return Response.json({ error: "Orden no encontrada." }, { status: 404 });

    let paymentStatus = body.paymentStatus!;
    let fulfillmentStatus = body.fulfillmentStatus!;
    if (current.payment_status === "pending" && (paymentStatus === "cancelled" || fulfillmentStatus === "cancelled")) {
      await supabaseRpc("cancel_store_order", { p_order_id: id });
      paymentStatus = "cancelled";
      fulfillmentStatus = "cancelled";
    } else if (paymentStatus === "paid" && current.payment_status !== "paid") {
      await supabaseRpc("mark_store_order_paid", { p_order_id: id, p_processor_reference: null });
    }

    await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: {
        fulfillment_status: fulfillmentStatus,
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo actualizar." }, { status: 500 });
  }
}
