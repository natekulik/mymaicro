// Shared centered-card shell for every auth page (login/signup/forgot-*)
// — narrower than the app's usual max-w-6xl pages since a form with a
// handful of fields doesn't need that width.

export default function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-1 text-center">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      </header>
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        {children}
      </div>
    </div>
  );
}
