import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { useAuth } from "@/lib/auth";
import { askAi, ApiError } from "@/lib/api";
import { colors } from "@/lib/theme";

interface Msg {
  id: string;
  role: "user" | "ai" | "error";
  text: string;
}

/** Ağaç hakkında yapay zekâya soru-cevap (Gemini). Yalnız düzenleyiciler. */
export default function AiScreen() {
  const { token, user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList>(null);

  const send = async () => {
    const q = input.trim();
    if (!q || !token || busy) return;
    setInput("");
    const userMsg: Msg = { id: `u${Date.now()}`, role: "user", text: q };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const { answer } = await askAi(token, q);
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: "ai", text: answer }]);
    } catch (e) {
      const msg =
        e instanceof ApiError && e.status === 503
          ? "Yapay zekâ bu ağaçta yapılandırılmamış."
          : e instanceof ApiError && e.status === 403
            ? "AI yalnız düzenleyicilere açık."
            : e instanceof Error
              ? e.message
              : "AI hatası.";
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: "error", text: msg }]);
    } finally {
      setBusy(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const viewer = user?.role === "viewer";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={["left", "right", "bottom"]}>
      <Stack.Screen options={{ headerShown: true, title: "Yapay zekâ" }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 }}>
              <Text style={{ fontSize: 34 }}>🤖</Text>
              <Text style={{ color: colors.textMuted, textAlign: "center", marginTop: 12, paddingHorizontal: 24 }}>
                Ağacın hakkında soru sor: “En yaşlı kişi kim?”, “Kaç kuşak var?”, “Ankara doğumlular kimler?”
              </Text>
            </View>
          }
          renderItem={({ item }) => <Bubble msg={item} />}
        />
        {viewer ? (
          <Text style={{ color: colors.danger, textAlign: "center", padding: 12 }}>
            AI yalnız düzenleyicilere açık.
          </Text>
        ) : (
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              padding: 12,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.surface,
              alignItems: "flex-end",
            }}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Sorunu yaz…"
              placeholderTextColor={colors.textSubtle}
              multiline
              style={{
                flex: 1,
                maxHeight: 120,
                minHeight: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.bg,
                paddingHorizontal: 14,
                paddingTop: 11,
                fontSize: 15,
                color: colors.text,
              }}
            />
            <Pressable
              onPress={send}
              disabled={busy || !input.trim()}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: colors.primary,
                alignItems: "center",
                justifyContent: "center",
                opacity: busy || !input.trim() ? 0.5 : 1,
              }}
            >
              {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={{ color: colors.primaryText, fontSize: 18 }}>↑</Text>}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ msg }: { msg: Msg }) {
  const mine = msg.role === "user";
  const error = msg.role === "error";
  return (
    <View
      style={{
        alignSelf: mine ? "flex-end" : "flex-start",
        maxWidth: "86%",
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: mine ? colors.primary : error ? "#fdecea" : colors.surface,
        borderWidth: mine ? 0 : 1,
        borderColor: error ? colors.danger : colors.border,
      }}
    >
      <Text style={{ color: mine ? colors.primaryText : error ? colors.danger : colors.text, fontSize: 15, lineHeight: 22 }}>
        {msg.text}
      </Text>
    </View>
  );
}
