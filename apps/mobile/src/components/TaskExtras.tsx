import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api } from "../api";
import { dayKey, formatDate, formatTime } from "../format";
import { colors } from "../theme";
import type { TaskComment, TaskLink } from "../types";
import { LinkField } from "./DetailSheet";

const MAX_COMMENT_LENGTH = 2000;

/**
 * Görev detayının alt kısmı: bağlantılar ve yorumlar (web'deki görev düzenleme sayfasıyla aynı veriler).
 * Detay her açıldığında sunucudan taze çekilir; yorum yalnızca Admin/Operasyon ekleyebilir (sunucu da denetler).
 */
export function TaskExtras({ token, taskId, canComment }: { token: string; taskId: string; canComment: boolean }) {
  const [links, setLinks] = useState<TaskLink[] | null>(null);
  const [comments, setComments] = useState<TaskComment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLinks(null);
    setComments(null);
    setError(null);
    setDraft("");
    Promise.all([api.taskLinks(token, taskId), api.taskComments(token, taskId)])
      .then(([l, c]) => {
        if (cancelled) return;
        setLinks(l);
        setComments(c);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Yorumlar yüklenemedi");
      });
    return () => {
      cancelled = true;
    };
  }, [token, taskId]);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    try {
      const created = await api.addTaskComment(token, taskId, body);
      setComments((prev) => [...(prev ?? []), created]);
      setDraft("");
    } catch (e) {
      Alert.alert("Yorum eklenemedi", e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu");
    } finally {
      setSending(false);
    }
  }

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!links || !comments) return <ActivityIndicator color={colors.text} />;

  return (
    <View style={styles.wrap}>
      {links.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>Bağlantılar</Text>
          {links.map((link) => (
            <LinkField key={link.id} label={link.label ? link.label : "Bağlantı"} url={link.url} />
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.heading}>Yorumlar ({comments.length})</Text>
        {comments.length === 0 && <Text style={styles.empty}>Henüz yorum yok</Text>}
        {comments.map((c) => (
          <View key={c.id} style={styles.comment}>
            <Text style={styles.commentMeta}>
              {c.author.name ?? "Silinmiş kullanıcı"} · {formatDate(dayKey(c.createdAt))}, {formatTime(c.createdAt)}
            </Text>
            <Text style={styles.commentBody}>{c.body}</Text>
          </View>
        ))}

        {canComment && (
          <View style={styles.form}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Yorum yaz…"
              placeholderTextColor={colors.textFaint}
              multiline
              maxLength={MAX_COMMENT_LENGTH}
              editable={!sending}
            />
            <Pressable
              style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}
              disabled={!draft.trim() || sending}
              onPress={() => void send()}
            >
              <Text style={styles.sendText}>{sending ? "…" : "Gönder"}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  section: { gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  heading: { fontSize: 13, fontWeight: "600", color: colors.text },
  empty: { fontSize: 13, color: colors.textFaint },
  error: { fontSize: 13, color: colors.red },
  comment: { backgroundColor: colors.neutralBg, borderRadius: 10, padding: 10 },
  commentMeta: { fontSize: 11, color: colors.textMuted },
  commentBody: { fontSize: 14, color: colors.text, marginTop: 4 },
  // Gönder düğmesi yazı kutusunun yanında: klavye açıkken de görünür kalır.
  form: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: "top",
  },
  send: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  sendDisabled: { opacity: 0.4 },
  sendText: { color: colors.onPrimary, fontSize: 14, fontWeight: "500" },
});
