import { HTMLAttributes, forwardRef } from 'react'

type CardVariant = 'default' | 'elevated' | 'interactive' | 'feature' | 'stat' | 'citation'

interface MaCardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
}

const variantMap: Record<CardVariant, string> = {
  default: 'bg-white border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.06)]',
  elevated: 'bg-white border border-[#E2E8F0] shadow-[0_4px_12px_rgba(0,0,0,0.08)]',
  interactive: 'bg-white border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer',
  feature: 'bg-white border border-[#E2E8F0] shadow-[0_4px_12px_rgba(0,0,0,0.08)] hover:border-[#2563EB]/30 hover:shadow-[0_8px_24px_rgba(37,99,235,0.08)] transition-all duration-200',
  stat: 'bg-white border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.06)]',
  citation: 'bg-white border border-[#E2E8F0] border-l-4 border-l-[#2563EB] bg-[#FAFBFF] shadow-[0_1px_3px_rgba(0,0,0,0.06)]',
}

export const MaCard = forwardRef<HTMLDivElement, MaCardProps>(({
  variant = 'default', className = '', children, ...props
}, ref) => (
  <div
    ref={ref}
    className={`rounded-[14px] ${variantMap[variant]} ${className}`}
    {...props}
  >
    {children}
  </div>
))
MaCard.displayName = 'MaCard'
