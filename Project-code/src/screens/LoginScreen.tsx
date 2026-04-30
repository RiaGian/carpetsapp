// src/screens/LoginScreen.tsx
import { Link, router } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Image, Keyboard, Platform, StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { logLoginSuccessConsole } from '../activity/logger'
import { loginApi } from '../api/auth'
import Divider from '../components/Divider'
import TextField from '../components/TextField'
import { initializeDatabase } from '../database/initializeDatabase'
import { logLogin, printActivityLogs } from '../services/activitylog'
import { colors } from '../theme/colors'

let LocalAuthentication: typeof import('expo-local-authentication') | undefined
if (Platform.OS !== 'web') {

  LocalAuthentication = require('expo-local-authentication')
}

/** TypingText - loop */
function TypingText({
  text,
  speed = 80,
  delay = 0,
  pause = 1200,
  showCursor = true,
  style,
}: {
  text: string
  speed?: number
  delay?: number
  pause?: number
  showCursor?: boolean
  style?: any
}) {
  const [output, setOutput] = useState('')
  const [cursorOn, setCursorOn] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const iRef = useRef(0)

  useEffect(() => {
    let startTimer: ReturnType<typeof setTimeout> | undefined
    let typeTimer: ReturnType<typeof setInterval> | undefined
    let cursorTimer: ReturnType<typeof setInterval> | undefined

    const startTypingCycle = () => {
      typeTimer = setInterval(() => {
        setOutput(prev => {
          if (!deleting) {
            if (iRef.current < text.length) {
              iRef.current += 1
              return text.slice(0, iRef.current)
            } else {
              if (typeTimer) clearInterval(typeTimer)
              startTimer = setTimeout(() => setDeleting(true), pause)
              return prev
            }
          } else {
            if (iRef.current > 0) {
              iRef.current -= 1
              return text.slice(0, iRef.current)
            } else {
              setDeleting(false)
              if (typeTimer) clearInterval(typeTimer)
              startTimer = setTimeout(startTypingCycle, delay)
              return ''
            }
          }
        })
      }, speed)
    }

    startTimer = setTimeout(startTypingCycle, delay)
    cursorTimer = setInterval(() => setCursorOn(prev => !prev), 500)

    return () => {
      if (startTimer) clearTimeout(startTimer)
      if (typeTimer) clearInterval(typeTimer)
      if (cursorTimer) clearInterval(cursorTimer)
    }
  }, [text, speed, delay, pause, deleting])

  return (
    <Text style={style}>
      {output}
      {showCursor ? (cursorOn ? '|' : ' ') : null}
    </Text>
  )
}

