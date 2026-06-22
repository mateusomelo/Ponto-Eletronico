import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import EsqueciSenhaScreen from '../screens/EsqueciSenhaScreen';
import MainTabs from './MainTabs';
import SuperAdminStack from './SuperAdminStack';
import BiometriaLockScreen from '../screens/BiometriaLockScreen';
import BannerAtualizacao from '../components/BannerAtualizacao';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { usuario, carregando, bloqueadoPorBiometria } = useAuth();

  if (carregando) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {usuario && !bloqueadoPorBiometria && <BannerAtualizacao />}
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {bloqueadoPorBiometria ? (
            <Stack.Screen name="BiometriaLock" component={BiometriaLockScreen} />
          ) : usuario?.role === 'super_admin' ? (
            <Stack.Screen name="SuperAdmin" component={SuperAdminStack} />
          ) : usuario ? (
            <Stack.Screen name="Main" component={MainTabs} />
          ) : (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="EsqueciSenha" component={EsqueciSenhaScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}
