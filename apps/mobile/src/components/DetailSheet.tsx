import type { ReactNode } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";

/** Alttan açılan detay penceresi; dışına dokununca veya "Kapat" ile kapanır. */
export function DetailSheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Yorum yazarken klavye pencerenin altını kapatmasın diye pencere yukarı itilir. */}
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={styles.body} contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Kapat</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

/** Yalnızca http(s) adresleri açılır; başka şemalar (javascript:, intent: vb.) düz metin kalır. */
const isWebUrl = (url: string) => /^https?:\/\/\S+$/i.test(url.trim());

export function LinkField({ label, url, text }: { label: string; url?: string | null; text?: string | null }) {
  if (!url) return null;
  const openable = isWebUrl(url);
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text
        style={[styles.fieldValue, openable && styles.link]}
        onPress={openable ? () => void Linking.openURL(url.trim()).catch(() => Alert.alert("Bağlantı açılamadı", url)) : undefined}
      >
        {text || url}
      </Text>
    </View>
  );
}

/** Çok satırlı metni madde listesi olarak gösterir (ör. ekipman: her satır bir öğe). */
export function ListField({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      {items.map((item, i) => (
        <Text key={`${i}-${item}`} style={styles.fieldValue}>
          • {item}
        </Text>
      ))}
    </View>
  );
}

export function StatusButtons<T extends string>({
  options,
  current,
  onSelect,
  disabled,
}: {
  options: { value: T; label: string }[];
  current: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.statusWrap}>
      {options.map((o) => {
        const active = o.value === current;
        return (
          <Pressable
            key={o.value}
            disabled={disabled || active}
            onPress={() => onSelect(o.value)}
            style={[styles.statusButton, active && styles.statusActive, disabled && !active && { opacity: 0.5 }]}
          >
            <Text style={[styles.statusText, active && { color: colors.onPrimary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.backdrop },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: "75%",
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.text, marginBottom: 12 },
  body: { flexGrow: 0 },
  fieldLabel: { fontSize: 12, color: colors.textMuted },
  fieldValue: { fontSize: 14, color: colors.text, marginTop: 2 },
  link: { color: colors.link, textDecorationLine: "underline" },
  statusWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  statusActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusText: { fontSize: 14, color: colors.text },
  close: { marginTop: 16, paddingVertical: 12, alignItems: "center", borderRadius: 10, backgroundColor: colors.neutralBg },
  closeText: { fontSize: 14, color: colors.textMuted },
});
