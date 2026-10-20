# 第三者ソフトウェアの通知

以下はv017からv025までの監査済み対応を継承します。原文はlicenses/および各vendorソースに保持し、自作コードのMITライセンスへ変更しません。

﻿第三者ソフトウェアと同梱ライセンス案内（v017）
原文はlicenses/およびweb/vendor/に保持しています。補足説明が許諾原文を置き換えることはありません。
SmartScreenに関する利用者通知はREADME.txtおよびPRIVACY_NOTICE.txtを参照してください。

LLVM/Clang/LLD | 23.1.3 / LLVM-MinGW20261006 | Apache-2.0 WITH LLVM-exception | 開発用、同梱なし
compiler-rt builtins | 23.1.3 | Apache-2.0 WITH LLVM-exception＋同文書第三者部分 | LLVM-23.1.3-compiler-rt-LICENSE.txt
libc++ | 23.1.3 | Apache-2.0 WITH LLVM-exception＋原文第三者部分 | LLVM-23.1.3-libcxx-LICENSE.txt
libc++abi | 23.1.3 | 同上 | LLVM-23.1.3-libcxxabi-LICENSE.txt
libunwind | 23.1.3 | 同上 | LLVM-23.1.3-libunwind-LICENSE.txt
MinGW-w64 CRT/headers/import libs | 固定配布20261006、ヘッダー15.0.0-alpha | 複数BSD/MIT/ISC/PD等、COPYING原文の各部分 | COPYING.MinGW-w64-runtime.txt
winpthreads | 同固定版のCOPYING（mingw-w642011/Lockless2010） | MIT/BSD-3-Clause等 | COPYING.winpthreads.txt
WebView2Loader.dll / SDK header | Microsoft.Web.WebView2 1.0.4258.31 x64 | SDK LICENSE.txt: BSD-3-Clause、NOTICE全文併記 | WebView2-LICENSE.txt / WebView2-NOTICE.txt
WebView2 Evergreen Runtime | 外部Evergreen Runtime、利用者環境で更新（v016検証155.0.4283.62） | Microsoft Runtime固有条件、SDK BSDとは別 | README.txt / PRIVACY_NOTICE.txt（SmartScreen通知）
Babylon.js core/loaders | 9.23.0 | Apache-2.0 | babylon-core-license.md / babylon-loaders-license.md / babylonjs-9.23.0-NOTICE.md
babylon-mmd | 1.3.0 | MIT | babylon-mmd-LICENSE
Ammo.js / Bullet | 前版と同SHAのbabylon-mmd付属wasm/js、独自版番号未付与 | zlib（既監査の配布ファイル対応を継承） | ammo-LICENSE.txt / ammo-notice.txt
libkss | 使用固定ソース/旧監査継承 | ISC | libkss.txt
MGSC C++ wrapper | 使用固定ソース/旧監査継承（COMとは別） | ISC | mgsc.txt / mgsc-upstream-readme.txt
KMZ80 | 86f9e79db4557360db42efe2f760a94b685f2ee9、既存版対応証拠継承 | 原作者MamiyaのPDS表示、DSA保守版 | KMZ80-original-kmz80.txt / kmz80-readme.txt
emu2149/2212/2413/76489/8950 | 使用固定ソース、前版と同一 | 各同梱ISC等原文 | emu2149-LICENSE.txt等5文書
webaudio-stream-player | 1.2.3-dev | MIT | webaudio-stream-player-MIT.txt / vendor/LICENSE.md
nlohmann/json | 3.12.0 | MIT | nlohmann-MIT.txt / source内ヘッダー原通知
PMX/テクスチャ/ショルダーキーボード/UI画像 | 旧版の同SHA資産 | 本人作品・第三者素材なしのユーザー申告を前提 | 既存の権利確認/同SHA照合

更新補足: Runtimeは外部Evergreenで自動更新されるため、v015の実測Runtime番号を固定配布版としません。
Ammoはbabylon-mmd付属物/ファイルSHAで識別。旧補足の参照は訂正済み。
マスコット・ショルダーキーボード等は作者本人制作・第三者素材不使用の申告を前提とします。COM/VMD/ユーザー曲は別途入手です。


公開用構成ではvendor/LICENSE.mdはsrc/vendor/webaudio-stream-player/LICENSE.mdです。MGSCの未使用COMダンプは除外済みです。上流READMEは履歴・通知として保持します。

ソース・バイナリ再配布とも、各原文の著作権・免責表示を保持してください。Apache系は該当NOTICEと変更表示、BSD系はバイナリ配布文書での通知も維持します。LLVM例外を含む静的リンク条件は元原文の範囲で適用します。KMZ80の原作者PDS表示と保守版の通知も削除しません。各著作者名はvendor内の原ヘッダーおよびlicenses内の通知が正本です。

esbuild0.25.12（MIT）、CMake・Ninja・LLVMツールチェーンは開発用で、実行ツール本体を公開ソースへ同梱しません。固定依存の版・取得URL・ハッシュはdocs/DEPENDENCIES.lock.jsonに記録しています。WebView2 Runtimeは外部Evergreenで、SDKのBSD許諾とは別のMicrosoft条件です。

[各原ファイルの権利者表示記録](docs/THIRD_PARTY_COPYRIGHTS.json)も参照してください。これは原文を置き換えるものではありません。

自作プログラムはCopyright (c) 2026 rx7nana / MITです。第三者への上書き適用は行いません。自作素材・公式アイコンはASSET-LICENSE.md、範囲はLICENSE-SCOPE.mdを参照してください。
