# iPhone アプリ（Capacitor iOS 版）

2026-11-21 に追加。Android 版（ANDROID_CAPACITOR.md）と同じ Web のコードを iOS で包む。

## 作り
- `@capacitor/ios` 8 系・**Swift Package Manager**（Capacitor 8 の既定。CocoaPods・pod install は使わない）
- Bundle ID `jp.revoapp.shomikigen`（Android の appId と同じ）・表示名「賞味期限メモ」
- iPhone のみ（TARGETED_DEVICE_FAMILY=1）・縦向きのみ・最低 iOS 15.0（Capacitor 8 の既定）
- 開発言語 ja（ダイアログの「キャンセル」などを日本語で出す）
- `ITSAppUsesNonExemptEncryption=false`。権限の説明文（NS…UsageDescription）は入れていない（通知は Info.plist の文言が不要）
- `ios/App/App/PrivacyInfo.xcprivacy`：収集なし・追跡なし。ファイル日時 API（C617.1）だけ申告（@capacitor/filesystem が含むため）
- `capacitor.config.ts` の `ios.contentInset: "always"`：Web の CSS を変えずにステータスバーの下へ潜らせない

## Mac が無くてもビルドする
- `.github/workflows/ios.yml`（GitHub Actions の macos-26・Xcode 26）
  - ジョブA：push／手動で、署名なしビルド
  - ジョブB：手動実行で「TestFlight へ上げる」にチェック → Secrets（ASC_ISSUER_ID・ASC_KEY_ID・ASC_KEY_P8・APPLE_TEAM_ID）で署名・アップロード
- ビルド番号は Actions の実行番号で自動。表示用の版（MARKETING_VERSION）は project.pbxproj の 1.0

## Windows でできること
```bash
npm test && npm run build && npx cap sync ios   # ios/App/App/public と Package.swift が更新される
python scripts/make-ios-assets.py               # アイコン・起動画面を作り直す（Pillow）
```
- `ios/App/App/public`・`capacitor.config.json`・`config.xml` は git に入らない（Actions が cap sync で作る）
- Xcode プロジェクト（project.pbxproj）を手で直すときは、タブ字下げのまま・ID の重複に注意

## 通知（iOS での違い）
- 同じ `src/native/notifications.ts` の経路で動く。`isExactNotification`・`allowWhileIdle`・`channelId`・`smallIcon` などは iOS 側のプラグインが読まないだけで害はない（チャンネル作成は Android のときだけ）
- iOS は予約できるローカル通知が 64 件まで。こちらは最大 30 件（30日分・1日1回）なので収まる
- 通知タップ：iOS のプラグインも `retainUntilConsumed` で渡すので、アプリが閉じていても起動後に「期限間近」を開く
- アプリを開いているときに届いた通知も、既定でバナー表示される
