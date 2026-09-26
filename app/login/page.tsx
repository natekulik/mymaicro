import AuthCard from "@/components/auth/AuthCard";
import LoginForm from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <AuthCard title="Log in" description="Welcome back to mymaicro.">
      <LoginForm />
    </AuthCard>
  );
}
