import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Alert, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../auth";
import { DetailSheet, Field, LinkField, ListField, StatusButtons } from "../components/DetailSheet";
import { ShootChecklist } from "../components/ShootChecklist";
import type { ChecklistItem } from "../types";
import { ErrorNotice } from "../components/ErrorNotice";
import { ScreenHeader } from "../components/ScreenHeader";
import { childLabels, dayKey, formatDay, formatTime } from "../format";
import { colors, optionColor } from "../theme";
import type { Appointment, Option, Shoot } from "../types";

type Item =
  | { kind: "shoot"; id: string; at: string; data: Shoot }
  | { kind: "appointment"; id: string; at: string; data: Appointment };

type Selection = { kind: "shoot" | "appointment"; id: string } | null;

/** Ekipman notu (listede olmayanlar) serbest metin: her satır bir madde, boş satırlar atlanır. */
const equipmentItems = (equipment: string | null) =>
  (equipment ?? "").split("\n").map((line) => line.trim()).filter(Boolean);

/** "Instagram · Reels" gibi okunur paylaşım yerleri (madde listesi olarak gösterilir). */
const targetNames = (s: Shoot) => (s.publishTargets ?? []).map((t) => (t.parent ? `${t.parent.label} · ${t.label}` : t.label));

const participantNames = (a: Appointment) =>
  (a.participants ?? []).map((p) => p.name).filter(Boolean).join(", ") || null;

const appointmentMeta = (a: Appointment) =>
  [a.customer?.name, a.participants?.length ? `${a.participants.length} katılımcı` : null].filter(Boolean).join(" · ");

/** Admin'in tanımladığı teslim durumları; çekimin mevcut durumu kaldırılmışsa listede korunur. */
const statusOptions = (statuses: Option[], shoot: Shoot) => {
  const list = statuses.map((o) => ({ value: o.id, label: o.label }));
  return list.some((o) => o.value === shoot.deliveryStatusId)
    ? list
    : [{ value: shoot.deliveryStatusId, label: shoot.deliveryStatus.label }, ...list];
};

