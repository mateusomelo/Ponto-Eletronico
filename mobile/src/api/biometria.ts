import * as LocalAuthentication from 'expo-local-authentication';
import { storageDelete, storageGet, storageSet } from './storage';

const BIOMETRIA_KEY = 'ponto_biometria_habilitada';

export async function biometriaDisponivel(): Promise<boolean> {
  const temHardware = await LocalAuthentication.hasHardwareAsync();
  const temCadastro = await LocalAuthentication.isEnrolledAsync();
  return temHardware && temCadastro;
}

export async function biometriaHabilitada(): Promise<boolean> {
  return (await storageGet(BIOMETRIA_KEY)) === 'true';
}

export async function setBiometriaHabilitada(valor: boolean): Promise<void> {
  if (valor) await storageSet(BIOMETRIA_KEY, 'true');
  else await storageDelete(BIOMETRIA_KEY);
}

export async function autenticarComBiometria(): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Confirme sua identidade para entrar',
    cancelLabel: 'Cancelar',
    disableDeviceFallback: false,
  });
  return result.success;
}
