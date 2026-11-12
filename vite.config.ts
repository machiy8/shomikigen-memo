import { defineConfig } from "vite";

// Vite 6 の既定ビルド対象は Chrome 107 相当で、`??` などが素のまま出力される。
// TWA の minSdkVersion は 21（Android 5.0）なので、古い端末にもインストールできてしまい、
// 起動しても構文エラーで白画面になる（実機 Chrome 64 / Android 8.0 で再現）。
// インストールできる範囲と動作する範囲を揃えるため、ES Modules が使える下限まで下げる。
export default defineConfig({
  build: {
    target: ["es2015", "chrome61", "safari11", "firefox60", "edge18"],
  },
});
