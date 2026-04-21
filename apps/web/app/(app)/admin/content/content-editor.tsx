'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Image as ImageIcon,
  Video,
  Link as LinkIcon,
  Type,
  Hash,
  Braces,
  FileText,
  Upload,
  Save,
  Sparkles,
  Loader2,
  Trash2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import type { ContentType } from '@/lib/marketing/content'
import type { ContentDefault } from '@/lib/marketing/defaults'

interface ContentRow {
  id?: string
  page: string
  slot: string
  content_type: ContentType
  value: string | null
  metadata: Record<string, any>
  updated_at?: string
  updated_by?: string | null
  updated_by_profile?: { full_name?: string; email?: string } | null
}

interface Props {
  pages: string[]
  defaults: Record<string, Record<string, ContentDefault>>
  initialContent: ContentRow[]
}

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function typeIcon(t: ContentType) {
  switch (t) {
    case 'image':
      return <ImageIcon className="h-3.5 w-3.5" />
    case 'video':
      return <Video className="h-3.5 w-3.5" />
    case 'link':
      return <LinkIcon className="h-3.5 w-3.5" />
    case 'number':
      return <Hash className="h-3.5 w-3.5" />
    case 'json':
      return <Braces className="h-3.5 w-3.5" />
    case 'rich_text':
      return <FileText className="h-3.5 w-3.5" />
    default:
      return <Type className="h-3.5 w-3.5" />
  }
}

