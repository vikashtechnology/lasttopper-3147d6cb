import { createServerFn } from "@tanstack/react-start";

/** Ask for a WhatsApp login code. Always resolves generically to avoid leaking who is registered. */
export const requestPhoneOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) => input)
  .handler(async ({ data }) => {
    const { normalisePhone, generateCode, hashCode, sendWhatsappText } = await import(
      "@/lib/phone-auth.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const phone = normalisePhone(data.phone);
    if (!phone) return { ok: false as const, message: "Enter a valid phone number." };

    // Simple throttle: max 3 codes per number per 10 minutes.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("phone_otps")
      .select("id", { count: "exact", head: true })
      .eq("phone", phone)
      .gte("created_at", since);
    if ((count ?? 0) >= 3) {
      return { ok: false as const, message: "Too many attempts. Try again in a few minutes." };
    }

    const code = generateCode();
    const code_hash = await hashCode(phone, code);
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin
      .from("phone_otps")
      .insert({ phone, code_hash, expires_at });
    if (error) {
      console.error("phone_otps insert failed", error);
      return { ok: false as const, message: "Failed. Please try again." };
    }

    try {
      await sendWhatsappText(
        phone,
        `*${code}* is your Last Topper login code.\n\nIt expires in 10 minutes. Never share this code with anyone.`,
      );
    } catch (err) {
      console.error(err);
      return { ok: false as const, message: "Failed. Please try again." };
    }

    return { ok: true as const, phone };
  });

/**
 * Verify the code and mint a one-time token the browser exchanges for a session
 * via supabase.auth.verifyOtp({ token_hash, type: 'email' }).
 */
export const verifyPhoneOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; code: string }) => input)
  .handler(async ({ data }) => {
    const { normalisePhone, hashCode, phoneEmail } = await import("@/lib/phone-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const phone = normalisePhone(data.phone);
    const code = (data.code || "").replace(/\D/g, "");
    if (!phone || code.length !== 6) {
      return { ok: false as const, message: "Code is invalid or expired." };
    }

    const { data: row } = await supabaseAdmin
      .from("phone_otps")
      .select("id, code_hash, expires_at, attempts, consumed_at")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= 5) {
      return { ok: false as const, message: "Code is invalid or expired." };
    }

    const expected = await hashCode(phone, code);
    if (expected !== row.code_hash) {
      await supabaseAdmin
        .from("phone_otps")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      return { ok: false as const, message: "Code is invalid or expired." };
    }

    await supabaseAdmin
      .from("phone_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);

    const email = phoneEmail(phone);

    // Create the auth user on first login; ignore "already registered".
    const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      phone_confirm: false,
      user_metadata: { phone: `+${phone}`, login_method: "whatsapp" },
    });
    if (createErr && !/already/i.test(createErr.message)) {
      console.error("createUser failed", createErr);
      return { ok: false as const, message: "Failed. Please try again." };
    }

    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      console.error("generateLink failed", linkErr);
      return { ok: false as const, message: "Failed. Please try again." };
    }

    // Keep the profile row's phone in sync.
    if (link.user?.id) {
      await supabaseAdmin
        .from("users")
        .update({ phone: `+${phone}` })
        .eq("id", link.user.id);
    }

    return { ok: true as const, tokenHash: link.properties.hashed_token };
  });
