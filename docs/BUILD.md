# Ver1.0.6 ソースのビルド

固定依存：LLVM-MinGW 20261006 UCRT x86_64、WebView2 SDK、Babylon.js 9.23.0、babylon-mmd 1.3.0、esbuild 0.25.12。Python、Node.js、CMake、Ninjaを別途準備してください。依存の更新はこの版の再現条件に含みません。

`python tools/build.py --help`で各引数を確認し、`--llvm-bin`、`--webview2-sdk`、`--cmake`、`--ninja`、`--esbuild`、`--node-modules`と未使用の`--out build/verification`を指定します。出力先の上書きは拒否します。

スクリプトはUI、正式版リソース付きホスト、正式版リソース付き音声コアをソースから生成します。音声・VMD同期のアルゴリズムは前版から変更していません。異なる配置パス・ツール環境での完全ビット一致を保証するものではありません。

ソース試験：`node --test tests/*.test.cjs tests/*.test.mjs`。音声比較は`tests/compare-native.py`の引数に、比較用EXEと外部COM/曲を別途指定します。COM・曲・VMDはソースZIPへ同梱しません。
