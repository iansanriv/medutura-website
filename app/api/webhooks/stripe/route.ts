import { createHmac, timingSafeEqual } from "node:crypto";
import { sendOrderConfirmation } from "@/lib/order-email";
import { supabaseRpc } from "@/lib/supabase-server";

export const runtime = "nodejs";

type StripeEvent = {
  type?: string;
  data?: {
    object?: {
      id?: string;
      payment_status?: string;
      metadata?: { order_id?: string };
    };
  };
};

function verifyStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return signatures.some((signature) => {
    try {
      const actual = Buffer.from(signature, "hex");
      return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
    } catch {
      return false;
    }
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  if (!secret || !signature || !verifyStripeSignature(payload, signature, secret)) {
    return Response.json({ error: "Firma inválida." }, { status: 400 });
  }

  const event = JSON.parse(payload) as StripeEvent;
  const session = event.data?.object;
  const orderId = session?.metadata?.order_id;
  if (!orderId) return Response.json({ received: true });

  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type || "") && session?.payment_status === "paid") {
    const marked = await supabaseRpc<boolean>("mark_store_order_paid", {
      p_order_id: orderId,
      p_processor_reference: session.id || null,
    });
    if (marked) await sendOrderConfirmation(orderId).catch(() => undefined);
  }

  if (["checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type || "")) {
    await supabaseRpc("cancel_store_order", { p_order_id: orderId });
  }

  return Response.json({ received: true });
}
