'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, CheckCircle2, Wrench, AlertTriangle } from 'lucide-react'

type InviteStatus = 'loading' | 'valid_existing' | 'valid_new' | 'invalid' | 'expired' | 'accepted'

export function AcceptMechanicInviteClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') ?? ''

  const [status, setStatus] = useState<InviteStatus>('loading')
  const [invite, setInvite] = useState<any>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // New-user signup form
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Existing-user sign-in form
  const [email, setEmail] = useState('')
  const [signInPassword, setSignInPassword] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('invalid')
      return
    }

    const supabase = createBrowserSupabase()
    supabase
      .from('mechanic_invites')
      .select('*')
      .eq('invite_token', token)
      .single()
      .then(({ data, error: fetchError }) => {
        if (fetchError || !data) {
          setStatus('invalid')
          return
        }
        if (data.accepted_at) {
          setStatus('accepted')
          return
        }
        if (data.status === 'expired' || data.status === 'revoked') {
          setStatus('expired')
          return
        }
        if (data.trial_expires_at && new Date(data.trial_expires_at) < new Date()) {
          setStatus('expired')
          return
        }
        setInvite(data)
        setStatus(data.existing_user_id ? 'valid_existing' : 'valid_new')
        if (data.mechanic_email) setEmail(data.mechanic_email)
      })
  }, [token])

  async function handleNewUserSignup(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSubmitting(true)
    setError('')
    const supabase = createBrowserSupabase()

    try {
      // Sign up the new user
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: invite.mechanic_email,
        password,
        options: {
          data: {
            full_name: invite.mechanic_name,
            invited_via_mechanic_invite: invite.id,
          },
        },
      })

      if (signUpError) throw signUpError

      // Mark invite as accepted
      await supabase
        .from('mechanic_invites')
        .update({
          accepted_at: new Date().toISOString(),
          status: 'accepted',
          trial_user_id: signUpData.user?.id ?? null,
        })
        .eq('invite_token', token)

      router.push('/mechanic')
    } catch (err: any) {
      setError(err.message ?? 'Sign up failed. Please try again.')
      setSubmitting(false)
    }
  }

  async function handleExistingUserSignIn(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const supabase = createBrowserSupabase()

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: signInPassword })
      if (signInError) throw signInError

      // Mark invite as accepted
      await supabase
        .from('mechanic_invites')
        .update({
          accepted_at: new Date().toISOString(),
          status: 'accepted',
        })
        .eq('invite_token', token)

      router.push('/mechanic')
    } catch (err: any) {
      setError(err.message ?? 'Sign in failed. Please try again.')
      setSubmitting(false)
    }
  }

  // ─── States ──────────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-sm text-gray-500">Verifying invite...</p>
        </div>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-10 w-10 text-red-500 mx-auto mb-2" />
            <CardTitle>Invalid Invite Link</CardTitle>
            <CardDescription>This invite link is not valid or has already been used.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" onClick={() => router.push('/')}>Go to Home</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto mb-2" />
            <CardTitle>Invite Expired</CardTitle>
            <CardDescription>This invite has expired or been revoked. Ask the owner to send a new invite.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" onClick={() => router.push('/')}>Go to Home</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (status === 'accepted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
            <CardTitle>Already Accepted</CardTitle>
            <CardDescription>This invite has already been accepted.</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => router.push('/mechanic')}>Go to Mechanic Portal</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center h-12 w-12 bg-blue-100 rounded-full mx-auto mb-3">
            <Wrench className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle>
            {status === 'valid_new' ? 'Accept Mechanic Invite' : 'Sign In to Accept'}
          </CardTitle>
          <CardDescription>
            {invite?.mechanic_name && (
              <span>You&apos;re invited as <strong>{invite.mechanic_name}</strong>.</span>
            )}{' '}
            {status === 'valid_new'
              ? 'Create your account to get started with a free 30-day trial.'
              : 'Sign in to your existing account to accept this invite.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {status === 'valid_new' && (
            <form onSubmit={handleNewUserSignup} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={email}
                  disabled
                  className="bg-gray-50"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="new-password">Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm-password">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating account...</> : 'Create Account & Accept'}
              </Button>
              <p className="text-xs text-center text-gray-400">
                30-day free trial. No credit card required.
              </p>
            </form>
          )}

          {status === 'valid_existing' && (
            <form onSubmit={handleExistingUserSignIn} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="Your password"
                  value={signInPassword}
                  onChange={e => setSignInPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Signing in...</> : 'Sign In & Accept'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
