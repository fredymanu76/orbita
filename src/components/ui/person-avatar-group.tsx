interface PersonAvatarGroupProps {
  people: { name: string }[]
  max?: number
}

export function PersonAvatarGroup({ people, max = 3 }: PersonAvatarGroupProps) {
  const visible = people.slice(0, max)
  const overflow = people.length - max

  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((p, i) => (
        <div
          key={i}
          className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-medium text-blue-600 ring-1.5 ring-white"
          title={p.name}
        >
          {p.name[0]}
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[8px] font-medium text-slate-500 ring-1.5 ring-white">
          +{overflow}
        </div>
      )}
    </div>
  )
}
