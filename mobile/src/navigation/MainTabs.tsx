import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FontAwesome5 } from '@expo/vector-icons';
import DashboardScreen from '../screens/DashboardScreen';
import PontoScreen from '../screens/PontoScreen';
import HistoricoScreen from '../screens/HistoricoScreen';
import MaisStack from './MaisStack';
import { useAuth } from '../contexts/AuthContext';
import { NotificacoesAPI } from '../api/notificacoes';

const Tab = createBottomTabNavigator();

// Sino de notificações: mostra contador de não lidas e abre a tela de
// Notificações (mesma lista que a API /notificacoes alimenta na web).
function SinoNotificacoes() {
  const navigation = useNavigation();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    async function carregar() {
      try { setTotal((await NotificacoesAPI.naoLidas()).total || 0); } catch { /* silencioso */ }
    }
    carregar();
    const interval = setInterval(carregar, 60000);
    return () => clearInterval(interval);
  }, []);

  function abrir() {
    navigation.dispatch(
      CommonActions.navigate({ name: 'Mais', params: { screen: 'Notificacoes' } })
    );
  }

  return (
    <TouchableOpacity onPress={abrir} style={styles.sinoBtn}>
      <FontAwesome5 name="bell" size={18} color="#475569" solid />
      {total > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{total > 9 ? '9+' : total}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function MainTabs() {
  const { logout } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#94a3b8',
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <SinoNotificacoes />
            <TouchableOpacity onPress={logout} style={styles.sairBtn}>
              <FontAwesome5 name="sign-out-alt" size={14} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ),
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }) => <FontAwesome5 name="chart-line" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Ponto"
        component={PontoScreen}
        options={{ title: 'Registrar Ponto', tabBarIcon: ({ color, size }) => <FontAwesome5 name="clock" size={size} color={color} regular /> }}
      />
      <Tab.Screen
        name="Histórico"
        component={HistoricoScreen}
        options={{ title: 'Histórico', tabBarIcon: ({ color, size }) => <FontAwesome5 name="history" size={size} color={color} /> }}
      />
      <Tab.Screen
        name="Mais"
        component={MaisStack}
        options={{ title: 'Mais', headerShown: false, tabBarIcon: ({ color, size }) => <FontAwesome5 name="bars" size={size} color={color} /> }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  sinoBtn: { marginRight: 4, padding: 8 },
  sairBtn: { marginRight: 16, marginLeft: 4, padding: 8 },
  badge: {
    position: 'absolute', top: 2, right: 2, backgroundColor: '#ef4444',
    borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
