# ビルド手順（Windows x64）

本手順はv026公開ソースの実ビルドで使用した方式です。依存物は同梱しません。バージョンを更新せず、固定版を利用してください。

| ツール・依存 | 検証した版 |
|---|---|
| LLVM-MinGW UCRT x86_64 | 20261006、Clang 23.1.3 |
| WebView2 SDK | Microsoft.Web.WebView2 1.0.4258.31 |
| CMake / Ninja | 4.3.1 / 1.12.1 |
| esbuild Windows x64 | 0.25.12 |
| Babylon core / loaders | 9.23.0 |
| babylon-mmd | 1.3.0 |

Python 3.12以降（tarのdata filter対応）、Node.js（テスト用）を用意してください。LLVM-MinGWは[公式リポジトリ](https://github.com/mstorsjo/llvm-mingw)、SDKは[公式NuGet](https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.4258.31)を使用します。SDKは展開し、`build/native/include`と`build/native/x64/WebView2Loader.dll`の存在を確認します。CMakeはビルド生成ツールで、MSVCコンパイラを利用する設定ではありません。

リポジトリルートで実行する例です。`C:\tools\...`は利用者の配置先に置き換えてください。

```powershell
python tools/fetch-frontend.py
python tools/build.py --llvm-bin C:\tools\llvm-mingw\bin --webview2-sdk C:\tools\webview2-sdk --cmake C:\tools\cmake\bin\cmake.exe --ninja C:\tools\ninja.exe --esbuild .deps/node_modules/@esbuild/win32-x64/esbuild.exe --node-modules .deps/node_modules
node --test tests/*.test.cjs
```

取得ヘルパーは`docs/DEPENDENCIES.lock.json`の固定URL・SHA-256・SHA-512で4つの公式npmアーカイブを照合し、`.deps/node_modules`に展開します。インストールスクリプトは実行しません。オフラインの場合は同ハッシュの既取得パッケージを配置し、`--node-modules`と`--esbuild`で指定できます。package.jsonはバージョン案内用にも用意していますが、npm全推移依存のpackage-lockはありません。`npm ci`の再現性を検証したという意味ではありません。

出力は`build/verification/app`です。同一出力先への上書きは拒否します。別試行は`--out build/another-check`を指定してください。生成ログ、コンパイラ版、コマンド、出力SHA、esbuild入力一覧もbuild配下に保存します。

ホストはC++17/O2/静的リンク/Unicode/Windows subsystem、Windows 10 APIターゲット指定で生成します。音声コアはRelease/Ninja、GNU Windows向けClangで生成します。具体的なオプションはtools/build.pyとnative/audio/CMakeLists.txtが正本です。WebView2Loader.dllはSDKからコピーします。MSVC静的CRT・Electron・FFmpegを導入しません。

動作試験では外部COMを生成アプリへ手動配置してください。VMD・曲も別途用意します。リポジトリやソースZIPに含めないでください。PCM比較を行う場合：

```powershell
python tests/compare-native.py --reference C:\reference\audio-core.exe --candidate build/verification/app/audio-core.exe --driver C:\private-fixtures\MGSDRV.COM --song C:\private-fixtures\test.mgs --report build/native-compare.json
```

これらは利用者の正当な外部検証データを指定する例であり、同梱データではありません。検証用データ・ログ・WebView2Profile・個人設定をコミットしないでください。通常のエンドユーザーは開発ツールを必要としません。

旧診断用の`MGS_BUILD_SEEK_PROBE`はOFFのまま使用してください。ONで参照する旧probeソースは今回の公開対象外で、その任意の旧診断ターゲットのビルドは検証対象に含めません。製品audio-coreに必要な独自ソースは含めてビルド確認済みです。

## 権利文書と改変版

自作コードはMIT（2026 rx7nana）。素材はASSET-LICENSE.md、公式アイコンは公式版専用です。改変版では[アイコン差し替え手順](ICON_REPLACEMENT.md)を実施してください。build.pyはMIT・素材条件・範囲説明・第三者通知を生成アプリにもコピーします。独自アイコンへの実差し替え試験を今回実施したという意味ではありません。
