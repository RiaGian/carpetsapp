import { Platform } from 'react-native'

const IOS_LAN = 'http://192.168.1.79:4000/api'      // iPhone / iOS simulator
const ANDROID_EMU = 'http://10.0.2.2:4000/api'      // Android emulator
const WEB = 'http://localhost:4000/api'             // Browser (web interface)

export const BASE_URL =
  Platform.OS === 'web'
    ? WEB
    : Platform.OS === 'android'
    ? ANDROID_EMU
    : IOS_LAN
