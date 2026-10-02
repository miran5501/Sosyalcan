import { useCallback, useState } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../auth";
import { ErrorNotice } from "../components/ErrorNotice";
import { ScreenHeader } from "../components/ScreenHeader";
import { useUnread } from "../notifications";
import { colors } from "../theme";
import type { AppNotification } from "../types";

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

/** Web'deki bağlantıyı ilgili sekmeye çevirir (görev → Görevler, çekim/randevu → Program). */
function tabFor(link: string | null): "Tasks" | "Schedule" | null {
  if (!link) return null;
  if (link.startsWith("/tasks")) return "Tasks";
  if (link.startsWith("/shoots") || link.startsWith("/calendar")) return "Schedule";
  return null;
}

export function NotificationsScreen() {
  const { token } = useAuth();
  const { unread, setUnread, refreshUnread } = useUnread();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<{ navigate: (tab: string) => void }>();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const result = await api.notifications(token);
      setItems(result.items);
      setUnread(result.unreadCount);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bildirimler yüklenemedi");
    }
  }, [token, setUnread]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function open(n: AppNotification) {
    if (!token) return;
    if (!n.readAt) {
      setItems((prev) => prev?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? prev);
      try {
        setUnread((await api.markNotificationsRead(token, { ids: [n.id] })).unreadCount);
      } catch {
        // okundu işareti sonraki yenilemede düzelir
      }
    }
    const tab = tabFor(n.link);
    if (tab) navigation.navigate(tab);
  }

  /** Çarpı: bildirimi listeden kaldırır; hata olursa liste yeniden yüklenir. */
  async function dismiss(n: AppNotification) {
    if (!token) return;
    setItems((prev) => prev?.filter((x) => x.id !== n.id) ?? prev);
    try {
      await api.dismissNotification(token, n.id);
      await refreshUnread();
    } catch {
      void load();
    }
  }

  async function markAll() {
    if (!token) return;
    setItems((prev) => prev?.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })) ?? prev);
    try {
      setUnread((await api.markNotificationsRead(token, { all: true })).unreadCount);
    } catch {
      void load();
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Bildirimler" subtitle={unread > 0 ? `${unread} okunmamış` : "Hepsi okundu"} />
      {error && <ErrorNotice message={error} onRetry={load} />}
      {!items && !error && <ActivityIndicator style={{ marginTop: 40 }} color={colors.text} />}
      {items && (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
            />
          }
          ListHeaderComponent={
            unread > 0 ? (
              <Pressable onPress={() => void markAll()} style={styles.markAll}>
                <Text style={styles.markAllText}>Tümünü okundu say</Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>Henüz bildirimin yok</Text>}
          renderItem={({ item }) => (
            <View>
              <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={() => void open(item)}>
                <View style={[styles.dot, !item.readAt && styles.dotUnread]} />
                <View style={styles.texts}>
                  <Text style={[styles.title, !item.readAt && styles.titleUnread]}>{item.title}</Text>
                  {!!item.body && <Text style={styles.body}>{item.body}</Text>}
                  <Text style={styles.when}>{formatWhen(item.createdAt)}</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => void dismiss(item)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Bildirimi kaldır: ${item.title}`}
                style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]}
              >
                <Text style={styles.dismissText}>✕</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: "center", color: colors.textFaint, fontSize: 13, marginTop: 32 },
  markAll: { alignSelf: "flex-end", paddingVertical: 4, paddingHorizontal: 2, marginBottom: 2 },
  markAllText: { color: colors.primary, fontSize: 13, fontWeight: "500" },
  card: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  pressed: { opacity: 0.7 },
  dismiss: { position: "absolute", top: 6, right: 8, padding: 2 },
  dismissText: { fontSize: 11, color: colors.textFaint },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  dotUnread: { backgroundColor: colors.primary },
  texts: { flex: 1, paddingRight: 14 },
  title: { fontSize: 14, color: colors.textMuted },
  titleUnread: { color: colors.text, fontWeight: "600" },
  body: { fontSize: 13, color: colors.textMuted, marginTop: 3 },
  when: { fontSize: 11, color: colors.textFaint, marginTop: 5 },
});
