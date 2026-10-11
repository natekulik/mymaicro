import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";

// Lets NavTabs decide whether to show the "Admin" link without ever
// putting ADMIN_EMAILS itself in client-reachable code — a plain env var
// (no NEXT_PUBLIC_ prefix) only exists server-side, so this tiny route is
// the only way a Client Component can know the answer.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return NextResponse.json({ isAdmin: isAdminEmail(user?.email) });
}
