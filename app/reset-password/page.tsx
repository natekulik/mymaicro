import AuthCard from "@/components/auth/AuthCard";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <AuthCard title="Reset password" description="Choose a new password for your account.">
      <ResetPasswordForm />
    </AuthCard>
  );
}
