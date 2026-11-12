# TWA（Androidアプリ）プロジェクトの場所

**このリポジトリの中にはありません。**

```
D:\codex\shomikigen-twa\
```

## なぜ外に出しているか

Android Gradle Plugin は、**プロジェクトパスに非ASCII文字が含まれるとビルドを拒否**する。

```
Your project path contains non-ASCII characters.
This will most likely cause the build to fail on Windows.
```

このリポジトリのパス `D:\codex\賞味期限\` は日本語を含むため、
配下に置いた `twa\` ではビルドできなかった（2026-07-31に判明）。
`android.overridePathCheck=true` で警告を無効化する回避策もあるが、
警告文自体が「ビルドは失敗する可能性が高い」と述べており、
aapt2 等でより分かりにくいエラーになるため採用しなかった。

→ **TWAプロジェクトのみ ASCII パスへ退避**した。Webアプリ側（このリポジトリ）は移動していない。

## ビルド手順

```bash
cd D:\codex\shomikigen-twa
bubblewrap build
```

キーストアのパスワードを2回入力する。

## 重要ファイル

| ファイル | 内容 |
|---|---|
| `D:\codex\shomikigen-twa\twa-manifest.json` | TWAの設定。packageId `jp.revoapp.shomikigen` |
| `D:\codex\shomikigen-twa\android.keystore` | **署名鍵**。OneDrive（佳秀 - 株式会社R-evolution / iphoneアプリ / 鍵）にバックアップ済み |

パスワードは Google パスワードマネージャーに保管（ウェブサイト `shomikigen.revoapp.jp` / ユーザー名 `android`）。

## 環境上の注意（同じ罠を踏まないために）

- **JDKは64bitを使うこと**。Bubblewrapが自動DLするJDKは32bit版で、
  `-Xmx1536m` を確保できず `Could not reserve enough space for object heap` になる。
  64bit版を `C:\Users\machi\.bubblewrap\jdk64\` に配置し、
  `C:\Users\machi\.bubblewrap\config.json` の `jdkPath` をそこへ向けてある。
- **`@bubblewrap/cli` は 1.24.1 を使うこと**。1.25.0 は存在しない依存
  （`@bubblewrap/validator@^1.25.0`）を要求してインストール自体が失敗する。
- **`bubblewrap update` は `gradle.properties` を初期化する**。
  手で入れた設定は消えるので、変更したら都度入れ直す。
