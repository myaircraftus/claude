import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { Link, router } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { supabase } from '@/lib/supabase'
import { Colors } from '@/constants/colors'

export default function SignupScreen() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSignup() {
    if (!fullName || !email || !password) {
      Alert.alert('Error', 'Please fill in all fields.')
      return
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName } },
    })
    setLoading(false)
    if (error) {
      Alert.alert('Signup failed', error.message)
    } else {
      setSuccess(true)
    }
  }

  if (success) {
    return (
      <LinearGradient colors={[Colors.navy[900], Colors.navy[800]]} style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <View style={[styles.form, { alignItems: 'center' }]}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>✉️</Text>
          <Text style={[styles.title, { textAlign: 'center' }]}>Check your email</Text>
          <Text style={{ color: Colors.gray[400], textAlign: 'center', lineHeight: 22 }}>
            We sent a confirmation link to {email}. Click it to activate your account.
          </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity style={[styles.button, { marginTop: 24, width: '100%' }]}>
              <Text style={styles.buttonText}>Back to sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </LinearGradient>
    )
  }

  return (
    <LinearGradient colors={[Colors.navy[900], Colors.navy[800]]} style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.header}>
            <Text style={styles.logo}>✈ myaircraft.us</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.title}>Create account</Text>

            <TextInput
              style={styles.input}
              placeholder="Full name"
              placeholderTextColor={Colors.gray[500]}
              value={fullName}
              onChangeText={setFullName}
              autoComplete="name"
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={Colors.gray[500]}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <TextInput
              style={styles.input}
              placeholder="Password (8+ characters)"
              placeholderTextColor={Colors.gray[500]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity style={styles.button} onPress={handleSignup} disabled={loading}>
              {loading
                ? <ActivityIndicator color={Colors.white} />
                : <Text style={styles.buttonText}>Create account</Text>
              }
            </TouchableOpacity>

            <View style={styles.row}>
              <Text style={styles.mutedText}>Already have an account? </Text>
              <Link href="/(auth)/login" asChild>
                <TouchableOpacity>
                  <Text style={styles.linkText}>Sign in</Text>
                </TouchableOpacity>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 28, fontWeight: '700', color: Colors.white },
  form: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  title: { fontSize: 22, fontWeight: '700', color: Colors.white, marginBottom: 20 },
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
    marginTop: 4,
  },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '600' },
  linkText: { color: Colors.sky[400], fontSize: 14, fontWeight: '500' },
  row: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  mutedText: { color: Colors.gray[400], fontSize: 14 },
})
