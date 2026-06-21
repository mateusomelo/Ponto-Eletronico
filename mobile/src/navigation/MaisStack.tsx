import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MaisMenuScreen from '../screens/MaisMenuScreen';
import RelatoriosScreen from '../screens/RelatoriosScreen';
import UsuariosScreen from '../screens/UsuariosScreen';
import UsuarioFormScreen from '../screens/UsuarioFormScreen';
import CargosScreen from '../screens/CargosScreen';
import CargoFormScreen from '../screens/CargoFormScreen';
import ConfiguracoesScreen from '../screens/ConfiguracoesScreen';
import FechamentosScreen from '../screens/FechamentosScreen';
import NovoFechamentoScreen from '../screens/NovoFechamentoScreen';
import LogsScreen from '../screens/LogsScreen';
import PagamentosScreen from '../screens/PagamentosScreen';
import PerfilScreen from '../screens/PerfilScreen';

const Stack = createNativeStackNavigator();

export default function MaisStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="MaisMenu" component={MaisMenuScreen} options={{ title: 'Mais' }} />
      <Stack.Screen name="Relatorios" component={RelatoriosScreen} options={{ title: 'Relatórios' }} />
      <Stack.Screen name="Usuarios" component={UsuariosScreen} options={{ title: 'Usuários' }} />
      <Stack.Screen name="UsuarioForm" component={UsuarioFormScreen} options={{ title: 'Usuário' }} />
      <Stack.Screen name="Cargos" component={CargosScreen} options={{ title: 'Cargos & Permissões' }} />
      <Stack.Screen name="CargoForm" component={CargoFormScreen} options={{ title: 'Cargo' }} />
      <Stack.Screen name="Configuracoes" component={ConfiguracoesScreen} options={{ title: 'Configurações' }} />
      <Stack.Screen name="Fechamentos" component={FechamentosScreen} options={{ title: 'Fechamento de Folha' }} />
      <Stack.Screen name="NovoFechamento" component={NovoFechamentoScreen} options={{ title: 'Novo Fechamento' }} />
      <Stack.Screen name="Logs" component={LogsScreen} options={{ title: 'Logs de Auditoria' }} />
      <Stack.Screen name="Pagamentos" component={PagamentosScreen} options={{ title: 'Pagamentos' }} />
      <Stack.Screen name="Perfil" component={PerfilScreen} options={{ title: 'Perfil' }} />
    </Stack.Navigator>
  );
}
