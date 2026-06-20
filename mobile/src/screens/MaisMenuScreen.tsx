import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function MaisMenuScreen({ navigation }: any) {
  const { usuario, hasPermission, isAdmin, logout } = useAuth();

  const itens = [
    { label: 'Relatórios',     show: hasPermission('relatorios.visualizar'), tela: 'Relatorios' },
    { label: 'Fechamentos',    show: hasPermission('fechamento.visualizar'), tela: 'Fechamentos' },
    { label: 'Usuários',       show: hasPermission('usuarios.visualizar'),   tela: 'Usuarios' },
    { label: 'Cargos',         show: true,                                  tela: 'Cargos' },
    { label: 'Configurações',  show: hasPermission('sistema.configurar'),   tela: 'Configuracoes' },
    { label: 'Logs de acesso', show: isAdmin(),                             tela: 'Logs' },
    { label: 'Pagamentos',     show: hasPermission('pagamentos.visualizar'), tela: 'Pagamentos' },
    { label: 'Perfil',         show: true,                                  tela: 'Perfil' },
  ].filter((i) => i.show);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{usuario?.nome}</Text>
      <Text style={styles.subtitle}>{usuario?.email}</Text>

      {itens.map((item) => (
        <TouchableOpacity key={item.tela} style={styles.item} onPress={() => navigation.navigate(item.tela)}>
          <Text style={styles.itemText}>{item.label}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 20 },
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 8,
  },
  itemText: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  chevron: { fontSize: 18, color: '#94a3b8' },
  logoutBtn: { marginTop: 20, alignItems: 'center', paddingVertical: 14 },
  logoutText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
});
