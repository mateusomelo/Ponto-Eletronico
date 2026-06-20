import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { AuthProvider } from './src/contexts/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';

// Verifica e aplica updates OTA imediatamente no início,
// em vez de esperar o próximo restart do app.
async function checarUpdateImediato() {
  if (__DEV__) return;
  try {
    const update = await Updates.checkForUpdateAsync();
    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch { /* sem rede ou já atualizado — segue com a versão atual */ }
}

export default function App() {
  useEffect(() => { checarUpdateImediato(); }, []);

  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <RootNavigator />
    </AuthProvider>
  );
}
