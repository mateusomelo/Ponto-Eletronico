import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MaisMenuScreen from '../screens/MaisMenuScreen';
import RelatoriosScreen from '../screens/RelatoriosScreen';
import UsuariosScreen from '../screens/UsuariosScreen';
import CargosScreen from '../screens/CargosScreen';
import ConfiguracoesScreen from '../screens/ConfiguracoesScreen';

const Stack = createNativeStackNavigator();

export default function MaisStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="MaisMenu" component={MaisMenuScreen} options={{ title: 'Mais' }} />
      <Stack.Screen name="Relatorios" component={RelatoriosScreen} options={{ title: 'Relatórios' }} />
      <Stack.Screen name="Usuarios" component={UsuariosScreen} options={{ title: 'Usuários' }} />
      <Stack.Screen name="Cargos" component={CargosScreen} options={{ title: 'Cargos' }} />
      <Stack.Screen name="Configuracoes" component={ConfiguracoesScreen} options={{ title: 'Configurações' }} />
    </Stack.Navigator>
  );
}
