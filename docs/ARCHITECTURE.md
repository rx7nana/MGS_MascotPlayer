# 構成とv025対応

| 公開構成 | v025ソース内の由来 | 扱い |
|---|---|---|
| src | source/renderer | 表示・入力・音声制御、8ファイルは依存importの配置参照だけ変更 |
| native/host | source/native | 同一ソース、WebView2 CompositionController |
| native/audio | source/audio | 同一ソース、未使用mgsc-com.hだけ除外 |
| assets/windows | source/resources | ICO・版情報・RCを維持 |
| assets/model、web-assets、ui | web-runtimeの同名資産等 | 実行時に必要な資産、権利範囲は別管理 |
| src/vendor | web-runtime/vendor | 原著作権・MIT原文を維持 |
| third_party/ammo | web-runtime/ammo.wasm.* | 配布ファイルを同一バイトで維持 |
| config | source/defaults.json | 個人パスを含まない標準設定 |
| licenses | licenses | 全原文を同一バイトで維持 |
| tools、tests、docs | v026で整備・v027で権利文書を反映 | 公開用手順・再現試験、曲・COM不要の単体テスト |

旧web-runtime/ui.jsは生成バンドルなので、独自ソースsrcと固定依存から再構築します。他のweb-runtime重複JSはsrc側を正本とします。CommonJS版の解析・BPM・メタデータ関連は独立テストや保守用参照として保持します。native vendor内のMSVC条件分岐は上流の可搬コードで、現行バイナリがMSVC CRTをリンクしている根拠ではありません。

v025修正済みのPCMワーカーを維持します。シーク仕様・音声生成アルゴリズム・UIデザインは変更しません。再ビルドのEXEはパス・ツール出力等の影響でv025と同じSHAにはなりません。ソース対応とPCM・イベント・GUI動作の照合により確認し、ビット単位の再現ビルドを達成したとは扱いません。

未使用mgsc-com.hはMGSC.COM本体のC配列ダンプでした。現行コンパイル経路に参照はなく、公開コピーから除外しています。上流READMEに古い同名ヘッダーの説明が残っていますが、外部COMを別途配置する現行手順が優先です。そのダンプを復活・公開しないでください。

権利範囲はルートLICENSE-SCOPE.mdを参照してください。モデル等と公式アイコンはMITの対象外で、ASSET-LICENSE.mdが適用されます。
