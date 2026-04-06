import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, useColorScheme,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Plane, FileText, Calendar } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { Colors, dark, light } from '@/constants/colors'

interface Aircraft {
  id: string
  tail_number: string
  make: string | null
  model: string | null
  year: number | null
  serial_number: string | null
  engine_make: string | null
  engine_model: string | null
}

interface Document {
  id: string
  title: string
  doc_type: string
  parsing_status: string
  created_at: string
}

const STATUS_COLORS: Record<string, string> = {
  completed: Colors.confidence.high,
  failed: Colors.confidence.low,
  parsing: Colors.confidence.medium,
  embedding: Colors.confidence.medium,
  queued: Colors.gray[400],
}

export default function AircraftDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const scheme = useColorScheme()
  const t = scheme === 'dark' ? dark : light
  const [aircraft, setAircraft] = useState<Aircraft | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('aircraft').select('*').eq('id', id).single(),
      supabase
        .from('documents')
        .select('id, title, doc_type, parsing_status, created_at')
        .eq('aircraft_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]).then(([aircraftRes, docsRes]) => {
      setAircraft(aircraftRes.data)
      setDocuments(docsRes.data ?? [])
      setLoading(false)
    })
  }, [id])

  if (loading || !aircraft) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.primary} size="large" />
      </View>
    )
  }

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: t.background }]}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={22} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: t.text }]}>{aircraft.tail_number}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Aircraft info card */}
        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: scheme === 'dark' ? Colors.navy[800] : Colors.brand[50] }]}>
            <Plane size={28} color={t.primary} />
          </View>
          <Text style={[styles.tailNum, { color: t.text }]}>{aircraft.tail_number}</Text>
          <Text style={[styles.meta, { color: t.textMuted }]}>
            {[aircraft.year, aircraft.make, aircraft.model].filter(Boolean).join(' ') || 'No details'}
          </Text>
          {aircraft.serial_number && (
            <Text style={[styles.meta, { color: t.textMuted }]}>S/N: {aircraft.serial_number}</Text>
          )}
          {(aircraft.engine_make || aircraft.engine_model) && (
            <Text style={[styles.meta, { color: t.textMuted }]}>
              Engine: {[aircraft.engine_make, aircraft.engine_model].filter(Boolean).join(' ')}
            </Text>
          )}
        </View>

        {/* Documents */}
        <View>
          <Text style={[styles.sectionTitle, { color: t.text }]}>
            Documents ({documents.length})
          </Text>
          {documents.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: t.surface, borderColor: t.border }]}>
              <FileText size={32} color={Colors.gray[400]} />
              <Text style={{ color: t.textMuted, marginTop: 10 }}>No documents yet</Text>
            </View>
          ) : (
            documents.map(doc => (
              <View key={doc.id} style={[styles.docCard, { backgroundColor: t.surface, borderColor: t.border }]}>
                <FileText size={18} color={t.primary} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[{ color: t.text, fontWeight: '500' }]} numberOfLines={1}>{doc.title}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' }}>
                    {doc.doc_type.replace(/_/g, ' ')}
                  </Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[doc.parsing_status] ?? Colors.gray[400] }]} />
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  card: {
    borderRadius: 14, padding: 20, borderWidth: 1, alignItems: 'center',
  },
  iconWrap: { width: 56, height: 56, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  tailNum: { fontSize: 24, fontWeight: '700', letterSpacing: 1 },
  meta: { fontSize: 14, marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  emptyCard: {
    borderRadius: 12, padding: 28, borderWidth: 1, alignItems: 'center',
  },
  docCard: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10,
    padding: 12, borderWidth: 1, marginBottom: 8,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
})
