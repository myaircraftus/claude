import { MaIcon } from '../icons/MaIcon'

export function MaTrustChip({ label = 'Citation-backed' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-[12px] font-medium">
      <MaIcon name="shield" size={12} color="#10B981" strokeWidth={2} />
      {label}
    </span>
  )
}