export function ContentEditor({ pages, defaults, initialContent }: Props) {
  const [activePage, setActivePage] = useState(pages[0])
  const [rows, setRows] = useState<ContentRow[]>(initialContent)
  const [seeding, setSeeding] = useState(false)
  const [editing, setEditing] = useState<ContentRow | null>(null)

  // Merge defaults + DB rows into a unified slot list per page.
  const slotsByPage = useMemo(() => {
    const byPage: Record<string, ContentRow[]> = {}
    for (const page of pages) {
      const defaultSlots = defaults[page] ?? {}
      const dbRowsByKey = new Map<string, ContentRow>()
      for (const r of rows) {
        if (r.page === page) dbRowsByKey.set(r.slot, r)
      }
      const merged: ContentRow[] = []
      // Defaults first
      for (const [slot, def] of Object.entries(defaultSlots)) {
        const dbRow = dbRowsByKey.get(slot)
        if (dbRow) {
          merged.push({
            ...dbRow,
            metadata: { ...(def.metadata ?? {}), label: def.label, description: def.description, ...(dbRow.metadata ?? {}) },
          })
          dbRowsByKey.delete(slot)
        } else {
          merged.push({
            page,
            slot,
            content_type: def.content_type,
            value: null,
            metadata: { label: def.label ?? slot, description: def.description, default_value: def.value },
          })
        }
      }
      // DB rows not in defaults (custom slots)
      for (const r of dbRowsByKey.values()) merged.push(r)
      byPage[page] = merged
    }
    return byPage
  }, [rows, defaults, pages])

  async function seedDefaults() {
    setSeeding(true)
    try {
      const res = await fetch('/api/admin/marketing-content/seed', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Seed failed')
      toast.success(`Seeded ${data.inserted} slots (${data.skipped} already set)`)
      // Reload page to pick up seeded rows
      window.location.reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Seed failed')
    } finally {
      setSeeding(false)
    }
  }

  async function saveRow(updated: ContentRow) {
    try {
      const res = await fetch('/api/admin/marketing-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: updated.page,
          slot: updated.slot,
          content_type: updated.content_type,
          value: updated.value,
          metadata: updated.metadata,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Save failed')
      setRows((prev) => {
        const withoutOld = prev.filter((r) => !(r.page === updated.page && r.slot === updated.slot))
        return [...withoutOld, data.content]
      })
      toast.success(`Saved ${updated.page}.${updated.slot}`)
      setEditing(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function deleteRow(row: ContentRow) {
    if (!row.id) {
      toast.error('Nothing to delete \u2014 slot has no DB entry')
      return
    }
    if (!confirm(`Delete override for ${row.page}.${row.slot}? Defaults will take over.`)) return
    try {
      const res = await fetch(`/api/admin/marketing-content/${row.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Delete failed')
      setRows((prev) => prev.filter((r) => r.id !== row.id))
      toast.success('Deleted')
      setEditing(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={seedDefaults}
          disabled={seeding}
        >
          {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Seed Defaults
        </Button>
      </div>

      <Tabs value={activePage} onValueChange={setActivePage}>
        <TabsList className="flex flex-wrap h-auto">
          {pages.map((p) => (
            <TabsTrigger key={p} value={p} className="capitalize">
              {p}
            </TabsTrigger>
          ))}
        </TabsList>

        {pages.map((p) => (
          <TabsContent key={p} value={p} className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base capitalize">{p} page</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Slots available for this page. Click Edit to override the default.
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Slot
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Type
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Value
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Last updated
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(slotsByPage[p] ?? []).map((row) => {
                        const label = row.metadata?.label ?? row.slot
                        const hasOverride = !!row.id
                        const displayValue = row.value ?? row.metadata?.default_value ?? ''
                        return (
                          <tr
                            key={`${row.page}::${row.slot}`}
                            className="border-b border-border last:border-0 hover:bg-muted/30"
                          >
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">{label}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {row.slot}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary" className="gap-1 capitalize">
                                {typeIcon(row.content_type)}
                                {row.content_type.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 max-w-md">
                              <ValuePreview row={{ ...row, value: displayValue }} />
                              {!hasOverride && (
                                <span className="text-xs text-muted-foreground italic ml-1">
                                  (default)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {hasOverride ? (
                                <>
                                  {timeAgo(row.updated_at)}
                                  {row.updated_by_profile && (
                                    <div className="text-muted-foreground/70">
                                      by{' '}
                                      {row.updated_by_profile.full_name ??
                                        row.updated_by_profile.email}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span className="italic">using default</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setEditing({
                                    ...row,
                                    value: row.value ?? row.metadata?.default_value ?? '',
                                  })
                                }
                              >
                                Edit
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {editing && (
        <EditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSave={saveRow}
          onDelete={deleteRow}
        />
      )}
    </>
  )
}

function ValuePreview({ row }: { row: ContentRow }) {
  const v = row.value ?? ''
  if (!v) return <span className="text-xs text-muted-foreground italic">empty</span>

  if (row.content_type === 'image') {
    return (
      <div className="flex items-center gap-2">
        <img
          src={v}
          alt=""
          className="h-10 w-16 object-cover rounded border border-border"
          onError={(e) => {
            ;(e.target as HTMLImageElement).style.display = 'none'
          }}
        />
        <span className="text-xs text-muted-foreground truncate max-w-xs">{v}</span>
      </div>
    )
  }
  if (row.content_type === 'video') {
    return (
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground truncate max-w-xs">{v}</span>
      </div>
    )
  }
  if (row.content_type === 'link') {
    return (
      <a
        href={v}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-primary truncate max-w-xs inline-block hover:underline"
      >
        {v}
      </a>
    )
  }
  return (
    <span className="text-xs text-muted-foreground line-clamp-2">
      {v.length > 160 ? `${v.slice(0, 160)}\u2026` : v}
    </span>
  )
}

function EditDialog({
  row,
  onClose,
  onSave,
  onDelete,
}: {
  row: ContentRow
  onClose: () => void
  onSave: (row: ContentRow) => Promise<void>
  onDelete: (row: ContentRow) => Promise<void>
}) {
  const [value, setValue] = useState(row.value ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('page', row.page)
      form.append('slot', row.slot)
      const res = await fetch('/api/admin/marketing-assets/upload', {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed')
      setValue(data.url)
      toast.success('Asset uploaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (row.content_type === 'json' && value) {
      try {
        JSON.parse(value)
      } catch {
        toast.error('Invalid JSON')
        return
      }
    }
    if (row.content_type === 'number' && value && Number.isNaN(Number(value))) {
      toast.error('Invalid number')
      return
    }
    setSaving(true)
    try {
      await onSave({ ...row, value })
    } finally {
      setSaving(false)
    }
  }

  const label = row.metadata?.label ?? row.slot
  const description = row.metadata?.description

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            <span className="font-mono text-xs">{row.page}.{row.slot}</span>
            {description ? ` \u2014 ${description}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(row.content_type === 'text' || row.content_type === 'link') && (
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={row.content_type === 'link' ? 'https://...' : 'Enter text'}
            />
          )}

          {row.content_type === 'number' && (
            <Input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}

          {(row.content_type === 'rich_text' || row.content_type === 'json') && (
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={row.content_type === 'json' ? 12 : 6}
              className={row.content_type === 'json' ? 'font-mono text-xs' : ''}
              placeholder={row.content_type === 'json' ? '{\n  "key": "value"\n}' : ''}
            />
          )}

          {(row.content_type === 'image' || row.content_type === 'video') && (
            <div className="space-y-3">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={`Paste ${row.content_type} URL or upload below`}
              />
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    className="hidden"
                    accept={row.content_type === 'image' ? 'image/*' : 'video/*'}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(f)
                    }}
                    disabled={uploading}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    asChild
                  >
                    <span>
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      Upload {row.content_type}
                    </span>
                  </Button>
                </label>
                <span className="text-xs text-muted-foreground">
                  Max 50 MB. Stored in the <code>marketing-assets</code> bucket.
                </span>
              </div>
              {value && row.content_type === 'image' && (
                <div className="rounded-md border border-border p-2 bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={value}
                    alt="preview"
                    className="max-h-48 mx-auto rounded"
                  />
                </div>
              )}
              {value && row.content_type === 'video' && (
                <div className="rounded-md border border-border p-2 bg-muted/30">
                  <video src={value} controls className="max-h-48 w-full rounded" />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <div>
            {row.id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(row)}
                disabled={saving}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Revert to default
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
