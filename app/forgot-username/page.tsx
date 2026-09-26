import AuthCard from "@/components/auth/AuthCard";
import ForgotUsernameForm from "@/components/auth/ForgotUsernameForm";

export default function ForgotUsernamePage() {
  return (
    <AuthCard title="Forgot username" description="We'll email your username to you.">
      <ForgotUsernameForm />
    </AuthCard>
  );
}
