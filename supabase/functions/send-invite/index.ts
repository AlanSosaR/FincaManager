import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, empresa_id, token, invitado_por_nombre } = await req.json();

    if (!email || !empresa_id || !token) {
      return new Response(
        JSON.stringify({ error: "Faltan campos requeridos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: empresa } = await supabase
      .from("empresas")
      .select("nombre")
      .eq("id", empresa_id)
      .single();

    const empresaNombre = empresa?.nombre || "la empresa";
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "http://localhost:5173";

    const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth-callback.html`,
      data: {
        invite_token: token,
        empresa_id,
        empresa_nombre: empresaNombre,
        invitado_por_nombre: invitado_por_nombre || 'Alguien',
      },
    });

    if (error) {
      // Si el usuario ya está registrado, la invitación en BD ya existe — no es error
      if (error.message?.includes('already been registered') || error.message?.includes('already registered')) {
        console.log("User already registered, invitation stored in DB:", email);
      } else {
        console.error("inviteUserByEmail error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});