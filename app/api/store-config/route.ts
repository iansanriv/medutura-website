export async function GET() {
  const shipping = Number(process.env.SHIPPING_FLAT_RATE_CENTS || 0);
  const taxRate = Number(process.env.SALES_TAX_RATE || 0);
  return Response.json({
    shippingFlatRateCents: Number.isFinite(shipping) ? Math.max(0, Math.floor(shipping)) : 0,
    salesTaxRate: Number.isFinite(taxRate) ? Math.max(0, Math.min(1, taxRate)) : 0,
  });
}