/** Bugünün başlangıcı (yerel saat): bugünkü ve sonraki kayıtlar listelenir. */
const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export function ScheduleScreen() {
  const { user, token } = useAuth();
  const insets = useSafeAreaInsets();
  const canManage = user?.role === "ADMIN" || user?.role === "OPERATIONS";
  const [shoots, setShoots] = useState<Shoot[] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [statuses, setStatuses] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const from = startOfToday();
      const [s, a, st] = await Promise.all([
        api.shoots(token, from),
        api.appointments(token, from),
        api.options(token, "DELIVERY_STATUS"),
      ]);
      setShoots(s);
      setAppointments(a);
      setStatuses(st);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Program yüklenemedi");
    }
  }, [token]);

  // Sekmeye her dönüldüğünde yeniden yükle: web'de yapılan değişiklikler telefonda eski kalmasın.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sections = useMemo(() => {
    const items: Item[] = [
      ...(shoots ?? []).map((s): Item => ({ kind: "shoot", id: s.id, at: s.scheduledAt, data: s })),
      ...(appointments ?? []).map((a): Item => ({ kind: "appointment", id: a.id, at: a.startsAt, data: a })),
    ].sort((x, y) => x.at.localeCompare(y.at));

    const byDay = new Map<string, { title: string; data: Item[] }>();
    for (const item of items) {
      const key = dayKey(item.at);
      const group = byDay.get(key) ?? { title: formatDay(item.at), data: [] };
      group.data.push(item);
      byDay.set(key, group);
    }
    return [...byDay.values()];
  }, [shoots, appointments]);

  const selectedShoot = selection?.kind === "shoot" ? shoots?.find((s) => s.id === selection.id) ?? null : null;
  const selectedAppointment =
    selection?.kind === "appointment" ? appointments?.find((a) => a.id === selection.id) ?? null : null;

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function changeDelivery(shoot: Shoot, next: string) {
    if (!token) return;
    setSaving(true);
    try {
      const updated = await api.updateDeliveryStatus(token, shoot.id, next);
      setShoots(
        (prev) =>
          prev?.map((s) =>
            s.id === shoot.id ? { ...s, deliveryStatus: updated.deliveryStatus, deliveryStatusId: updated.deliveryStatusId } : s,
          ) ?? prev,
      );
    } catch (e) {
      Alert.alert("Durum değiştirilemedi", e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  const [checkingId, setCheckingId] = useState<string | null>(null);

  async function toggleChecklist(shoot: Shoot, item: ChecklistItem) {
    if (!token) return;
    setCheckingId(item.id);
    try {
      const updated = await api.toggleChecklistItem(token, shoot.id, item.id, !item.done);
      const doneBy = updated.done ? { id: user?.id ?? "", name: user?.name ?? "" } : null;
      setShoots(
        (prev) =>
          prev?.map((s) =>
            s.id === shoot.id
              ? { ...s, checklist: s.checklist.map((c) => (c.id === item.id ? { ...c, done: updated.done, doneAt: updated.doneAt, doneBy } : c)) }
              : s,
          ) ?? prev,
      );
    } catch (e) {
      Alert.alert("İşaretlenemedi", e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu");
    } finally {
      setCheckingId(null);
    }
  }

  const loading = !shoots && !appointments && !error;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScreenHeader title="Program" subtitle="Bugünden itibaren çekimler ve randevular" />

      {error && <ErrorNotice message={error} onRetry={refresh} />}
      {loading && <ActivityIndicator style={{ marginTop: 40 }} color={colors.text} />}

      {(shoots || appointments) && (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={<Text style={styles.empty}>Planlı çekim veya randevu yok</Text>}
          renderSectionHeader={({ section }) => <Text style={styles.day}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => setSelection({ kind: item.kind, id: item.id })}>
              {item.kind === "shoot" ? (
                <>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>
                      {formatTime(item.at)} · Çekim · {item.data.type.label}
                    </Text>
                    <Text style={[styles.chip, optionColor(item.data.deliveryStatus.color)]}>{item.data.deliveryStatus.label}</Text>
                  </View>
                  <Text style={styles.cardMeta}>
                    {[item.data.customer?.name, item.data.location, item.data.assignee?.name].filter(Boolean).join(" · ")}
                  </Text>
                  {item.data.checklist.length > 0 && (
                    <Text style={styles.cardMeta}>
                      ✓ {item.data.checklist.filter((c) => c.done).length}/{item.data.checklist.length}
                      {item.data.revisionCount > 0 ? ` · ${item.data.revisionCount} revizyon` : ""}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.cardTitle}>
                    {formatTime(item.at)} · {item.data.title}
                  </Text>
                  {!!appointmentMeta(item.data) && <Text style={styles.cardMeta}>{appointmentMeta(item.data)}</Text>}
                </>
              )}
            </Pressable>
          )}
        />
      )}

      <DetailSheet
        visible={!!selectedShoot}
        title={selectedShoot ? `Çekim · ${selectedShoot.type.label}` : ""}
        onClose={() => setSelection(null)}
      >
        {selectedShoot && (
          <>
            <Field label="Tarih" value={`${formatDay(selectedShoot.scheduledAt)}, ${formatTime(selectedShoot.scheduledAt)}`} />
            <Field label="Müşteri" value={selectedShoot.customer?.name} />
            <Field label="Konum" value={selectedShoot.location} />
            <Field label="Çekimi yapacak" value={selectedShoot.assignee?.name} />
            <Field label="Brief" value={selectedShoot.brief} />
            <ListField label="Nerede paylaşılacak" items={targetNames(selectedShoot)} />
            <ListField label="Ekipman" items={childLabels(selectedShoot.equipmentItems)} />
            <ListField label="Ekipman notu" items={equipmentItems(selectedShoot.equipment)} />
            <LinkField label="Teslim linki" url={selectedShoot.deliveryLink} />
            <View>
              <Text style={styles.statusHeading}>{canManage ? "Teslim durumunu değiştir" : "Teslim durumu"}</Text>
              <StatusButtons
                options={statusOptions(statuses, selectedShoot)}
                current={selectedShoot.deliveryStatusId}
                disabled={!canManage || saving}
                onSelect={(next) => void changeDelivery(selectedShoot, next)}
              />
            </View>
            <ShootChecklist
              items={selectedShoot.checklist}
              revisionCount={selectedShoot.revisionCount}
              canEdit={canManage}
              busyId={checkingId}
              onToggle={(item) => void toggleChecklist(selectedShoot, item)}
            />
          </>
        )}
      </DetailSheet>

      <DetailSheet visible={!!selectedAppointment} title={selectedAppointment?.title ?? ""} onClose={() => setSelection(null)}>
        {selectedAppointment && (
          <>
            <Field
              label="Tarih"
              value={`${formatDay(selectedAppointment.startsAt)}, ${formatTime(selectedAppointment.startsAt)}`}
            />
            <Field label="Müşteri" value={selectedAppointment.customer?.name} />
            <Field label="Katılımcılar" value={participantNames(selectedAppointment)} />
          </>
        )}
      </DetailSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: "center", color: colors.textFaint, fontSize: 13, marginTop: 32 },
  day: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginTop: 8, marginBottom: 2 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.text },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  chip: {
    fontSize: 11,
    color: colors.textMuted,
    backgroundColor: colors.neutralBg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  statusHeading: { fontSize: 12, color: colors.textMuted, marginBottom: 6 },
});
