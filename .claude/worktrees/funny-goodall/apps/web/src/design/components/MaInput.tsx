'use client'
import { forwardRef, InputHTMLAttributes, useState } from 'react'
import { MaIcon, IconName } from '../icons/MaIcon'

interface MaInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: IconName
  variant?: 'default' | 'search'
}

export const MaInput = forwardRef<HTMLInputElement, MaInputProps>(({
  label, error, icon, variant = 'default', className = '', ...props
}, ref) => {
  const [focused, setFocused] = useState(false)
  return (
    <div className="relative">
      {label && (
        <label className="block text-[13px] font-medium text-[#374151] mb-1.5">{label}</label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
            <MaIcon name={icon} size={16} />
          </span>
        )}
        <input
          ref={ref}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`
            w-full h-10 px-3 ${icon ? 'pl-9' : ''}
            rounded-[10px] border text-[14px] text-[#0D1117] bg-white
            placeholder:text-[#9CA3AF] outline-none transition-all duration-150
            ${error
              ? 'border-[#EF4444] shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
              : focused
                ? 'border-[#2563EB] shadow-[0_0_0_3px_rgba(37,99,235,0.15)]'
                : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
            }
            disabled:bg-[#F8F9FB] disabled:text-[#9CA3AF] disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-[12px] text-[#EF4444]">{error}</p>}
    </div>
  )
})
MaInput.displayName = 'MaInput'
