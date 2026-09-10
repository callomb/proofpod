export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-[1px] font-semibold tracking-tight ${className}`}>
      <span>Proof</span>
      <span className="text-muted">Pod</span>
    </span>
  );
}
