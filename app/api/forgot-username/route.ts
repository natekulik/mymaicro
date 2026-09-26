// "Forgot username" isn't a built-in Supabase Auth flow (username isn't
// the login identifier there — email is), so this looks the user up by
// email via a narrowly-scoped Postgres function and emails them their
// username through Resend. Always responds with the same generic
// message, whether or not the email matched an account, or even whether
// Resend is configured yet — this endpoint must never reveal which
// emails have accounts.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const GENERIC_MESSAGE = "If an account exists for that email, we've sent the username to it.";

export async function POST(request: Request) {
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = body.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Enter your email." }, { status: 400 });
  }

  // Not configured yet (see AUTH_SETUP.md) — still return the generic
  // message so the frontend behaves identically either way.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY) {
    return NextResponse.json({ message: GENERIC_MESSAGE });
  }

  try {
    const supabase = createAdminClient();
    const { data: username } = await supabase.rpc("get_username_by_email", { lookup_email: email });

    if (username) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL ?? "mymaicro <onboarding@resend.dev>",
          to: email,
          subject: "Your mymaicro username",
          text: `Your username is: ${username}`,
        }),
      });
    }
  } catch {
    // Swallowed for the same reason as above — a lookup/send failure
    // must not produce a different response than a non-matching email.
  }

  return NextResponse.json({ message: GENERIC_MESSAGE });
}
