import AsyncStorage from '@react-native-async-storage/async-storage';
import { PontoAPI } from './ponto';

const QUEUE_KEY = 'ponto_fila_offline';

export interface ItemFila {
  localId: string;
  tipo: 'entrada' | 'saida';
  latitude: number;
  longitude: number;
  precisao?: number;
  fotoUri?: string | null;
  criadoEm: string;
}

export async function getFila(): Promise<ItemFila[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

async function salvarFila(fila: ItemFila[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(fila));
}

export async function enfileirar(item: Omit<ItemFila, 'localId' | 'criadoEm'>): Promise<void> {
  const fila = await getFila();
  fila.push({ ...item, localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`, criadoEm: new Date().toISOString() });
  await salvarFila(fila);
}

/**
 * Tenta sincronizar a fila offline, em ordem. Para no primeiro erro de rede
 * (preserva ordem cronológica); erros de regra de negócio (ex: duplicado)
 * removem o item da fila, pois não serão resolvidos tentando de novo.
 */
export async function sincronizarFila(): Promise<{ enviados: number; restantes: number }> {
  let fila = await getFila();
  let enviados = 0;

  while (fila.length > 0) {
    const item = fila[0];
    try {
      await PontoAPI.registrar({
        tipo: item.tipo, latitude: item.latitude, longitude: item.longitude,
        precisao: item.precisao, fotoUri: item.fotoUri,
      });
      fila = fila.slice(1);
      enviados++;
      await salvarFila(fila);
    } catch (err: any) {
      // Erro do servidor (4xx) — não tem como resolver tentando de novo, descarta.
      if (err?.status && err.status >= 400 && err.status < 500) {
        fila = fila.slice(1);
        await salvarFila(fila);
        continue;
      }
      // Erro de rede/servidor indisponível — para aqui, tenta de novo depois.
      break;
    }
  }

  return { enviados, restantes: fila.length };
}
