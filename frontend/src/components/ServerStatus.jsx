export default function ServerStatus({ server }) {
  const status = server.isOnline ? 'online' : 'offline'
  return (
    <div className="card flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{server.country === 'IN' ? '🇮🇳' : server.country === 'DE' ? '🇩🇪' : '🌐'}</span>
        <div>
          <h3 className="font-semibold text-white capitalize">{server.name}</h3>
          <p className="text-xs text-slate-500">{server.region}, {server.country}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-xs text-slate-500">{server.ip}</div>
          <div className="text-[11px] text-slate-600">
            WG :{server.wgPort} · Xray :{server.xrayPort}
          </div>
        </div>
        <span
          className={`w-2.5 h-2.5 rounded-full ${
            server.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
          }`}
          title={status}
        />
      </div>
    </div>
  )
}
