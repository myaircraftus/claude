import { Redirect } from 'expo-router'
import { View, ActivityIndicator } from 'react-native'
import { useSession } from '@/hooks/useSession'
import { Colors } from '@/constants/colors'

export default function Index() {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.navy[900] }}>
        <ActivityIndicator color={Colors.brand[500]} size="large" />
      </View>
    )
  }

  return session ? <Redirect href="/(tabs)" /> : <Redirect href="/(auth)/login" />
}
