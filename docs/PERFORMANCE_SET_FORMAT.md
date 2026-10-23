# 演奏セット version 1

format: MGS_MascotPlayer.PerformanceSet / version: 1。
name、playlists（id/name/songs/songIds）、active、motions（id/path/bpm/loop）、assignments（playlist ID → song occurrence ID → motion ID）を保持します。

同一リスト内の曲ID、リストID、モーションIDとWindowsパス表記を正規化したVMDパスの重複を拒否。BPMは有限20〜400、loopはboolean。参照不整合・未対応version・不正JSONは読み込み全体を失敗させ、現在のセットを置き換えません。上限は999リスト/各10000曲/1000モーション、ファイル16MiBです。

保存は同じディレクトリの一時ファイルへ全内容を書いてflushし、Windowsの置換を実行します。置換失敗で元ファイルは変更しません。setPath/setDirtyはファイル本体に埋め込まず、実行中メタデータで管理します。

移行時は旧settingsの原本コピーと独立した移行セットを新規作成し、performance-set-migration.jsonに記録。既存移行ファイルを上書きしません。起動時自動読み込みOFFは初回移行表示後の次回起動から空セットになります。ONも保存ファイルだけを読み、未保存編集を復元しません。
