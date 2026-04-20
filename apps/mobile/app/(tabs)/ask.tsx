import { useState, useRef, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator,
  useColorScheme, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Send, MessageSquare } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { getApiBaseUrl } from '@/lib/config'
import { useSession } from '@/hooks/useSession'
import { useOrg } from '@/hooks/useOrg'
import { Colors, dark, light } from '@/constants/colors'

type Confidence = 'high' | 'medium' | 'low' | 'insufficient_evidence'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  confidence?: Confidence
  confidence_score?: number
  cited_chunk_ids?: string[]
  warning_flags?: string[]
  follow_up_questions?: string[]
  error?: boolean
}

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  high: Colors.confidence.high,
  medium: Colors.confidence.medium,
  low: Colors.confidence.low,
  insufficient_evidence: Colors.confidence.insufficient,
}

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  insufficient_evidence: 'Insufficient evidence',
}

export default function AskScreen() {
  const scheme = useColorScheme()
  const t = scheme === 'dark' ? dark : light
  const { session } = useSession()
  const { orgId } = useOrg(session?.user.id)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef<FlatList>(null)

  const sendMessage = useCallback(async () => {
    const question = input.trim()
    if (!question || loading || !orgId) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: question }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      // Call the web API query endpoint
      const apiBase = getApiBaseUrl()
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const token = currentSession?.access_token

      const res = await fetch(`${apiBase}/api/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(orgId ? { 'x-organization-id': orgId } : {}),
        },
        body: JSON.stringify({ question, aircraft_id: null }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || `HTTP ${res.status}`)
      }

      const data = await res.json()
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.answer,
        confidence: data.confidence,
        confidence_score: data.confidence_score,
        cited_chunk_ids: data.cited_chunk_ids ?? data.citedChunkIds,
        warning_flags: data.warning_flags,
        follow_up_questions: data.follow_up_questions,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: err.message ?? 'Something went wrong. Please try again.',
        error: true,
      }])
    } finally {
      setLoading(false)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100)
    }
  }, [input, loading, orgId])

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user'

    if (isUser) {
      return (
        <View style={[styles.bubble, styles.userBubble, { backgroundColor: t.primary }]}>
          <Text style={{ color: Colors.white, fontSize: 15, lineHeight: 22 }}>{item.content}</Text>
        </View>
      )
    }

    const conf = item.confidence
    const confColor = conf ? CONFIDENCE_COLORS[conf] : Colors.gray[400]

    return (
      <View style={[styles.aiBubble, { backgroundColor: t.surface, borderColor: t.border }]}>
        {conf && (
          <View style={[styles.confBadge, { backgroundColor: confColor + '20', borderColor: confColor + '40' }]}>
            <View style={[styles.confDot, { backgroundColor: confColor }]} />
            <Text style={[styles.confText, { color: confColor }]}>{CONFIDENCE_LABELS[conf]}</Text>
            {item.confidence_score !== undefined && (
              <Text style={[styles.confText, { color: confColor }]}>
                {' '}· {Math.round(item.confidence_score * 100)}%
              </Text>
            )}
          </View>
        )}
        <Text style={{ color: item.error ? Colors.confidence.low : t.text, fontSize: 15, lineHeight: 22 }}>
          {item.content}
        </Text>
        {item.warning_flags && item.warning_flags.length > 0 && (
          <View style={[styles.warningBox, { borderColor: Colors.confidence.medium + '60' }]}>
            {item.warning_flags.map((w, i) => (
              <Text key={i} style={{ color: Colors.confidence.medium, fontSize: 13 }}>⚠ {w}</Text>
            ))}
          </View>
        )}
        {item.follow_up_questions && item.follow_up_questions.length > 0 && (
          <View style={{ marginTop: 10 }}>
            <Text style={{ color: t.textMuted, fontSize: 12, marginBottom: 6 }}>Follow-up questions:</Text>
            {item.follow_up_questions.slice(0, 3).map((q, i) => (
              <TouchableOpacity key={i} onPress={() => setInput(q)}>
                <Text style={{ color: t.primary, fontSize: 13, marginTop: 4 }}>› {q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: t.background }]}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Text style={[styles.title, { color: t.text }]}>Ask AI</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <MessageSquare size={48} color={Colors.gray[400]} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>Ask anything about your aircraft</Text>
            <Text style={{ color: t.textMuted, textAlign: 'center', lineHeight: 22 }}>
              Ask about maintenance history, airworthiness directives, or anything in your uploaded documents.
            </Text>
            {['What is the last annual inspection date?', 'Are there any open ADs?', 'When was the last oil change?'].map(q => (
              <TouchableOpacity key={q} onPress={() => setInput(q)} style={[styles.suggestionBtn, { borderColor: t.border }]}>
                <Text style={{ color: t.primary, fontSize: 14 }}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={renderMessage}
          />
        )}

        <View style={[styles.inputRow, { borderTopColor: t.border, backgroundColor: t.background }]}>
          <TextInput
            style={[styles.input, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
            placeholder="Ask a question about your aircraft..."
            placeholderTextColor={t.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[styles.sendBtn, { backgroundColor: loading || !input.trim() ? t.border : t.primary }]}
            onPress={sendMessage}
            disabled={loading || !input.trim()}
          >
            {loading
              ? <ActivityIndicator color={Colors.white} size="small" />
              : <Send size={18} color={Colors.white} />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 22, fontWeight: '700' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  suggestionBtn: {
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, width: '100%',
  },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 12 },
  userBubble: { alignSelf: 'flex-end' },
  aiBubble: {
    borderWidth: 1, borderRadius: 14, padding: 14,
  },
  confBadge: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start', marginBottom: 8,
  },
  confDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  confText: { fontSize: 12, fontWeight: '500' },
  warningBox: { borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 10, gap: 4 },
  inputRow: {
    flexDirection: 'row', padding: 12, gap: 8, borderTopWidth: 1, alignItems: 'flex-end',
  },
  input: {
    flex: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, borderWidth: 1, maxHeight: 120,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
})
