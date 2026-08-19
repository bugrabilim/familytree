import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/theme";
import { styles } from "@/lib/styles";
import { BrandMark } from "@/lib/BrandMark";

export default function Register() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [familyName, setFamilyName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const submit = async () => {
    setError("");
    if (familyName.trim().length < 2) return setError("Ağaç adı en az 2 karakter olmalı.");
    if (password.length < 6) return setError("Şifre en az 6 karakter olmalı.");
    if (password !== confirm) return setError("Şifreler eşleşmiyor.");
    setLoading(true);
    try {
      const { recoveryCode } = await signUp(familyName.trim(), password);
      setRecoveryCode(recoveryCode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt başarısız.");
    } finally {
      setLoading(false);
    }
  };

  if (recoveryCode) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.authWrap}>
          <Text style={styles.title}>Kurtarma kodun</Text>
          <Text style={styles.subtitle}>Bunu güvenli bir yere kaydet — şifreni unutursan hesabını bununla kurtarırsın.</Text>
          <View style={styles.recoveryBox}>
            <Text style={styles.recoveryCode}>{recoveryCode}</Text>
          </View>
          <Pressable style={styles.button} onPress={() => router.replace("/(app)/home")}>
            <Text style={styles.buttonText}>Ağacıma git</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={styles.authWrap}>
            <BrandMark />
            <Text style={styles.title}>Ailenin ağacını kur</Text>
            <Text style={styles.subtitle}>Bir hesap aç, herkes birlikte doldursun</Text>

            <Text style={styles.label}>Ağaç adı</Text>
            <TextInput style={styles.input} value={familyName} onChangeText={setFamilyName}
              placeholder="ör. Demirtaş Ailesi" placeholderTextColor={colors.textSubtle} autoCapitalize="none" autoCorrect={false} />

            <Text style={styles.label}>Şifre</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword}
              placeholder="En az 6 karakter" placeholderTextColor={colors.textSubtle} secureTextEntry />

            <Text style={styles.label}>Şifre tekrar</Text>
            <TextInput style={styles.input} value={confirm} onChangeText={setConfirm}
              placeholder="Şifreni tekrar gir" placeholderTextColor={colors.textSubtle} secureTextEntry />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={submit} disabled={loading}>
              <Text style={styles.buttonText}>{loading ? "Oluşturuluyor…" : "Hesap oluştur"}</Text>
            </Pressable>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Zaten hesabın var mı? </Text>
              <Link href="/(auth)/login" style={styles.link}>Giriş yap</Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
