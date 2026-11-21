import type { CapacitorConfig } from "@capacitor/cli";

// appId は Play の既存アプリ（TWA 版）と同じにする。違うと「別のアプリ」になり更新として出せない
const config: CapacitorConfig = {
  appId: "jp.revoapp.shomikigen",
  appName: "賞味期限メモ",
  webDir: "dist",
  android: {
    // Web 版（shomikigen.revoapp.jp）と同じ見た目の背景
    backgroundColor: "#F5F7FB"
  },
  ios: {
    // Web 側の CSS（index.html の viewport）を変えずに、ステータスバーとホームバーの下に画面が潜らないようにする。
    // 背景色は指定しない（ダークモードではページの暗い背景がそのまま見えるように）
    contentInset: "always"
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
      iconColor: "#2563EB"
    }
  }
};

export default config;
