interface CreditsCardProps {
  balance: number;
}

export function CreditsCard({ balance }: CreditsCardProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-slate-500">Credits Balance</p>
      <p className="mt-2 text-4xl font-semibold text-ink">{balance}</p>
    </section>
  );
}
