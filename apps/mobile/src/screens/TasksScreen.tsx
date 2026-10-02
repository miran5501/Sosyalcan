import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../auth";
import { DetailSheet, Field, ListField, StatusButtons } from "../components/DetailSheet";
import { ErrorNotice } from "../components/ErrorNotice";
import { ScreenHeader } from "../components/ScreenHeader";
import { TaskExtras } from "../components/TaskExtras";
import { PRIORITY_LABELS, childLabels, formatDate } from "../format";
import { colors } from "../theme";
import type { Option, Priority, Task } from "../types";

const PRIORITY_COLORS: Record<Priority, { fg: string; bg: string }> = {
  HIGH: { fg: colors.red, bg: colors.redBg },
  MEDIUM: { fg: colors.amber, bg: colors.amberBg },
  LOW: { fg: colors.textMuted, bg: colors.neutralBg },
};

/** Görev teslim tarihi sunucuda gece yarısı (UTC) saklanır; saat dilimi kaymasın diye yalnızca gün kısmı alınır. */
const dueLabel = (dueDate: string) => formatDate(dueDate.slice(0, 10));

export function TasksScreen() {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const canManage = user?.role === "ADMIN" || user?.role === "OPERATIONS";
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Sekmeler = admin'in tanımladığı görev durumları (web'deki Kanban sütunlarıyla aynı).
  const [statuses, setStatuses] = useState<Option[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, st] = await Promise.all([api.tasks(token), api.options(token, "TASK_STATUS")]);
      setTasks(list);
      setStatuses(st);
      // Seçili sekme kaldırıldıysa ilk sekmeye dön.
      setStatus((prev) => (prev && st.some((s) => s.id === prev) ? prev : (st[0]?.id ?? null)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Görevler yüklenemedi");
    }
  }, [token]);

  // Sekmeye her dönüldüğünde yeniden yükle: web'de yapılan değişiklikler telefonda eski kalmasın.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(
    () => (onlyMine ? tasks?.filter((t) => t.assignee?.id === user?.id) : tasks) ?? null,
    [tasks, onlyMine, user?.id],
  );

  // Kaldırılmış bir duruma bağlı görev kaybolmasın: o durum sekme olarak sona eklenir.
  const tabs = useMemo(() => {
    const list = statuses.map((s) => ({ id: s.id, label: s.label }));
    tasks?.forEach((t) => {
      if (!list.some((s) => s.id === t.statusId)) list.push({ id: t.statusId, label: t.status.label });
    });
    return list;
  }, [statuses, tasks]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    shown?.forEach((t) => (result[t.statusId] = (result[t.statusId] ?? 0) + 1));
    return result;
  }, [shown]);

  const visible = useMemo(() => shown?.filter((t) => t.statusId === status) ?? [], [shown, status]);
  const statusOptions = useMemo(() => tabs.map((t) => ({ value: t.id, label: t.label })), [tabs]);
  const selected = tasks?.find((t) => t.id === selectedId) ?? null;

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function changeStatus(task: Task, next: string) {
    if (!token) return;
    setSaving(true);
    try {
      const updated = await api.updateTaskStatus(token, task.id, next);
      setTasks((prev) => prev?.map((t) => (t.id === task.id ? { ...t, status: updated.status, statusId: updated.statusId } : t)) ?? prev);
      setSelectedId(null);
      setStatus(next);
    } catch (e) {
      Alert.alert("Durum değiştirilemedi", e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Görevler" subtitle={canManage ? "Bir göreve dokunup durumunu değiştirebilirsin" : "Salt okunur"} />

      {/* Sütun sayısı admin'e bağlı: dörde kadar ekrana sığar, fazlası yatay kaydırılır. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsBar} contentContainerStyle={styles.tabs}>
        {tabs.map((s) => (
          <Pressable
            key={s.id}
            style={[styles.tab, tabs.length > 4 && styles.tabFixed, s.id === status && styles.tabActive]}
            onPress={() => setStatus(s.id)}
          >
            <Text style={[styles.tabText, s.id === status && styles.tabTextActive]} numberOfLines={1}>
              {s.label}
            </Text>
            <Text style={[styles.tabCount, s.id === status && styles.tabTextActive]}>{counts[s.id] ?? 0}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.mineRow}>
        <Text style={styles.mineLabel}>Sadece bana atananlar</Text>
        <Switch value={onlyMine} onValueChange={setOnlyMine} trackColor={{ true: colors.primary }} thumbColor={colors.onPrimary} />
      </View>

      {error && <ErrorNotice message={error} onRetry={refresh} />}
      {!tasks && !error && <ActivityIndicator style={{ marginTop: 40 }} color={colors.text} />}

      {tasks && (
        <FlatList
          data={visible}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={<Text style={styles.empty}>Bu durumda görev yok</Text>}
          renderItem={({ item }) => {
            const p = PRIORITY_COLORS[item.priority];
            const meta = [item.assignee?.name, item.dueDate ? `teslim ${dueLabel(item.dueDate)}` : null].filter(Boolean).join(" · ");
            return (
              <Pressable style={styles.card} onPress={() => setSelectedId(item.id)}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={[styles.priority, { color: p.fg, backgroundColor: p.bg }]}>{PRIORITY_LABELS[item.priority]}</Text>
                </View>
                {!!item.customer && <Text style={styles.cardMeta}>{item.customer.name}</Text>}
                {!!meta && <Text style={styles.cardMeta}>{meta}</Text>}
              </Pressable>
            );
          }}
        />
      )}

      <DetailSheet visible={!!selected} title={selected?.title ?? ""} onClose={() => setSelectedId(null)}>
        {selected && (
          <>
            <Field label="Müşteri" value={selected.customer?.name} />
            <Field label="Atanan" value={selected.assignee?.name} />
            <Field label="Öncelik" value={PRIORITY_LABELS[selected.priority]} />
            <Field label="Teslim tarihi" value={selected.dueDate ? dueLabel(selected.dueDate) : null} />
            <Field label="Açıklama" value={selected.description} />
            <ListField label="Nerede paylaşılacak" items={childLabels(selected.publishTargets)} />
            <View>
              <Text style={styles.statusHeading}>{canManage ? "Durumu değiştir" : "Durum"}</Text>
              <StatusButtons
                options={statusOptions}
                current={selected.statusId}
                disabled={!canManage || saving}
                onSelect={(next) => void changeStatus(selected, next)}
              />
            </View>
            {token && <TaskExtras token={token} taskId={selected.id} canComment={canManage} />}
          </>
        )}
      </DetailSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabsBar: { flexGrow: 0, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabs: { flexGrow: 1, flexDirection: "row", gap: 6, padding: 12 },
  tab: { flex: 1, minWidth: 72, alignItems: "center", paddingVertical: 8, paddingHorizontal: 6, borderRadius: 8, backgroundColor: colors.neutralBg },
  tabFixed: { flex: 0, minWidth: 88 },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, color: colors.textMuted },
  tabCount: { fontSize: 15, fontWeight: "600", color: colors.text, marginTop: 2 },
  tabTextActive: { color: colors.onPrimary },
  mineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mineLabel: { fontSize: 13, color: colors.textMuted },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: "center", color: colors.textFaint, fontSize: 13, marginTop: 32 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.text },
  priority: { fontSize: 11, fontWeight: "500", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  statusHeading: { fontSize: 12, color: colors.textMuted, marginBottom: 6 },
});
