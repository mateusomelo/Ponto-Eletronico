import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import DashboardScreen from '../screens/DashboardScreen';
import PontoScreen from '../screens/PontoScreen';
import HistoricoScreen from '../screens/HistoricoScreen';
import MaisStack from './MaisStack';
import { useAuth } from '../contexts/AuthContext';
import { NotificacoesAPI } from '../api/notificacoes';

const Tab = createBottomTabNavigator();

// Sino de notificações: mesmo comportamento da web — mostra contador de não
// lidas e, ao tocar, leva para Fechamentos (onde ficam as notificações reais:
// fechamento enviado, fatura vencendo, etc.), igual ao topbar do site.
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
      CommonActions.navigate({ name: 'Mais', params: { screen: 'Fechamentos' } })
    );
  }

  return (
    <TouchableOpacity onPress={abrir} style={styles.sinoBtn}>
      <Text style={styles.sinoIcone}>🔔</Text>
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
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <SinoNotificacoes />
            <TouchableOpacity onPress={logout} style={{ marginRight: 16, marginLeft: 4 }}>
              <Text style={{ color: '#dc2626', fontWeight: '600' }}>Sair</Text>
            </TouchableOpacity>
          </View>
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

const styles = StyleSheet.create({
  sinoBtn: { marginRight: 4, padding: 6 },
  sinoIcone: { fontSize: 18 },
  badge: {
    position: 'absolute', top: 0, right: 0, backgroundColor: '#dc2626',
    borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
