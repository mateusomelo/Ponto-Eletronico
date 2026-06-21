import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import EmpresasScreen from '../screens/EmpresasScreen';
import EmpresaFormScreen from '../screens/EmpresaFormScreen';
import EmpresaUsuariosScreen from '../screens/EmpresaUsuariosScreen';
import AssinaturaScreen from '../screens/AssinaturaScreen';
import SuperAdminsScreen from '../screens/SuperAdminsScreen';

const Stack = createNativeStackNavigator();

export default function SuperAdminStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Empresas" component={EmpresasScreen} options={{ title: 'Plataforma' }} />
      <Stack.Screen name="EmpresaForm" component={EmpresaFormScreen} options={{ title: 'Empresa' }} />
      <Stack.Screen name="EmpresaUsuarios" component={EmpresaUsuariosScreen} options={{ title: 'Usuários' }} />
      <Stack.Screen name="Assinatura" component={AssinaturaScreen} options={{ title: 'Assinatura' }} />
      <Stack.Screen name="SuperAdmins" component={SuperAdminsScreen} options={{ title: 'Super Admins da Plataforma' }} />
    </Stack.Navigator>
  );
}
