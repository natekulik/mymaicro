import AuthCard from "@/components/auth/AuthCard";
import SignUpForm from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return (
    <AuthCard title="Create your account" description="Set up your mymaicro account.">
      <SignUpForm />
    </AuthCard>
  );
}
