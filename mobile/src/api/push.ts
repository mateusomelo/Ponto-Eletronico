import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { API } from './client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registrarPushToken(): Promise<void> {
  try {
    if (!Device.isDevice) return; // emuladores/web não recebem push

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const { status: existente } = await Notifications.getPermissionsAsync();
    let status = existente;
    if (status !== 'granted') {
      const resp = await Notifications.requestPermissionsAsync();
      status = resp.status;
    }
    if (status !== 'granted') return;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });

    await API.post('/notificacoes/registrar-device', {
      token: tokenData.data,
      plataforma: Platform.OS,
    });
  } catch {
    // Push é um recurso adicional — falha aqui nunca deve travar o login/app.
  }
}
