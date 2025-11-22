# Cursor2PNG

[English version is here](README.EN.md)

Windowsのカーソルファイル（`.cur`, `.ani`）を、Mac用アプリケーション「Mousecape」で使用可能なPNG画像と設定情報に変換するツールです。

現在開発中です。Pythonで書かれたデスクトップアプリ版と、ブラウザで動作するWeb版が含まれています。

## ディレクトリ構成

- **python/**: Python版のソースコード（GUIアプリ・CLIツール）
- **web/**: Web版のソースコード（HTML/CSS/JS）

---

## Python版の使い方

Tkinterを使用したGUIアプリで、ドラッグ＆ドロップによる一括変換が可能です。

### 必要要件

- Python 3.x

### インストール

リポジトリをクローン後、`python` ディレクトリに移動して依存ライブラリをインストールしてください。

```bash
cd python
pip install -r requirements.txt
```

### 実行方法

#### GUIアプリ（メインツール）
ドラッグ＆ドロップでファイルを読み込み、Mousecape用の画像と情報を出力します。

```bash
# pythonディレクトリ内で実行
python main_app.py
```

**主な機能:**
- `.cur` / `.ani` ファイルのプレビュー
- 複数ファイルの一括変換
- ホットスポット座標とフレームサイズの出力
- 任意サイズへのリサイズ機能

#### CLIツール（解析用）
ANIファイルの内部構造（フレームレートやシーケンス情報）をコンソールで確認するためのスクリプトです。

```bash
python check_ani.py "path/to/your_cursor.ani"
```

---

## Web版の使い方

`web` ディレクトリ内の `index.html` をブラウザで開いて使用します。
（または、GitHub Pagesなどでホスティングして使用してください）

---

## ライセンス

[MIT License](LICENSE)