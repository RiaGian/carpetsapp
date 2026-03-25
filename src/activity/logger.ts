import Constants from 'expo-constants'
import * as Device from 'expo-device'
import { Platform } from 'react-native'

const SERVER_URL = 'http://localhost:4000' 

export function logLoginSuccessConsole(userId: string, email: string) {
  const payload = {
    userId,
    email,
    device: Device.modelName,
    os: Platform.OS,
    osVersion: String(Device.osVersion ?? ''),
    ip: 'unknown', // client-side placeholder
    appVersion: Constants.expoConfig?.version ?? '1.0.0',
    ts: new Date().toISOString(),
  }

  console.log('LOGIN_SUCCESS', payload)

  // send --> server to print
  fetch(`${SERVER_URL}/api/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'LOGIN_SUCCESS', payload }),
  }).catch(err => console.warn('Log send failed:', err))
}