/** LoginScreen */
export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // Init DB μία φορά
  useEffect(() => {
    initializeDatabase().catch(err => console.warn('Init error', err))
  }, [])

  async function onLogin(email: string, password: string) {
    try {
      setLoading(true)

      const res = await loginApi(email, password)

      if (res.ok) {
        
        Keyboard.dismiss()

        // Web: καθάρισε active focus πριν τη μετάβαση
        if (Platform.OS === 'web') {
          const active = document.activeElement as HTMLElement | null
          active?.blur()
        }

        // καταγραφω login στο activity_logs
        await logLogin(String(res.user.id), {
          email: res.user.email,
          platform: Platform.OS,
        })

        // fetch - server
        await fetch('http://localhost:4000/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'login',
            payload: {
              userId: res.user.id,
              email: res.user.email,
              platform: Platform.OS,
            },
          }),
        })

        // print logs 
        await printActivityLogs()

        // print logger
        logLoginSuccessConsole(String(res.user.id), res.user.email)

        // --> dashboard
        router.push({
          pathname: '/dashboard',
          params: { name: res.user.name, email: res.user.email },
        })
      } else {
        Alert.alert('Σύνδεση', 'Λάθος στοιχεία.')
      }
    } catch (err) {
      console.error('Σφάλμα κατά το login:', err)
      Alert.alert('Σφάλμα', 'Αποτυχία σύνδεσης με τον server.')
    } finally {
      setLoading(false)
    }
  }

  /** Face ID / Fingerprint (όχι web) */
  async function onFaceId() {
    if (Platform.OS === 'web') {
      Alert.alert('Βιομετρικά', 'Το Face ID / Fingerprint δεν υποστηρίζεται στο web.')
      return
    }
    if (!LocalAuthentication) {
      Alert.alert('Βιομετρικά', 'Το module δεν είναι διαθέσιμο.')
      return
    }

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync()
      if (!hasHardware) {
        Alert.alert('Βιομετρικά', 'Η συσκευή δεν υποστηρίζει βιομετρικό έλεγχο.')
        return
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync()
      if (!isEnrolled) {
        Alert.alert('Βιομετρικά', 'Δεν έχει ρυθμιστεί Face ID/Αποτύπωμα στη συσκευή.')
        return
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: Platform.OS === 'ios' ? 'Σύνδεση με Face ID' : 'Σύνδεση με Fingerprint',
        cancelLabel: 'Ακύρωση',
        fallbackLabel: 'Χρήση κωδικού',
        disableDeviceFallback: false,
      })

      if (result.success) {
        Alert.alert('Καλωσήρθες', 'Επιτυχής ταυτοποίηση.')
        // Αν έχεις user context, μπορείς να log-άρεις και εδώ:
        // await logLogin(userId, { method: 'biometric', platform: Platform.OS })
        router.push('/dashboard')
      } else {
        Alert.alert('Αποτυχία', 'Δεν ολοκληρώθηκε ο βιομετρικός έλεγχος.')
      }
    } catch (e) {
      console.error('Biometric error', e)
      Alert.alert('Σφάλμα', 'Κάτι πήγε στραβά με τον βιομετρικό έλεγχο.')
    }
  }

  const handlePress = () => {
    if (!email || !password) {
      Alert.alert('Σύνδεση', 'Συμπλήρωσε email και κωδικό.')
      return
    }
    void onLogin(email, password)
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        {/* Logo */}
        <Image source={require('../../assets/images/logo.png')} style={styles.logo} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>Carpets App</Text>
          <TypingText
            text="Καλώς ήρθατε"
            speed={90}
            delay={200}
            pause={1000}
            showCursor={true}
            style={styles.subtitle}
          />
        </View>

        {/* Email */}
        <View style={{ marginTop: 12 }}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderText="✉️  example@email.com"
          />
        </View>

        {/* Password */}
        <View style={{ marginTop: 12 }}>
          <TextField
            label="Κωδικός"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholderText="🔒  Εισάγετε τον κωδικό σας"
          />
        </View>

        {/* Main Login Button */}
        <TouchableOpacity
          onPress={handlePress}
          disabled={loading || !email || !password}
          style={[
            styles.primaryBtn,
            { marginTop: 18, opacity: loading || !email || !password ? 0.6 : 1 },
          ]}
          activeOpacity={0.9}
        >
          <Text style={styles.primaryBtnText}>{loading ? 'Σύνδεση…' : 'Σύνδεση'}</Text>
        </TouchableOpacity>

        {/* Divider */}
        <View style={{ marginVertical: 3 }}>
          <Divider />
        </View>

        {/* Face ID Button — δεν εμφανίζεται στο web */}
        {Platform.OS !== 'web' && (
          <TouchableOpacity
            onPress={onFaceId}
            style={[styles.faceIdBtn, { marginTop: 3 }]}
            activeOpacity={0.9}
          >
            <View style={styles.faceIdContent}>
              <Image source={require('../../assets/images/faceid.png')} style={styles.faceIdIcon} />
              <Text style={styles.faceIdText}>
                {Platform.OS === 'ios' ? 'Σύνδεση με Face ID' : 'Σύνδεση με Fingerprint'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Forgot link */}
        <View style={{ alignItems: 'center', marginTop: 15 }}>
          <Link href="/forgot" asChild>
            <TouchableOpacity style={styles.forgotContainer}>
              <Text style={styles.forgotText}>Ξεχάσατε τον κωδικό σας;</Text>
            </TouchableOpacity>
          </Link>
        </View>

        {/* Platform note */}
        <Text style={[styles.platformNote, { marginTop: 50 }]}>
          Πλατφόρμα: {Platform.OS.toUpperCase()}
        </Text>
      </View>
    </View>
  )
}

/** Styles */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 660,
    minHeight: 740,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    paddingTop: 150,
    ...(Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 3 },
      default: {},
    }) as object),
  },
  logo: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 10,
    marginTop: -100,
  },
  header: { marginBottom: 34, alignItems: 'center' },
  brand: {
    fontSize: 35,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 23,
    fontWeight: '400',
    color: colors.muted,
    textAlign: 'center',
    marginTop: 10,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },

  primaryBtnText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 18 
  },

  forgotContainer: { alignItems: 'center', justifyContent: 'center' },
  forgotText: { color: colors.primary, fontWeight: '600', fontSize: 17 },
  faceIdBtn: {
    backgroundColor: '#fff',
    borderColor: colors.primary,
    borderWidth: 2,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
  },
  faceIdText: { color: colors.primary, fontWeight: '700', fontSize: 18 },

  platformNote: { fontSize: 12, color: colors.muted, textAlign: 'center' },

  faceIdContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  faceIdIcon: { width: 24, height: 24, resizeMode: 'contain' },
})
