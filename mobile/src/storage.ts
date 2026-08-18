import * as SecureStore from "expo-secure-store";

const SERVER_URL_KEY = "familytree.serverUrl.v1";

export async function loadServerUrl(defaultUrl: string): Promise<string | null> {
  const saved = await SecureStore.getItemAsync(SERVER_URL_KEY);
  return saved || defaultUrl || null;
}

export async function saveServerUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(SERVER_URL_KEY, url);
}

export async function clearServerUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(SERVER_URL_KEY);
}
