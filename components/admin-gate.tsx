"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import AdminDashboard from "@/components/admin-dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAdminSession, signInWithPassword, signOutAdmin, type AdminSession } from "@/lib/supabase-browser";

export default function AdminGate() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const current = await getAdminSession();
      if (active) {
        setSession(current);
        setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const next = await signInWithPassword(String(form.get("email") || ""), String(form.get("password") || ""));
      setSession(next);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "No pudimos iniciar la sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#eafbfb] text-slate-600">Abriendo tu taller…</main>;
  }

  if (session) {
    return <AdminDashboard
      displayName={session.email}
      accessToken={session.accessToken}
      onSignOut={async () => {
        await signOutAdmin();
        setSession(null);
      }}
    />;
  }

  return <main className="grid min-h-screen place-items-center bg-[#eafbfb] px-4 py-10 text-[#111827]">
    <section className="w-full max-w-md rounded-[2rem] bg-white p-7 shadow-[0_30px_90px_rgba(17,24,39,.12)] sm:p-10">
      <Link href="/" className="mx-auto flex w-fit items-center gap-3" aria-label="Medutura, inicio">
        <img src="/medutura-symbol-v3.png" alt="" className="h-20 w-20 object-contain" />
        <span className="brand-word text-2xl font-black">MEDUTURA</span>
      </Link>
      <div className="mx-auto mt-7 grid h-12 w-12 place-items-center rounded-full bg-[#111827] text-[#80e3e0]"><LockKeyhole /></div>
      <h1 className="brand-word mt-5 text-center text-3xl font-black">Entra a tu taller</h1>
      <p className="mt-2 text-center text-sm text-slate-500">Usa el correo administrativo registrado para Medutura.</p>
      <form onSubmit={login} className="mt-8 space-y-5">
        <div><Label htmlFor="admin-email">Correo electrónico</Label><Input id="admin-email" name="email" type="email" autoComplete="email" required className="mt-2 h-12" /></div>
        <div><Label htmlFor="admin-password">Contraseña</Label><Input id="admin-password" name="password" type="password" autoComplete="current-password" required className="mt-2 h-12" /></div>
        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}
        <Button disabled={submitting} className="h-12 w-full rounded-full bg-[#111827] text-base hover:bg-[#25aeb5]">{submitting ? "Entrando…" : "Entrar"}</Button>
      </form>
      <Link href="/" className="mt-6 block text-center text-sm font-bold text-[#168a91]">Volver a la tienda</Link>
    </section>
  </main>;
}
