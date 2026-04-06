import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, useColorScheme,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Plane, Plus, AlertCircle } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/hooks/useSession'
import { useOrg } from '@/hooks/useOrg'
import { Colors, dark, light } from '@/constants/colors'

interface Aircraft {
  id: string
  tail_number: string
  make: string | null
  model: string | null
  year: number | null
  document_count?: number
}

export default function AircraftScreen() {
  const scheme = useColorScheme()
  const t = scheme === 'dark' ? dark : light
  const { session } = useSession()
  const { orgId, loading: orgLoading } = useOrg(session?.user.id)
  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchAircraft = useCallback(async () => {
    if (!orgId) return
    const { data } = await supabase
      .from('aircraft')
      .select('id, tail_number, make, model, year')
      .eq('organization_id', orgId)
      .order('tail_number')
    setAircraft(data ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [orgId])

  useEffect(() => { fetchAircraft() }, [fetchAircraft])

  const onRefresh = () => {
    setRefreshing(true)
    fetchAircraft()
  }

  if (orgLoading || loading) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.primary} size="large" />
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.background }]}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Text style={[styles.title, { color: t.text }]}>My Aircraft</Text>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: t.primary }]}
          onPress={() => router.push('/(tabs)/aircraft/new')}
        >
          <Plus size={18} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {aircraft.length === 0 ? (
        <View style={styles.empty}>
          <Plane size={56} color={Colors.gray[400]} />
          <Text style={[styles.emptyTitle, { color: t.text }]}>No aircraft yet</Text>
          <Text style={{ color: t.textMuted, textAlign: 'center', marginTop: 8 }}>
            Add your first aircraft to start uploading documents.
          </Text>
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: t.primary, paddingHorizontal: 20, borderRadius: 10, marginTop: 20 }]}
            onPress={() => router.push('/(tabs)/aircraft/new')}
          >
            <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 15 }}>Add aircraft</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={aircraft}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
              onPress={() => router.push(`/(tabs)/aircraft/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={[styles.icon, { backgroundColor: scheme === 'dark' ? Colors.navy[800] : Colors.brand[50] }]}>
                <Plane size={22} color={t.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.tailNumber, { color: t.text }]}>{item.tail_number}</Text>
                {(item.make || item.model) && (
                  <Text style={{ color: t.textMuted, fontSize: 14, marginTop: 2 }}>
                    {[item.year, item.make, item.model].filter(Boolean).join(' ')}
                  </Text>
                )}
              </View>
              <Text style={{ color: t.textMuted, fontSize: 13 }}>›</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '700' },
  addBtn: { width: 36, height: 36, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    gap: 12,
  },
  icon: { width: 44, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  tailNumber: { fontSize: 16, fontWeight: '600' },
})
