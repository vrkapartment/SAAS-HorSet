export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-slate-800/80 rounded-xl ${className}`} />
}
