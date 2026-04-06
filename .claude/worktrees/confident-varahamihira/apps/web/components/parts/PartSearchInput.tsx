'use client'

import { useState, useRef } from 'react'
import { Search, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Props {
  onSearch: (query: string) => void
  isLoading?: boolean
  defaultValue?: string
  placeholder?: string
}

export function PartSearchInput({ onSearch, isLoading, defaultValue = '', placeholder }: Props) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = value.trim()
    if (q) onSearch(q)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={placeholder ?? 'Search by part number, description, or keyword…'}
          className="pl-9 text-sm h-10"
          disabled={isLoading}
          autoFocus
        />
      </div>
      <Button type="submit" disabled={isLoading || !value.trim()} className="h-10 px-5">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          'Search'
        )}
      </Button>
    </form>
  )
}
