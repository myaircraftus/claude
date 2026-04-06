'use client'
import { useEffect, useState } from 'react'

export function PulseLoader({ color = '#2563EB' }: { color?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%', backgroundColor: color,
            display: 'inline-block',
            animation: `ma-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes ma-pulse {
          0%, 60%, 100% { transform: scale(0.7); opacity: 0.5; }
          30% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </span>
  )
}

export function SpinLoader({ size = 20, color = '#2563EB' }: { size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 20 20" style={{ animation: 'ma-spin 0.8s linear infinite' }}>
        <circle cx="10" cy="10" r="8" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.15"/>
        <path d="M10 2 A8 8 0 0 1 18 10" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <style>{`@keyframes ma-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </span>
  )
}

export function SkeletonLoader({ className = '', height = 16, width = '100%', rounded = false }: {
  className?: string; height?: number; width?: number | string; rounded?: boolean
}) {
  return (
    <span
      className={className}
      style={{
        display: 'block', height, width, borderRadius: rounded ? 9999 : 6,
        background: 'linear-gradient(90deg, #E8ECF2 25%, #F1F3F7 50%, #E8ECF2 75%)',
        backgroundSize: '200% 100%',
        animation: 'ma-shimmer 1.5s infinite',
      }}
    >
      <style>{`@keyframes ma-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </span>
  )
}

export function ProgressBar({ value, indeterminate = false, color = '#2563EB' }: {
  value?: number; indeterminate?: boolean; color?: string
}) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 3, zIndex: 9999, background: 'transparent' }}>
      <div style={{
        height: '100%', background: color,
        width: indeterminate ? '40%' : `${value ?? 0}%`,
        transition: indeterminate ? 'none' : 'width 200ms ease',
        animation: indeterminate ? 'ma-progress 1.5s ease-in-out infinite' : 'none',
        borderRadius: '0 2px 2px 0',
      }}/>
      <style>{`@keyframes ma-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
    </div>
  )
}
