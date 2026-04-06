import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native'
import { Link } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleReset() {
    if (!email) return
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'myaircraft://reset-password',
    })
    setLoading(false)
    if (error) Alert.alert('Error', error.message)
    else setSent(true)
  }

  return (
    <LinearGradient colors={[Colors.navy[900], Colors.navy[800]]} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={styles.form}>
          <Text style={styles.title}>Reset password</Text>
          <Text style={{ color: Colors.gray[400], marginBottom: 20, lineHeight: 22 }}>
            Enter your email and we'll send you a reset link.
          </Text>

          {sent ? (
            <Text style={{ color: Colors.confidence.high, textAlign: 'center', marginVertical: 16 }}>
              Check your email for the reset link.
            </Text>
          ) : (
            <>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={Colors.gray[500]}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TouchableOpacity style={styles.button} onPress={handleReset} disabled={loading}>
                {loading
                  ? <ActivityIndicator color={Colors.white} />
                  : <Text style={styles.buttonText}>Send reset link</Text>
                }
              </TouchableOpacity>
            </>
          )}

          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={{ marginTop: 16, alignSelf: 'center' }}>
              <Text style={styles.linkText}>Back to sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  form: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.white, marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: Colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 12,
  },
  button: {
    backgroundColor: Colors.brand[600],
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  linkText: { color: Colors.sky[400], fontSize: 14, fontWeight: '500' },
})
