import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ChecklistItem } from "../types";
import { colors } from "../theme";

/**
 * Çekim detayındaki teslim kontrol listesi. Admin/Operasyon maddeye dokunarak işaretler;
 * diğer roller salt okunur görür. Madde ekleme/kaldırma web'dedir (sahada yalnızca işaretleme).
 */
export function ShootChecklist({
  items,
  revisionCount,
  canEdit,
  busyId,
  onToggle,
}: {
  items: ChecklistItem[];
  revisionCount: number;
  canEdit: boolean;
  busyId: string | null;
  onToggle: (item: ChecklistItem) => void;
}) {
  const done = items.filter((i) => i.done).length;
  return (
    <View>
      <View style={styles.header}>
        <Text style={styles.heading}>Teslim kontrol listesi</Text>
        <Text style={styles.count}>
          {done}/{items.length}
          {revisionCount > 0 ? ` · ${revisionCount} revizyon` : ""}
        </Text>
      </View>
      {items.length === 0 && <Text style={styles.empty}>Kontrol listesi boş</Text>}
      {items.map((item) => (
        <Pressable
          key={item.id}
          style={({ pressed }) => [styles.row, pressed && canEdit && styles.pressed]}
          disabled={!canEdit || busyId !== null}
          onPress={() => onToggle(item)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.done, disabled: !canEdit }}
        >
          <View style={[styles.box, item.done && styles.boxDone, busyId === item.id && styles.busy]}>
            {item.done && <Text style={styles.tick}>✓</Text>}
          </View>
          <View style={styles.texts}>
            <Text style={[styles.label, item.done && styles.labelDone]}>{item.label}</Text>
            {item.done && item.doneBy && <Text style={styles.by}>{item.doneBy.name}</Text>}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  heading: { fontSize: 12, color: colors.textMuted },
  count: { fontSize: 12, color: colors.textMuted },
  empty: { fontSize: 13, color: colors.textFaint },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  pressed: { opacity: 0.6 },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  boxDone: { backgroundColor: colors.green, borderColor: colors.green },
  busy: { opacity: 0.4 },
  tick: { color: colors.onPrimary, fontSize: 13, fontWeight: "700" },
  texts: { flex: 1 },
  label: { fontSize: 14, color: colors.text },
  labelDone: { color: colors.textMuted, textDecorationLine: "line-through" },
  by: { fontSize: 11, color: colors.textFaint, marginTop: 1 },
});
