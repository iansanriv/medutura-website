"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Box, ExternalLink, ImagePlus, LogOut, PackageCheck, Pencil, Plus, RefreshCw, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import type { Product, StoreOrder } from "@/components/lib/types";

const money = (cents: number) => new Intl.NumberFormat("es-PR", { style: "currency", currency: "USD" }).format(cents / 100);
const fulfillment: Record<string, string> = { new: "Nueva", making: "En preparación", ready: "Lista", shipped: "Enviada", complete: "Completada", cancelled: "Cancelada" };
const payments: Record<string, string> = { pending: "Pendiente", paid: "Pagada", refunded: "Reembolsada", cancelled: "Cancelada" };

export default function AdminDashboard({ displayName, accessToken, onSignOut }: { displayName: string; accessToken: string; onSignOut: () => void | Promise<void> }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  const authorizedFetch = useCallback((input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(input, { ...init, headers });
  }, [accessToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authorizedFetch("/api/admin/bootstrap");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pudimos abrir el panel.");
      setProducts(data.products);
      setOrders(data.orders);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos abrir el panel.");
    } finally { setLoading(false); }
  }, [authorizedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const url = editing ? `/api/admin/products/${editing.id}` : "/api/admin/products";
      const response = await authorizedFetch(url, { method: editing ? "PUT" : "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      toast.success(editing ? "Producto actualizado." : "Producto añadido a la tienda.");
      setEditing(undefined);
      await load();
    } catch (err) { toast.error(err instanceof Error ? err.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  }

  async function deleteProduct() {
    if (!deleting) return;
    const response = await authorizedFetch(`/api/admin/products/${deleting.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return toast.error(data.error || "No se pudo borrar.");
    toast.success("Producto eliminado.");
    setDeleting(null);
    await load();
  }

  async function updateOrder(order: StoreOrder, field: "fulfillmentStatus" | "paymentStatus", value: string) {
    const next = { fulfillmentStatus: order.fulfillmentStatus, paymentStatus: order.paymentStatus, [field]: value };
    const response = await authorizedFetch(`/api/admin/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    if (!response.ok) return toast.error("No se pudo actualizar la orden.");
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, ...next } : item));
    toast.success("Orden actualizada.");
  }

  return <main className="min-h-screen bg-[#f3fbfb] text-[#111827]"><Toaster position="top-center" richColors />
    <header className="border-b border-black/8 bg-white"><div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8"><Link href="/" className="flex items-center gap-3"><img src="/medutura-symbol-v3.png" alt="" className="h-16 w-16 object-contain" /><div><div className="brand-word text-xl font-black">MEDUTURA</div><div className="text-xs font-bold uppercase tracking-widest text-[#168a91]">Panel de la tienda</div></div></Link><div className="flex items-center gap-2"><Button asChild variant="outline" className="hidden rounded-full sm:inline-flex"><Link href="/" target="_blank"><ExternalLink /> Ver tienda</Link></Button><Button variant="ghost" size="icon" title="Cerrar sesión" onClick={() => void onSignOut()}><LogOut /></Button></div></div></header>
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><Link href="/" className="mb-4 flex w-fit items-center gap-2 text-sm font-bold text-[#168a91] sm:hidden"><ArrowLeft className="h-4 w-4" /> Volver</Link><p className="text-sm text-slate-500">Hola, {displayName}</p><h1 className="brand-word mt-1 text-4xl font-black">Tu taller digital</h1><p className="mt-2 text-slate-600">Añade piezas, ajusta inventario y organiza las órdenes desde aquí.</p></div><Button onClick={() => setEditing(null)} className="h-12 rounded-full bg-[#111827] px-6 hover:bg-[#25aeb5]"><Plus /> Añadir producto</Button></div>
      {error ? <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6"><p className="font-bold text-red-800">{error}</p><Button variant="outline" onClick={() => void load()} className="mt-4"><RefreshCw /> Intentar de nuevo</Button></div> :
      <Tabs defaultValue="products" className="mt-10"><TabsList className="h-auto rounded-full bg-white p-1 shadow-sm"><TabsTrigger value="products" className="rounded-full px-5 py-2.5"><Box /> Productos <span className="rounded-full bg-[#dffafa] px-2 text-xs">{products.length}</span></TabsTrigger><TabsTrigger value="orders" className="rounded-full px-5 py-2.5"><ShoppingBag /> Órdenes <span className="rounded-full bg-[#dffafa] px-2 text-xs">{orders.length}</span></TabsTrigger></TabsList>
        <TabsContent value="products" className="mt-6"><section className="overflow-hidden rounded-3xl border border-black/7 bg-white shadow-sm">{loading ? <div className="p-12 text-center text-slate-500">Cargando tus productos…</div> : !products.length ? <div className="px-6 py-16 text-center"><ImagePlus className="mx-auto h-12 w-12 text-[#25aeb5]" /><h2 className="brand-word mt-4 text-2xl font-black">Sube tu primera pieza</h2><p className="mx-auto mt-2 max-w-md text-slate-500">Solo necesitas una foto, nombre, precio y cuántas tienes disponibles.</p><Button onClick={() => setEditing(null)} className="mt-6 rounded-full bg-[#111827]"><Plus /> Añadir producto</Button></div> : <div className="divide-y divide-black/7">{products.map((product) => <article key={product.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center"><div className="h-28 w-full overflow-hidden rounded-2xl bg-[#dffafa] sm:h-24 sm:w-24"><img src={product.imageUrl || "/catalogo-muestra.png"} alt="" className="h-full w-full object-cover" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{product.name}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${product.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{product.active ? "Publicado" : "Oculto"}</span>{product.featured && <span className="rounded-full bg-[#dffafa] px-2.5 py-1 text-xs font-bold text-[#0f6f74]">Destacado</span>}</div><p className="mt-1 text-sm text-slate-500">{product.category} · {money(product.priceCents)} · {product.inventory} disponibles</p><p className="mt-2 line-clamp-1 text-sm text-slate-600">{product.description}</p></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => setEditing(product)} aria-label={`Editar ${product.name}`}><Pencil /></Button><Button variant="outline" size="icon" onClick={() => setDeleting(product)} className="text-red-600 hover:bg-red-50 hover:text-red-700" aria-label={`Borrar ${product.name}`}><Trash2 /></Button></div></article>)}</div>}</section></TabsContent>
        <TabsContent value="orders" className="mt-6"><section className="overflow-hidden rounded-3xl border border-black/7 bg-white shadow-sm">{!orders.length ? <div className="px-6 py-16 text-center"><PackageCheck className="mx-auto h-12 w-12 text-[#25aeb5]" /><h2 className="brand-word mt-4 text-2xl font-black">Las órdenes aparecerán aquí</h2><p className="mt-2 text-slate-500">Cuando alguien compre, podrás actualizar el pago y la preparación.</p></div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Orden</TableHead><TableHead>Cliente</TableHead><TableHead>Total</TableHead><TableHead>Pago</TableHead><TableHead>Preparación</TableHead></TableRow></TableHeader><TableBody>{orders.map((order) => <TableRow key={order.id}><TableCell><strong>{order.orderNumber}</strong><small className="block text-slate-500">{new Date(order.createdAt).toLocaleDateString("es-PR")}</small></TableCell><TableCell><strong>{order.customerName}</strong><small className="block text-slate-500">{order.customerPhone}</small></TableCell><TableCell className="font-bold">{money(order.totalCents)}</TableCell><TableCell><select aria-label="Estado del pago" value={order.paymentStatus} onChange={(e) => void updateOrder(order, "paymentStatus", e.target.value)} className="h-10 rounded-xl border bg-white px-3 text-sm">{Object.entries(payments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></TableCell><TableCell><select aria-label="Estado de preparación" value={order.fulfillmentStatus} onChange={(e) => void updateOrder(order, "fulfillmentStatus", e.target.value)} className="h-10 rounded-xl border bg-white px-3 text-sm">{Object.entries(fulfillment).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></TableCell></TableRow>)}</TableBody></Table></div>}</section></TabsContent>
      </Tabs>}
    </div>

    <Dialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl sm:max-w-xl"><DialogHeader><DialogTitle className="brand-word text-2xl">{editing ? "Editar producto" : "Añadir producto"}</DialogTitle><DialogDescription>Lo que guardes aquí aparecerá en la tienda.</DialogDescription></DialogHeader><form onSubmit={saveProduct} className="space-y-5"><div><Label htmlFor="product-name">Nombre de la pieza</Label><Input id="product-name" name="name" defaultValue={editing?.name} required className="mt-2 h-11" placeholder="Ej. Tote bag floral" /></div><div><Label htmlFor="description">Descripción</Label><Textarea id="description" name="description" defaultValue={editing?.description} className="mt-2 min-h-24" placeholder="Cuenta qué la hace especial…" /></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="category">Categoría</Label><Input id="category" name="category" defaultValue={editing?.category || "Accesorios"} required className="mt-2 h-11" /></div><div><Label htmlFor="price">Precio</Label><Input id="price" name="price" type="number" min="0.01" step="0.01" defaultValue={editing ? (editing.priceCents / 100).toFixed(2) : ""} required className="mt-2 h-11" placeholder="25.00" /></div></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="inventory">Cantidad disponible</Label><Input id="inventory" name="inventory" type="number" min="0" step="1" defaultValue={editing?.inventory ?? 1} required className="mt-2 h-11" /></div><div><Label htmlFor="image">Foto del producto</Label><Input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" required={!editing?.imageUrl} className="mt-2 h-11 pt-2" /></div></div><div className="flex flex-wrap gap-6 rounded-2xl bg-[#f3fbfb] p-4"><Label className="flex items-center gap-3"><Checkbox name="active" defaultChecked={editing?.active ?? true} /> Mostrar en la tienda</Label><Label className="flex items-center gap-3"><Checkbox name="featured" defaultChecked={editing?.featured ?? false} /> Destacar producto</Label></div><Button disabled={saving} className="h-12 w-full rounded-full bg-[#111827] hover:bg-[#25aeb5]">{saving ? "Guardando…" : editing ? "Guardar cambios" : "Publicar producto"}</Button></form></DialogContent></Dialog>

    <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Borrar {deleting?.name}?</AlertDialogTitle><AlertDialogDescription>Se eliminará de la tienda junto con su foto. Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>No, déjalo</AlertDialogCancel><AlertDialogAction onClick={() => void deleteProduct()} className="bg-red-600 hover:bg-red-700">Sí, borrar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
