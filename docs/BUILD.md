# Ver1.0.4 ソースのビルド

LLVM-MinGW 20261006 UCRT x86_64、同じWebView2 SDK、Babylon.js 9.23.0、babylon-mmd 1.3.0、esbuild 0.25.12を維持します。依存バージョンを更新しないでください。

PythonとNode.js、CMake、Ninja、LLVM-MinGW、WebView2 SDK、固定npm依存を別途準備し、tools/build.py --helpに従って --llvm-bin、--webview2-sdk、--cmake、--ninja、--esbuild、--node-modules と未使用の --out build/任意名 を渡します。既存buildディレクトリへの上書きは拒否します。

tools/build.pyはホスト、版リソース、UI、音声コアをソースから生成します。本候補作業では音声ソースがVer1.0.3と全バイト一致することを確認し、配布用音声コアはVer1.0.3と同じバイナリを再利用しています。ホストはv035ソースで再生成。完全ビット再現性を保証するものではありません。

単体試験：node --test tests/*.test.cjs tests/*.test.mjs 。旧PlaylistDraftの単体試験は互換モジュールの試験で、v035設定UIが旧保存・キャンセル方式を使うことを意味しません。

実音声比較はtests/compare-native.py --reference 参照audio-core.exe --candidate 新audio-core.exe --driver 外部MGSDRV.COM --song 検証用MGS --report 出力JSON。素材は利用条件を確認して別途準備し、ソースZIPへ同梱しません。
