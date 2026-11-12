# Android アプリ（Capacitor 版）

2026-11-13 に TWA（D:\codex\shomikigen-twa・bubblewrap）から Capacitor に作り替えた。TWA 側は戻せるように残してある。

## 場所
- この作業ツリー `D:\codex\shomikigen-cap` は `D:\codex\賞味期限` の git worktree（ブランチ feature/notifications）
- 日本語パスでは Android Gradle が通らないため ASCII パスに置いている（TWA_PROJECT_LOCATION.md と同じ理由）

## 前提（この PC）
- JDK 21：`C:\Users\machi\.jdks\jdk-21.0.13+9`（Capacitor 8 は JDK 21 が要る。bubblewrap の JDK 17 では不可）
- Android SDK：`C:\Users\machi\.bubblewrap\android_sdk`（android/local.properties の sdk.dir。git には入らない）

## デバッグ版 APK
```bash
npm run build && npx cap sync android
cd android
JAVA_HOME="C:/Users/machi/.jdks/jdk-21.0.13+9" ./gradlew assembleDebug --no-daemon
# → android/app/build/outputs/apk/debug/app-debug.apk
```

## 決まりごと
- appId は `jp.revoapp.shomikigen`（Play の既存アプリと同じ）。versionCode は TWA 版（3）より大きく（今は 4）
- リリース版の署名は TWA と同じ `android.keystore`（鍵が違うと Play で更新として受け付けられない）
- 正確なアラーム権限（SCHEDULE_EXACT_ALARM / USE_EXACT_ALARM）は AndroidManifest で外している。通知は `isExactNotification: false` で予約する（true のままだとプラグインが「アラームとリマインダー」設定画面を開く）
- 通知のテスト：`npm test`（src/utils/notifyPlan.test.ts）
