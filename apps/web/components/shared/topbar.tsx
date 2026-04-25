'use client'

import Link, { useTenantRouter } from '@/components/shared/tenant-link'
import { Bell, LogOut, Search, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { FeedbackDialog } from '@/components/shared/feedback-dialog'
import { SupportDialog } from '@/components/shared/support-dialog'
import type { UserProfile } from '@/types'

interface TopbarProps {
  profile: UserProfile
  breadcrumbs?: { label: string; href?: string }[]
  actions?: React.ReactNode
}

export function Topbar({ profile, breadcrumbs: _breadcrumbs = [], actions }: TopbarProps) {
  const router = useTenantRouter()

  async function handleSignOut() {
    const supabase = createBrowserSupabase()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = profile.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? profile.email[0]?.toUpperCase() ?? '?'

  const searchPlaceholder =
    _breadcrumbs.length > 0
      ? `Search ${_breadcrumbs[_breadcrumbs.length - 1].label}...`
      : 'Search records or ask a question (e.g. "When was my last oil change?")'

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-white flex-shrink-0">
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <div className="flex-1 flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            className="bg-transparent text-[13px] outline-none flex-1 placeholder:text-muted-foreground/60"
          />
          <kbd className="text-[10px] text-muted-foreground bg-white px-1.5 py-0.5 rounded border border-border">
            /
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {actions}

        <FeedbackDialog />
        <SupportDialog />

        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="h-4 w-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
              <Avatar className="h-8 w-8">
                <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.full_name ?? ''} />
                <AvatarFallback className="bg-brand-100 text-brand-700 text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{profile.full_name ?? 'User'}</p>
                <p className="text-xs text-muted-foreground font-normal">{profile.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
