// src/state/AuthProvider.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { Platform } from 'react-native';

/** Public shape of the authenticated user */
export type AuthUser = { id: string; email: string; name: string } | null

type AuthContextType = {
  user: AuthUser
  loading: boolean           // true while loading user from storage
  signIn: (u: NonNullable<AuthUser>) => Promise<void>
  signOut: () => Promise<void>
}

// create a React Context to share auth state
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
})

// Key used for storing the user in local/async storage
const STORAGE_KEY = 'auth:user'

// uses localStorage on web & AsyncStorage on native (iOS/Android).
const storage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key)
    }
    return await AsyncStorage.getItem(key)
  },
  async setItem(key: string, val: string) {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, val)
      return
    }
    await AsyncStorage.setItem(key, val)
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key)
      return
    }
    await AsyncStorage.removeItem(key)
  },
}

// gives access to --> the current logged-in user & the signIn() and signOut() functions
export const useAuth = () => useContext(AuthContext)

// AuthProvider manages the current user session.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null)
  const [loading, setLoading] = useState(true)

  // Load user from storage once when app starts
  useEffect(() => {
    (async () => {
      try {
        const raw = await storage.getItem(STORAGE_KEY)
        if (raw) {
          setUser(JSON.parse(raw))
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Save the user in state + persist to storage
  const signIn = useCallback(async (u: NonNullable<AuthUser>) => {
    setUser(u)
    await storage.setItem(STORAGE_KEY, JSON.stringify(u))
  }, [])

  // clear the user from state + remove from storage
  const signOut = useCallback(async () => {
    setUser(null)
    await storage.removeItem(STORAGE_KEY)
  }, [])

  // memoize the context value to prevent unnecessary re-renders 
  const value = useMemo(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut]
  )

  // Provide auth state and actions to all children
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
