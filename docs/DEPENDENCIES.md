# 依存関係一覧

この一覧は実ファイル・package.json・原通知に基づきます。著作権と許諾の正本はlicenses/およびvendor原ヘッダーです。

| 区分 | 構成要素 | 確認根拠 |
|---|---|---|
| 本体組込コード | libkss、MGSC C++ wrapper、KMZ80、emu2149/2212/2413/76489/8950、nlohmann/json | native/audio/vendor、native/host/json.hpp、licenses/ |
| フロントエンド | Babylon core/loaders 9.23.0、babylon-mmd 1.3.0、webaudio-stream-player | package.json、src/vendor、licenses/ |
| 同梱ファイル | WebView2Loader.dll、Ammo js/wasm、モデル/UI資産 | licenses/WebView2-*、ammo-*、ASSET-LICENSE.md |
| ビルド/ランタイム通知 | LLVM/MinGW、compiler-rt/libc++/libc++abi/libunwind/winpthreads | THIRD-PARTY-NOTICES.md、licenses/ |
| 利用者が別途配置 | MGSC.COM、MGSDRV.COM、libvgm系vgm2wav.exe | 非同梱、READMEの案内・提供元の利用条件 |
| 開発・検証のみ | Python、Node、esbuild、CMake、Ninja、LLVM/SDK、検証用入力/計測 | ツール本体/検証入力を配布しない |

フロントエンドの固定取得先・原アーカイブSHA/IntegrityはDEPENDENCIES.lock.jsonを参照してください。既存の確定記録を復元し、実際の取得済みpackage版と照合しました。C++等を含む全体のlockや完全なSBOMと誤認しないでください。

emu5種類の対象LICENSE原文はMITです。libkss/MGSC wrapperのISCと混同しません。外部libvgm全体はMIT等へ独自に分類せず、包括許諾未確定のままです。

旧THIRD_PARTY_COPYRIGHTS.json参照は、原文への直接案内へ整理しました。切り詰めた自動抽出行を著作権原文の代用にしません。版番号を実ファイルから確定できない構成要素は推測で補いません。
