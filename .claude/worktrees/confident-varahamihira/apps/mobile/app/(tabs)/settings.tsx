import { useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, useColorScheme,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { LogOut, User, Building2, ChevronRight, CreditCard } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/hooks/useSession'
import { useOrg } from '@/hooks/useOrg'
import { Colors, dark, light } from '@/constants/colors'

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  fleet: 'Fleet',
  enterprise: 'Enterprise',
}

export default function SettingsScreen() {
  const scheme = useColorScheme()
  const t = scheme === 'dark' ? dark : light
  const { session } = useSession()
  const { org, role, loading } = useOrg(session?.user.id)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => {
          setSigningOut(true)
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  const Row = ({ icon, label, value, onPress }: { icon: React.ReactNode; label: string; value?: string; onPress?: () => void }) => (
    <TouchableOpacity
      style={[styles.row, { borderBottomColor: t.border }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.rowIcon, { backgroundColor: scheme === 'dark' ? Colors.navy[800] : Colors.brand[50] }]}>
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: t.text }]}>{label}</Text>
        {value && <Text style={[styles.rowValue, { color: t.textMuted }]}>{value}</Text>}
      </View>
      {onPress && <ChevronRight size={16} color={t.textMuted} />}
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.primary} size="large" />
      </View>
    )
  }

  const usagePercent = org
    ? Math.round((org.queries_used_this_month / org.plan_queries_monthly) * 100)
    : 0

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.background }]}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Text style={[styles.title, { color: t.text }]}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        {/* Account */}
        <View>
          <Text style={[styles.section, { color: t.textMuted }]}>ACCOUNT</Text>
          <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Row
              icon={<User size={18} color={t.primary} />}
              label={session?.user.user_metadata?.full_name ?? 'Your name'}
              value={session?.user.email}
            />
          </View>
        </View>

        {/* Organization */}
        {org && (
          <View>
            <Text style={[styles.section, { color: t.textMuted }]}>ORGANIZATION</Text>
            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Row
                icon={<Building2 size={18} color={t.primary} />}
                label={org.name}
                value={`${PLAN_LABELS[org.plan] ?? org.plan} plan · ${role}`}
              />
              <Row
                icon={<CreditCard size={18} color={t.primary} />}
                label="Billing"
                value={`${org.queries_used_this_month} / ${org.plan_queries_monthly} queries used`}
              />
            </View>
            {/* Usage bar */}
            <View style={{ marginTop: 8 }}>
              <View style={[styles.usageBar, { backgroundColor: t.border }]}>
                <View
                  style={[
                    styles.usageFill,
                    {
                      width: `${Math.min(usagePercent, 100)}%`,
                      backgroundColor: usagePercent > 90 ? Colors.confidence.low : t.primary,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.usageText, { color: t.textMuted }]}>
                {usagePercent}% of monthly queries used
              </Text>
            </View>
          </View>
        )}

        {/* Sign out */}
        <View>
          <TouchableOpacity
            style={[styles.signOutBtn, { borderColor: Colors.confidence.low + '40' }]}
            onPress={handleSignOut}
            disabled={signingOut}
          >
            {signingOut
              ? <ActivityIndicator color={Colors.confidence.low} size="small" />
              : <LogOut size={18} color={Colors.confidence.low} />
            }
            <Text style={{ color: Colors.confidence.low, fontSize: 16, fontWeight: '600', marginLeft: 8 }}>
              Sign out
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.version, { color: t.textMuted }]}>myaircraft.us v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  title: { fontSize: 22, fontWeight: '700' },
  section: { fontSize: 11, fontWeight: '600', letterSpacing: 0.8, marginBottom: 6, marginLeft: 4 },
  card: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    paddingVertical: 14, borderBottomWidth: 1, gap: 12,
  },
  rowIcon: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowValue: { fontSize: 13, marginTop: 1 },
  usageBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  usageFill: { height: 6, borderRadius: 3 },
  usageText: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, borderWidth: 1,
  },
  version: { textAlign: 'center', fontSize: 12 },
})
