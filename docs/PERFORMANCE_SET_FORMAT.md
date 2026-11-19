# 演奏セット version 4

formatは`MGS_MascotPlayer.PerformanceSet`。書込は4、読込は1/2/3/4。既存のname/playlists(id/name/songs/songIds)/active/motions/assignmentsを維持。

motionsはid/path/bpm/loop、creditText（本文）、textPosition、textModeを保持します。textPositionはnone/top-left/bottom-left/bottom-right、textModeはalways/brief。creditEnabledは旧形式の移行入力だけに使い、v3は表示位置へ統合します。5000/1000msは固定値で保存しません。

例：
```json
{"id":"motion-id","path":"user-motion.vmd","bpm":160,"loop":true,"textPosition":"top-left","textMode":"brief","creditText":"任意の文章\n次の行"}
```

旧v1/v2はcreditEnabled=trueならbottom-right、false/欠落ならnone。textModeはalways。creditTextは存在すれば保持、欠落なら空欄。旧v1/v2/v3の読込だけで原本を変更せず、dirtyを立てません。明示保存時も旧原本への上書きは拒否し、別名保存を案内。公開済みVer1.0.6以前はv4を読み込めません。

未知version、未知の位置/モード、不正型、不正参照、上限超過は全体を拒否し、現在のセットを保護。本文は従来どおりNUL不可、262,144 UTF-8 bytesまで、全体は2スペース整形JSONで16MiBまで。UI本文上限65,536 UTF-16コード単位。noneでも本文・モードを保持します。

保存は既存atomicFileの一時ファイル・flush・置換を使用。未保存編集は一般設定へ自動保存せず、起動時自動読込ONは最後の保存済みセットのみ復元します。同じVMDパスでも別セットの設定は独立します。

## VGM BPM

`vgmTracks`はVGM内容のSHA-256（64桁）をキーとし、`bpm`（20～400、初期値120）と`paths`を保持します。同じ内容のVGMはBPMを共有し、VMD割り当ては従来どおり行IDで独立します。旧v1～v3読込時にVGM BPMがなければ既定値を使い、原本へ自動上書きしません。
