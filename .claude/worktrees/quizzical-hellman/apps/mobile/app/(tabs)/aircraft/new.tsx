import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, useColorScheme,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/hooks/useSession'
import { useOrg } from '@/hooks/useOrg'
import { Colors, dark, light } from '@/constants/colors'

export default function NewAircraftScreen() {
  const scheme = useColorScheme()
  const t = scheme === 'dark' ? dark : light
  const { session } = useSession()
  const { orgId } = useOrg(session?.user.id)
  const [tailNumber, setTailNumber] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!tailNumber.trim()) {
      Alert.alert('Error', 'Tail number is required.')
      return
    }
    if (!orgId) return
    setLoading(true)
    const { error } = await supabase.from('aircraft').insert({
      organization_id: orgId,
      tail_number: tailNumber.trim().toUpperCase(),
      make: make.trim() || null,
      model: model.trim() || null,
      year: year ? parseInt(year) : null,
    })
    setLoading(false)
    if (error) {
      Alert.alert('Error', error.message.includes('unique') ? 'That tail number already exists.' : error.message)
    } else {
      router.back()
    }
  }

  const field = (label: string, value: string, setter: (v: string) => void, opts: object = {}) => (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.label, { color: t.textMuted }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: t.surface, borderColor: t.border, color: t.text }]}
        placeholderTextColor={t.textMuted}
        value={value}
        onChangeText={setter}
        {...opts}
      />
    </View>
  )

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: t.background }]}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <ArrowLeft size={22} color={t.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: t.text }]}>Add aircraft</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {field('Tail number *', tailNumber, setTailNumber, { autoCapitalize: 'characters', placeholder: 'N12345' })}
        {field('Make', make, setMake, { placeholder: 'Cessna' })}
        {field('Model', model, setModel, { placeholder: '172S' })}
        {field('Year', year, setYear, { keyboardType: 'number-pad', placeholder: '2010' })}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: t.primary }]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color={Colors.white} />
            : <Text style={styles.buttonText}>Add aircraft</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  input: {
    borderRadius: 10, padding: 14, fontSize: 16, borderWidth: 1,
  },
  button: { borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
})
