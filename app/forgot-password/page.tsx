import AuthCard from "@/components/auth/AuthCard";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot password" description="We'll email you a link to reset it.">
      <ForgotPasswordForm />
    </AuthCard>
  );
}
