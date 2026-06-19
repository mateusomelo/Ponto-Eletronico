import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// SecureStore só existe em iOS/Android nativo (usa Keychain/Keystore).
// No preview web (usado em dev) cai para localStorage.
export async function storageGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return window.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function storageSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { window.localStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}

export async function storageDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') { window.localStorage.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key);
}
