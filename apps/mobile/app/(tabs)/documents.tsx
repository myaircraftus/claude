import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, Alert, useColorScheme,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as DocumentPicker from 'expo-document-picker'
import { FileText, Upload, CheckCircle, XCircle, Clock, Loader } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { getApiBaseUrl } from '@/lib/config'
import { useSession } from '@/hooks/useSession'
import { useOrg } from '@/hooks/useOrg'
import { Colors, dark, light } from '@/constants/colors'

interface Document {
  id: string
  title: string
  doc_type: string
  parsing_status: string
  file_size_bytes: number | null
  created_at: string
}

const STATUS_ICON = {
  completed: (c: string) => <CheckCircle size={16} color={c} />,
  failed: (c: string) => <XCircle size={16} color={c} />,
  queued: (c: string) => <Clock size={16} color={c} />,
  parsing: (c: string) => <Loader size={16} color={c} />,
  embedding: (c: string) => <Loader size={16} color={c} />,
  chunking: (c: string) => <Loader size={16} color={c} />,
}

const STATUS_COLOR: Record<string, string> = {
  completed: Colors.confidence.high,
  failed: Colors.confidence.low,
  queued: Colors.gray[400],
  parsing: Colors.confidence.medium,
  embedding: Colors.confidence.medium,
  chunking: Colors.confidence.medium,
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function DocumentsScreen() {
  const scheme = useColorScheme()
  const t = scheme === 'dark' ? dark : light
  const { session } = useSession()
  const { orgId } = useOrg(session?.user.id)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [uploading, setUploading] = useState(false)

  const fetchDocuments = useCallback(async () => {
    if (!orgId) return
    const { data } = await supabase
      .from('documents')
      .select('id, title, doc_type, parsing_status, file_size_bytes, created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50)
    setDocuments(data ?? [])
    setLoading(false)
    setRefreshing(false)
  }, [orgId])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  async function handleUpload() {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets?.[0]) return

    const file = result.assets[0]
    if (!orgId || !session) return

    setUploading(true)
    try {
      const apiBase = getApiBaseUrl()
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const token = currentSession?.access_token

      if (!token) {
        throw new Error('You need to sign in again before uploading.')
      }

      const formData = new FormData()
      formData.append('doc_type', 'miscellaneous')
      formData.append(
        'file',
        {
          uri: file.uri,
          name: file.name,
          type: file.mimeType ?? 'application/pdf',
        } as any
      )

      const res = await fetch(`${apiBase}/api/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(orgId ? { 'x-organization-id': orgId } : {}),
        },
        body: formData,
      })

      if (!res.ok) {
        const payload = await res.json().catch(() => null)
        throw new Error(payload?.error ?? `Upload failed with HTTP ${res.status}`)
      }

      fetchDocuments()
      Alert.alert('Uploaded', 'Document uploaded and queued for processing.')
    } catch (err: any) {
      Alert.alert('Upload failed', err.message)
    } finally {
      setUploading(false)
    }
  }

  const renderItem = ({ item }: { item: Document }) => {
    const color = STATUS_COLOR[item.parsing_status] ?? Colors.gray[400]
    const Icon = STATUS_ICON[item.parsing_status as keyof typeof STATUS_ICON]

    return (
      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <FileText size={20} color={t.primary} style={{ marginRight: 12 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.docTitle, { color: t.text }]} numberOfLines={1}>{item.title}</Text>
          <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' }}>
            {item.doc_type.replace(/_/g, ' ')}
            {item.file_size_bytes ? `  ·  ${formatBytes(item.file_size_bytes)}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          {Icon ? Icon(color) : null}
          <Text style={{ color, fontSize: 10, textTransform: 'capitalize' }}>{item.parsing_status}</Text>
        </View>
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.background }]}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Text style={[styles.title, { color: t.text }]}>Documents</Text>
        <TouchableOpacity
          style={[styles.uploadBtn, { backgroundColor: uploading ? t.border : t.primary }]}
          onPress={handleUpload}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator color={Colors.white} size="small" />
            : <Upload size={16} color={Colors.white} />
          }
          <Text style={{ color: Colors.white, fontWeight: '600', fontSize: 14, marginLeft: 6 }}>
            {uploading ? 'Uploading...' : 'Upload PDF'}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={t.primary} size="large" /></View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDocuments() }} tintColor={t.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <FileText size={48} color={Colors.gray[400]} />
              <Text style={[{ color: t.text, fontSize: 16, fontWeight: '600', marginTop: 16 }]}>No documents yet</Text>
              <Text style={{ color: t.textMuted, marginTop: 6 }}>Upload your first PDF to get started.</Text>
            </View>
          }
          renderItem={renderItem}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '700' },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: 8,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 10,
    padding: 12, borderWidth: 1, marginBottom: 8,
  },
  docTitle: { fontSize: 15, fontWeight: '500' },
})
