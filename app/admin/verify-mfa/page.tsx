import { redirect } from "next/navigation";

// The authenticator code is now asked for at login (components/auth/LoginForm.tsx)
// rather than on the way into /admin. Kept as a redirect so old links still land somewhere.
export default function VerifyMfaPage() {
  redirect("/login");
}
