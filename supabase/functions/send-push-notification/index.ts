import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claimSet = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signingInput = `${header}.${claimSet}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(sigBuffer))}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`OAuth2 token error ${tokenRes.status}: ${errText}`);
  }
  const tokenJson = await tokenRes.json();
  return tokenJson.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const record = payload?.record || payload;
    if (!record || !record.title || !record.body) {
      return new Response(
        JSON.stringify({ error: "Faltan datos de notificación (title/body)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const saRaw = Deno.env.get("FCM_SERVICE_ACCOUNT");
    if (!saRaw) {
      return new Response(
        JSON.stringify({ error: "Falta el secreto FCM_SERVICE_ACCOUNT" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const sa: ServiceAccount = JSON.parse(saRaw);
    const projectId = Deno.env.get("FCM_PROJECT_ID") || sa.project_id;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let targetUserIds: string[] = [];
    if (record.user_id) {
      targetUserIds = [record.user_id];
    } else if (record.empresa_id) {
      const { data: members } = await supabase
        .from("usuario_empresas")
        .select("usuario_id")
        .eq("empresa_id", record.empresa_id);
      targetUserIds = (members || []).map((m) => m.usuario_id).filter(Boolean);
    }

    if (targetUserIds.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "Sin usuarios destino" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("id, token")
      .in("user_id", targetUserIds);

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, message: "Sin tokens registrados" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = await getFcmAccessToken(sa);
    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://finca-manager.vercel.app";
    const iconUrl = `${siteUrl}/pwa-512x512.svg`;
    const badgeUrl = `${siteUrl}/pwa-512x512.svg`;
    const targetUrl = record.url || (record.type === "motor_aceite" ? "/#motores" : "/#ganado");

    let sent = 0;
    const staleIds: string[] = [];

    for (const row of tokens) {
      const fcmRes = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: row.token,
              notification: {
                title: record.title,
                body: record.body,
              },
              webpush: {
                headers: {
                  Urgency: "high",
                },
                notification: {
                  title: record.title,
                  body: record.body,
                  icon: iconUrl,
                  badge: badgeUrl,
                  vibrate: [200, 100, 200],
                  requireInteraction: true,
                  tag: String(record.ref_id || record.type || "finca-notif"),
                },
                fcm_options: {
                  link: `${siteUrl}${targetUrl.startsWith("/") ? targetUrl : `/${targetUrl}`}`,
                },
              },
              data: {
                type: String(record.type || "general"),
                url: targetUrl,
                ref_id: String(record.ref_id || ""),
              },
            },
          }),
        },
      );

      if (fcmRes.ok) {
        sent += 1;
      } else {
        const errText = await fcmRes.text().catch(() => "");
        if (errText.includes("UNREGISTERED") || errText.includes("NotRegistered")) {
          staleIds.push(row.id);
        }
      }
    }

    if (staleIds.length > 0) {
      await supabase.from("push_tokens").delete().in("id", staleIds);
    }

    return new Response(
      JSON.stringify({ sent, removedStale: staleIds.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
