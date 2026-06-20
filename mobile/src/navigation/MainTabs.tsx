import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import DashboardScreen from '../screens/DashboardScreen';
import PontoScreen from '../screens/PontoScreen';
import HistoricoScreen from '../screens/HistoricoScreen';
import MaisStack from './MaisStack';
import { useAuth } from '../contexts/AuthContext';

const Tab = createBottomTabNavigator();

export default function MainTabs() {
  const { logout } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#3b82f6',
        headerRight: () => (
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <Text style={{ color: '#dc2626', fontWeight: '600' }}>Sair</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="Ponto" component={PontoScreen} options={{ title: 'Registrar Ponto' }} />
      <Tab.Screen name="Histórico" component={HistoricoScreen} options={{ title: 'Histórico' }} />
      <Tab.Screen name="Mais" component={MaisStack} options={{ title: 'Mais', headerShown: false }} />
    </Tab.Navigator>
  );
}
