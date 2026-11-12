const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KANA_OFFSET = 0x60;

// 検索用の正規化。食品名はカタカナが多く、入力はひらがなになりがちなので
// 「ぷりん」で「プリン」に当たるようにする。
// NFKC で全角英数・半角カナを標準形に寄せてから、カタカナをひらがなへ倒す。
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (char) => {
      const code = char.charCodeAt(0);
      if (code < KATAKANA_START || code > KATAKANA_END) return char;
      return String.fromCharCode(code - KANA_OFFSET);
    });
}
