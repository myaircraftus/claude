export const Colors = {
  brand: {
    50: '#EFF6FF',
    100: '#DBEAFE',
    500: '#3B82F6',
    600: '#2563EB',
    700: '#1D4ED8',
    900: '#1E3A8A',
  },
  sky: {
    400: '#38BDF8',
    500: '#0EA5E9',
  },
  navy: {
    900: '#0A1628',
    800: '#0F2240',
  },
  confidence: {
    high: '#10B981',
    medium: '#F59E0B',
    low: '#EF4444',
    insufficient: '#6B7280',
  },
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },
  white: '#FFFFFF',
  black: '#000000',
}

export const dark = {
  background: Colors.navy[900],
  surface: Colors.navy[800],
  border: '#1E3A5F',
  text: Colors.white,
  textMuted: Colors.gray[400],
  primary: Colors.brand[500],
}

export const light = {
  background: Colors.gray[50],
  surface: Colors.white,
  border: Colors.gray[200],
  text: Colors.gray[900],
  textMuted: Colors.gray[500],
  primary: Colors.brand[600],
}
