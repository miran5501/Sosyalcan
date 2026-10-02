import { useCallback, useState, type ReactNode } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../api";
import { useAuth } from "../auth";
import { ErrorNotice } from "../components/ErrorNotice";
import {
  PRIORITY_LABELS,
  ROLE_LABELS,
  formatDate,
  formatKurusAsTL,
  formatTime,
  formatUntil,
} from "../format";
import { pickNextUp, type NextUp } from "../nextUp";
import { colors } from "../theme";
import type { Dashboard } from "../types";

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.badge}>{count}</Text>
      </View>
      {count === 0 ? <Text style={styles.empty}>{empty}</Text> : children}
    </View>
  );
}

function Row({
  title,
  subtitle,
  right,
  subtitleColor,
}: {
  title: string;
  subtitle?: string;
  right?: string;
  subtitleColor?: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{title}</Text>
        {!!subtitle && <Text style={[styles.rowSubtitle, subtitleColor ? { color: subtitleColor } : null]}>{subtitle}</Text>}
      </View>
      {!!right && <Text style={styles.rowRight}>{right}</Text>}
    </View>
  );
}

const names = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ") || undefined;

export function HomeScreen() {
  const { user, token, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [next, setNext] = useState<NextUp | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const from = new Date().toISOString();
      const [dashboard, upcoming] = await Promise.all([
        api.dashboard(token),
        // "Sıradaki" kartı ek bir özellik: yüklenemezse ana ekran yine de açılır, kart görünmez.
        Promise.all([api.shoots(token, from), api.appointments(token, from), api.options(token, "DELIVERY_STATUS")])
          .then(([shoots, appointments, statuses]) => pickNextUp(shoots, appointments, statuses[0]?.id))
          .catch(() => null),
      ]);
      setData(dashboard);
      setNext(upcoming);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veriler yüklenemedi");
    }
  }, [token]);

  // Sekmeye her dönüldüğünde yeniden yükle: web'de yapılan değişiklikler telefonda eski kalmasın.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hello}>Hoş geldin, {user?.name}</Text>
          <Text style={styles.role}>{ROLE_LABELS[user?.role ?? ""] ?? user?.role}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        {error && <ErrorNotice message={error} onRetry={refresh} />}
        {!data && !error && <ActivityIndicator style={{ marginTop: 40 }} color={colors.text} />}

        {data && (
          <>
            {next && (
              <View style={styles.next}>
                <Text style={styles.nextLabel}>Sıradaki</Text>
                <Text style={styles.nextTitle}>{next.title}</Text>
                {!!next.subtitle && <Text style={styles.nextSubtitle}>{next.subtitle}</Text>}
                <Text style={styles.nextWhen}>{formatUntil(next.at)}</Text>
              </View>
            )}

            <View style={styles.statRow}>
              <StatCard label="Aktif Müşteri" value={String(data.activeCustomers)} />
              {data.finance && (
                <StatCard
                  label="Net Kâr (bu ay)"
                  value={formatKurusAsTL(data.finance.summary.netKurus)}
                  color={data.finance.summary.netKurus < 0 ? colors.red : colors.text}
                />
              )}
            </View>
            {data.finance && (
              <View style={styles.statRow}>
                <StatCard label="Gelir" value={formatKurusAsTL(data.finance.summary.incomeKurus)} color={colors.green} />
                <StatCard label="Gider" value={formatKurusAsTL(data.finance.summary.expenseKurus)} color={colors.red} />
              </View>
            )}

            <Section title="Bugünkü Görevler" count={data.todayTasks.length} empty="Bugün teslimi olan görev yok">
              {data.todayTasks.map((t) => (
                <Row
                  key={t.id}
                  title={t.title}
                  subtitle={names(t.customer?.name, t.assignee?.name)}
                  right={PRIORITY_LABELS[t.priority]}
                />
              ))}
            </Section>

            <Section title="Bugünkü Çekimler" count={data.todayShoots.length} empty="Bugün planlı çekim yok">
              {data.todayShoots.map((s) => (
                <Row
                  key={s.id}
                  title={`${formatTime(s.scheduledAt)} · ${s.type.label}`}
                  subtitle={names(s.customer?.name, s.location, s.assignee?.name)}
                />
              ))}
            </Section>

            <Section title="Bugünkü Randevular" count={data.todayAppointments.length} empty="Bugün randevu yok">
              {data.todayAppointments.map((a) => (
                <Row key={a.id} title={`${formatTime(a.startsAt)} · ${a.title}`} subtitle={a.customer?.name} />
              ))}
            </Section>

            {data.finance && (
              <>
                <Section title="Geciken Ödemeler" count={data.finance.overduePayments.length} empty="Geciken ödeme yok">
                  {data.finance.overduePayments.map((p) => (
                    <Row
                      key={p.instanceId}
                      title={p.customerName}
                      subtitle={`${p.planTitle} · vade ${formatDate(p.dueDate)}`}
                      subtitleColor={colors.red}
                      right={formatKurusAsTL(p.amountKurus)}
                    />
                  ))}
                </Section>

                <Section
                  title="Yaklaşan Ödemeler (7 gün)"
                  count={data.finance.upcomingPayments.length}
                  empty="Önümüzdeki 7 günde vadesi gelen ödeme yok"
                >
                  {data.finance.upcomingPayments.map((p) => (
                    <Row
                      key={p.instanceId}
                      title={p.customerName}
                      subtitle={`${p.planTitle} · vade ${formatDate(p.dueDate)}`}
                      right={formatKurusAsTL(p.amountKurus)}
                    />
                  ))}
                </Section>
              </>
            )}
          </>
        )}

        <Pressable style={styles.logoutButton} onPress={() => void logout()}>
          <Text style={styles.logoutText}>Çıkış Yap</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  hello: { fontSize: 17, fontWeight: "600", color: colors.text },
  role: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  next: { backgroundColor: colors.primary, borderRadius: 12, padding: 16 },
  nextLabel: { fontSize: 12, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: 0.5 },
  nextTitle: { fontSize: 17, fontWeight: "600", color: colors.onPrimary, marginTop: 6 },
  nextSubtitle: { fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 },
  nextWhen: { fontSize: 15, fontWeight: "600", color: colors.onPrimary, marginTop: 10 },
  logoutButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.card,
  },
  logoutText: { fontSize: 14, color: colors.textMuted },
  content: { padding: 16, gap: 12 },
  statRow: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  statLabel: { fontSize: 12, color: colors.textMuted },
  statValue: { fontSize: 18, fontWeight: "600", color: colors.text, marginTop: 4 },
  section: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: colors.text },
  badge: {
    fontSize: 12,
    color: colors.textMuted,
    backgroundColor: colors.neutralBg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  empty: { fontSize: 13, color: colors.textFaint, paddingVertical: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, gap: 8 },
  rowMain: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "500", color: colors.text },
  rowSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  rowRight: { fontSize: 13, fontWeight: "500", color: colors.text },
});
