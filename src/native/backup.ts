import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

// アプリ版のバックアップ書き出し。
// WebView では <a download> の保存が効かないので、端末のキャッシュに書いて共有シートで渡す
// （Google ドライブ・ファイル・メールなど、保存先は利用者が選ぶ。アプリは外へ送らない）。
export async function shareBackupFile(fileName: string, json: string): Promise<void> {
  const written = await Filesystem.writeFile({
    path: fileName,
    data: json,
    directory: Directory.Cache,
    encoding: Encoding.UTF8
  });

  await Share.share({
    title: "賞味期限メモのバックアップ",
    files: [written.uri],
    dialogTitle: "バックアップの保存先を選ぶ"
  });
}
