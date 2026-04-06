'use client'
import { forwardRef, ButtonHTMLAttributes } from 'react'
import { PulseLoader } from '../loaders'
import { MaIcon, IconName } from '../icons/MaIcon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'gold'
type Size = 'sm' | 'md' | 'lg'

interface MaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  iconLeft?: IconName
  iconRight?: IconName
  iconOnly?: boolean
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-[#2563EB] text-white border border-[#2563EB] hover:bg-[#1D4ED8] hover:border-[#1D4ED8] shadow-[0_4px_20px_rgba(37,99,235,0)] hover:shadow-[0_4px_20px_rgba(37,99,235,0.25)] focus:ring-2 focus:ring-[#2563EB]/30',
  secondary: 'bg-white text-[#0D1117] border border-[#E2E8F0] hover:bg-[#F8F9FB] hover:border-[#CBD5E1] focus:ring-2 focus:ring-[#2563EB]/20',
  ghost: 'bg-transparent text-[#2563EB] border border-transparent hover:bg-[#EFF6FF] focus:ring-2 focus:ring-[#2563EB]/20',
  destructive: 'bg-[#EF4444] text-white border border-[#EF4444] hover:bg-[#DC2626] focus:ring-2 focus:ring-red-500/30',
  gold: 'bg-[#B8860B] text-white border border-[#B8860B] hover:bg-[#9A7209] focus:ring-2 focus:ring-yellow-500/30',
}

const sizeStyles: Record<Size, { button: string; icon: number; loader: string }> = {
  sm: { button: 'h-8 px-3 text-[13px] font-medium gap-1.5', icon: 14, loader: '' },
  md: { button: 'h-10 px-4 text-[14px] font-medium gap-2', icon: 16, loader: '' },
  lg: { button: 'h-12 px-6 text-[15px] font-semibold gap-2', icon: 18, loader: '' },
}

export const MaButton = forwardRef<HTMLButtonElement, MaButtonProps>(({
  variant = 'primary', size = 'md', loading, iconLeft, iconRight, iconOnly,
  children, className = '', disabled, ...props
}, ref) => {
  const s = sizeStyles[size]
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center rounded-[10px] transition-all duration-150
        focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed select-none
        ${s.button} ${variantStyles[variant]}
        ${iconOnly ? 'aspect-square px-0' : ''}
        ${className}
      `}
      {...props}
    >
      {loading ? (
        <PulseLoader color={variant === 'primary' || variant === 'destructive' || variant === 'gold' ? '#fff' : '#2563EB'} />
      ) : (
        <>
          {iconLeft && <MaIcon name={iconLeft} size={s.icon} />}
          {!iconOnly && children}
          {iconRight && <MaIcon name={iconRight} size={s.icon} />}
        </>
      )}
    </button>
  )
})
MaButton.displayName = 'MaButton'
