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

// ── Airplane path shared by SpinnerPlane / UploadProgress ───────────────────
const MA_PLANE_PATH = 'M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2 1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'

export function SpinnerRing({ size = 24, color = '#2563EB' }: { size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'ma-ring-spin 0.7s linear infinite' }}>
        <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2.5" strokeOpacity="0.15" />
        <path d="M12 3 A9 9 0 0 1 21 12" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <style>{`@keyframes ma-ring-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </span>
  )
}

export function SpinnerDots({ size = 8, color = '#2563EB' }: { size?: number; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: size, height: size, borderRadius: '50%', backgroundColor: color,
            display: 'inline-block',
            animation: `ma-dots 1.4s ease-in-out ${i * 0.16}s infinite both`,
          }}
        />
      ))}
      <style>{`
        @keyframes ma-dots {
          0%, 80%, 100% { transform: scale(0.5); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </span>
  )
}

export function SpinnerPlane({ size = 32, color = '#2563EB' }: { size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size, position: 'relative' }}>
      <span
        style={{
          display: 'block', width: '100%', height: '100%',
          animation: 'ma-plane-orbit 1.6s linear infinite',
        }}
      >
        <svg
          width={size * 0.45}
          height={size * 0.45}
          viewBox="0 0 24 24"
          style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%) rotate(90deg)' }}
        >
          <path d={MA_PLANE_PATH} fill={color} />
        </svg>
      </span>
      <style>{`@keyframes ma-plane-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </span>
  )
}

export function SpinnerPulse({ size = 24, color = '#2563EB' }: { size?: number; color?: string }) {
  return (
    <span style={{ display: 'inline-block', width: size, height: size, position: 'relative' }}>
      <span
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: color,
          animation: 'ma-pulse-ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite',
        }}
      />
      <span
        style={{
          position: 'absolute', inset: '25%', borderRadius: '50%', backgroundColor: color,
        }}
      />
      <style>{`
        @keyframes ma-pulse-ping {
          0% { transform: scale(0.4); opacity: 0.7; }
          80%, 100% { transform: scale(1); opacity: 0; }
        }
      `}</style>
    </span>
  )
}

export function SkeletonLine({ width = '100%', height = 14, className = '' }: {
  width?: string | number; height?: number; className?: string
}) {
  return (
    <span
      className={className}
      style={{
        display: 'block', width, height, borderRadius: 6,
        background: 'linear-gradient(90deg, #E8ECF2 25%, #F1F3F7 50%, #E8ECF2 75%)',
        backgroundSize: '200% 100%',
        animation: 'ma-shimmer 1.5s infinite',
      }}
    >
      <style>{`@keyframes ma-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </span>
  )
}

export function SkeletonCard() {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 12, padding: 16,
        borderRadius: 12, border: '1px solid #E8ECF2', background: '#FFFFFF',
        width: '100%', maxWidth: 320,
      }}
    >
      <div
        style={{
          width: '100%', height: 160, borderRadius: 8,
          background: 'linear-gradient(90deg, #E8ECF2 25%, #F1F3F7 50%, #E8ECF2 75%)',
          backgroundSize: '200% 100%',
          animation: 'ma-shimmer 1.5s infinite',
        }}
      />
      <SkeletonLine width="80%" height={16} />
      <SkeletonLine width="100%" height={12} />
      <SkeletonLine width="60%" height={12} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <SkeletonLine width={72} height={20} />
        <SkeletonLine width={48} height={20} />
      </div>
      <style>{`@keyframes ma-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '12px 16px',
            background: r % 2 === 0 ? '#FFFFFF' : '#F8FAFC',
          }}
        >
          <SkeletonLine width={32} height={32} className="rounded-full" />
          <SkeletonLine width="30%" height={12} />
          <SkeletonLine width="20%" height={12} />
          <SkeletonLine width="25%" height={12} />
          <span style={{ marginLeft: 'auto' }}>
            <SkeletonLine width={64} height={24} />
          </span>
        </div>
      ))}
    </div>
  )
}

export function AILookupLoader() {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 16, padding: 20,
        borderRadius: 12, border: '1px solid #E8ECF2', background: '#F8FAFC',
        width: '100%', maxWidth: 380,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SpinnerRing size={20} color="#2563EB" />
        <span style={{ fontSize: 14, fontWeight: 500, color: '#1B2B5E' }}>
          AI searching catalog…
        </span>
      </div>
      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
          borderRadius: 8, background: '#FFFFFF', border: '1px solid #E8ECF2',
        }}
      >
        <SkeletonLine width="70%" height={12} />
        <SkeletonLine width="100%" height={10} />
        <SkeletonLine width="45%" height={10} />
      </div>
    </div>
  )
}

export function UploadProgress({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div style={{ width: '100%', maxWidth: 360 }}>
      <div
        style={{
          position: 'relative', height: 8, borderRadius: 9999,
          background: '#F8FAFC', border: '1px solid #E8ECF2', overflow: 'visible',
        }}
      >
        <div
          style={{
            position: 'absolute', top: 0, left: 0, bottom: 0,
            width: `${clamped}%`, borderRadius: 9999,
            background: 'linear-gradient(90deg, #2563EB, #059669)',
            transition: 'width 300ms ease',
          }}
        />
        <span
          style={{
            position: 'absolute', top: '50%', left: `${clamped}%`,
            transform: 'translate(-50%, -50%)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: '50%',
            background: '#FFFFFF', border: '1px solid #E8ECF2',
            boxShadow: '0 1px 3px rgba(27, 43, 94, 0.15)',
            transition: 'left 300ms ease',
            animation: clamped < 100 ? 'ma-upload-bob 0.9s ease-in-out infinite' : 'none',
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" style={{ transform: 'rotate(45deg)' }}>
            <path d={MA_PLANE_PATH} fill="#2563EB" />
          </svg>
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 500, color: '#64748B', textAlign: 'right' }}>
        {Math.round(clamped)}%
      </div>
      <style>{`
        @keyframes ma-upload-bob {
          0%, 100% { transform: translate(-50%, -50%); }
          50% { transform: translate(-50%, -65%); }
        }
      `}</style>
    </div>
  )
}
