import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";
import { styles } from "@/lib/styles";
import { BrandMark } from "@/lib/BrandMark";

export default function Login() {
  const { signIn, sessionNote, clearSessionNote } = useAuth();
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  /* Üye girişi (madde 36): boşsa kurucu yolu. */
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!familyName.trim() || !password) {
      setError("Ağaç adı ve şifre gerekli.");
      return;
    }
    setLoading(true);
    try {
      await signIn(familyName.trim(), password, username.trim().toLowerCase());
      router.replace("/(app)/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Giriş başarısız.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.authWrap}>
          <BrandMark />
          <Text style={styles.title}>Tekrar hoş geldin</Text>
          <Text style={styles.subtitle}>Ağacına giriş yap</Text>

          {/*
            OTURUM KENDİLİĞİNDEN DÜŞTÜYSE SEBEBİNİ SÖYLÜYORUZ.
            Sunucudan 401 gelince `AuthProvider` jetonu temizliyor ve kullanıcı
            bu ekrana düşüyor. Not olmasaydı kendini sebepsiz yere giriş
            ekranında bulurdu — hesabını silmiş ya da ağaçtan çıkarılmış
            olabilir; ikisi de açıklanmaya değer.
          */}
          {sessionNote ? (
            <Pressable
              onPress={clearSessionNote}
              style={{
                marginTop: 4,
                marginBottom: 4,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                {sessionNote}
              </Text>
            </Pressable>
          ) : null}

          <Text style={styles.label}>Ağaç adı</Text>
          <TextInput
            style={styles.input}
            value={familyName}
            onChangeText={setFamilyName}
            placeholder="ör. Demirtaş Ailesi"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Kullanıcı adı (üyeler için)</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Ağacı sen kurduysan boş bırak"
            placeholderTextColor={colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Şifre</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Şifreniz"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={submit} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? "Giriş yapılıyor…" : "Giriş yap"}</Text>
          </Pressable>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Hesabın yok mu? </Text>
            <Link href="/(auth)/register" style={styles.link}>Hesap oluştur</Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
