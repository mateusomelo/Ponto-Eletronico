import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

export default function MaisMenuScreen({ navigation }: any) {
  const { usuario, hasPermission, isAdmin, logout } = useAuth();

  const grupos = [
    {
      label: 'Registros',
      itens: [
        { label: 'Relatórios', icone: 'file-alt', show: hasPermission('relatorios.visualizar'), tela: 'Relatorios' },
      ],
    },
    {
      label: 'Administração',
      itens: [
        { label: 'Usuários', icone: 'users', show: hasPermission('usuarios.visualizar'), tela: 'Usuarios' },
        { label: 'Cargos & Permissões', icone: 'id-badge', show: true, tela: 'Cargos' },
      ],
    },
    {
      label: 'Folha de Pagamento',
      itens: [
        { label: 'Fechamento de Folha', icone: 'file-invoice-dollar', show: hasPermission('fechamento.visualizar'), tela: 'Fechamentos' },
      ],
    },
    {
      label: 'Sistema',
      itens: [
        { label: 'Pagamentos', icone: 'credit-card', show: hasPermission('pagamentos.visualizar'), tela: 'Pagamentos' },
        { label: 'Logs de Auditoria', icone: 'shield-alt', show: isAdmin(), tela: 'Logs' },
        { label: 'Configurações', icone: 'cog', show: hasPermission('sistema.configurar'), tela: 'Configuracoes' },
      ],
    },
    {
      label: 'Conta',
      itens: [
        { label: 'Perfil', icone: 'user-circle', show: true, tela: 'Perfil' },
      ],
    },
  ]
    .map((g) => ({ ...g, itens: g.itens.filter((i) => i.show) }))
    .filter((g) => g.itens.length);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{usuario?.nome}</Text>
      <Text style={styles.subtitle}>{usuario?.email}</Text>

      {grupos.map((grupo) => (
        <View key={grupo.label}>
          <Text style={styles.groupLabel}>{grupo.label}</Text>
          {grupo.itens.map((item) => (
            <TouchableOpacity key={item.tela} style={styles.item} onPress={() => navigation.navigate(item.tela)}>
              <FontAwesome5 name={item.icone} size={16} color="#3b82f6" style={styles.itemIcone} />
              <Text style={styles.itemText}>{item.label}</Text>
              <FontAwesome5 name="chevron-right" size={14} color="#94a3b8" />
            </TouchableOpacity>
          ))}
        </View>
      ))}

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <FontAwesome5 name="sign-out-alt" size={14} color="#ef4444" style={{ marginRight: 8 }} />
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 12 },
  groupLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginTop: 16, marginBottom: 8, marginLeft: 4 },
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 8,
  },
  itemIcone: { width: 22 },
  itemText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1e293b' },
  logoutBtn: { marginTop: 20, alignItems: 'center', paddingVertical: 14, flexDirection: 'row', justifyContent: 'center' },
  logoutText: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
});
