const planStyles = {
  free: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
  basic: 'bg-sky-500/10 text-sky-400 border-sky-500/40',
  pro: 'bg-stealth-500/10 text-stealth-400 border-stealth-500/40',
  team: 'bg-violet-500/10 text-violet-400 border-violet-500/40',
}

export default function PlanBadge({ plan }) {
  return (
    <span className={`text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border ${planStyles[plan] || planStyles.free}`}>
      {plan}
    </span>
  )
}
