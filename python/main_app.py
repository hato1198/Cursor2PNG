# -*- coding: utf-8 -*-

import tkinter as tk
from tkinter import filedialog, ttk
import ttkbootstrap as tb
from ttkbootstrap.constants import *
from ttkbootstrap.dialogs import Messagebox
from PIL import Image, ImageTk
import io
import os
import struct
from ani_file import ani_file
import math
import threading
from tkinterdnd2 import DND_FILES, TkinterDnD

# --- 定数定義 ---
TYPE_MAP = {
    ("斜め", "縮小1", "diagonal", "resize 1"): "Window NW-SE, Window NW, Window SE",
    ("斜め", "縮小2", "diagonal", "resize 2"): "Window NE-SW, Window NE, Window SW",
    ("左右", "horizontal"): "Window E-W, Window E, Window W, Resize E-W, Resize E, Resize W",
    ("上下", "vertical"): "Window N-S, Window N, Window S, Resize N-S, Resize N, Resize S",
    ("通常", "normal", "arrow"): "Arrow",
    ("ヘルプ", "help"): "Help",
    ("バックグラウンド", "background"): "Busy",
    ("待ち状態", "busy", "wait"): "Wait",
    ("領域", "precision", "cross"): "Cell",
    ("テキスト", "text", "ibeam"): "IBeam",
    ("利用不可", "unavailable", "no"): "Forbidden",
    ("移動", "move"): "Move, Resize Square",
    ("リンク", "link", "hand"): "Pointing",
}

class CursorConverter:
    def __init__(self, file_path, target_size=None):
        self.file_path = file_path
        self.filename = os.path.basename(file_path)
        self.target_size = target_size
        self.type = self._guess_type()

    def _guess_type(self):
        fn_lower = self.filename.lower()
        for keywords, type_name in TYPE_MAP.items():
            if len(keywords) > 2 and (
                (keywords[0] in self.filename and keywords[1] in self.filename) or
                (keywords[2] in fn_lower and keywords[3] in fn_lower)
            ):
                return type_name
            elif any(kw in fn_lower for kw in keywords):
                return type_name
        return "Unknown"

    def _get_hotspot_from_cur_blob(self, blob):
        try:
            return struct.unpack_from('<HH', blob, offset=10)
        except struct.error:
            return (0, 0)

    def _get_best_image_from_pil(self, img):
        if hasattr(img, 'n_frames') and img.n_frames > 1:
            best_frame = 0; max_size = 0
            for i in range(img.n_frames):
                img.seek(i)
                size = img.size[0] * img.size[1]
                if size > max_size: max_size = size; best_frame = i
            img.seek(best_frame)
        return img.copy()

    def convert(self):
        ext = os.path.splitext(self.filename)[1].lower()
        if ext == '.cur': return self._process_cur()
        elif ext == '.ani': return self._process_ani()
        else: raise ValueError(f"サポートされていないファイル形式です: {ext}")

    def _process_cur(self):
        with open(self.file_path, 'rb') as f: blob = f.read()
        hotspot = self._get_hotspot_from_cur_blob(blob)
        img = self._get_best_image_from_pil(Image.open(io.BytesIO(blob)))
        original_size = img.size
        if self.target_size and self.target_size > 0:
            scale = self.target_size / original_size[0] if original_size[0] > 0 else 1.0
            resized_img = img.resize((self.target_size, self.target_size), Image.Resampling.NEAREST)
            final_hotspot = (int(hotspot[0] * scale), int(hotspot[1] * scale))
            final_img = resized_img
        else:
            final_hotspot = hotspot
            final_img = img
            
        return {
            "type": self.type, "frames": 1, "duration": 1.0, "hotspot": final_hotspot,
            "image": final_img, "original_filename": self.filename,
            "frame_size": final_img.size # <<<--- 改善点: サイズ情報を追加
        }

    def _process_ani(self):
        af = ani_file.open(self.file_path, 'r')
        frame_blobs = af.getframesdata()
        rates_in_sec = [(r / 60.0) for r in af.getrate()] if af.getrate() else [1/15.0] * len(frame_blobs)
        af.close()
        if not rates_in_sec: raise ValueError("ANIファイルからフレームレートを取得できませんでした。")
        min_duration = min(r for r in rates_in_sec if r > 0)
        frame_multipliers = [max(1, round(r / min_duration)) for r in rates_in_sec]
        total_frames = sum(frame_multipliers)
        output_frames = []; final_hotspot = (0, 0); max_width = 0; frame_size = (0, 0)
        for i, blob in enumerate(frame_blobs):
            hotspot = self._get_hotspot_from_cur_blob(blob)
            if i == 0: final_hotspot = hotspot
            img = self._get_best_image_from_pil(Image.open(io.BytesIO(blob)))
            original_size = img.size
            if self.target_size and self.target_size > 0:
                 if i == 0:
                    scale = self.target_size / original_size[0] if original_size[0] > 0 else 1.0
                    final_hotspot = (int(hotspot[0] * scale), int(hotspot[1] * scale))
                 img = img.resize((self.target_size, self.target_size), Image.Resampling.NEAREST)
            if i == 0: frame_size = img.size # 最初のフレームのサイズを代表とする
            for _ in range(frame_multipliers[i]): output_frames.append(img)
            if img.width > max_width: max_width = img.width
        total_height = sum(f.height for f in output_frames)
        sprite_sheet = Image.new('RGBA', (max_width, total_height))
        current_y = 0
        for frame in output_frames:
            x_offset = (max_width - frame.width) // 2
            sprite_sheet.paste(frame, (x_offset, current_y))
            current_y += frame.height
            
        return {
            "type": self.type, "frames": total_frames, "duration": min_duration,
            "hotspot": final_hotspot, "image": sprite_sheet, "original_filename": self.filename,
            "frame_size": frame_size # <<<--- 改善点: サイズ情報を追加
        }

class ConverterApp(TkinterDnD.Tk):
    def __init__(self):
        super().__init__()
        self.style = tb.Style("litera")
        self.title("CUR/ANI to Mousecape Converter")
        self.minsize(800, 600)
        self.file_paths = []
        self.results = {}
        self.setup_ui()

    def setup_ui(self):
        main_frame = tb.Frame(self, padding=15)
        main_frame.pack(fill=BOTH, expand=YES)
        main_frame.grid_rowconfigure(2, weight=1)
        main_frame.grid_columnconfigure(0, weight=1)

        settings_frame = tb.Labelframe(main_frame, text="設定", padding=10)
        settings_frame.grid(row=0, column=0, columnspan=2, sticky="ew", pady=(0, 10))
        settings_frame.grid_columnconfigure(1, weight=1)
        tb.Label(settings_frame, text="リサイズ (ピクセル, 0で無効):").grid(row=0, column=0, padx=5, pady=5, sticky="w")
        self.size_var = tb.IntVar(value=0)
        size_entry = tb.Entry(settings_frame, textvariable=self.size_var, width=10)
        size_entry.grid(row=0, column=1, padx=5, pady=5, sticky="w")
        
        list_frame = tb.Labelframe(main_frame, text="変換対象ファイル (ここにドラッグ＆ドロップ)", padding=10)
        list_frame.grid(row=1, column=0, columnspan=2, sticky="nsew", pady=(0, 10))
        list_frame.grid_rowconfigure(0, weight=1)
        list_frame.grid_columnconfigure(0, weight=1)
        self.file_listbox = tk.Listbox(list_frame, selectmode=tk.SINGLE, height=8)
        self.file_listbox.grid(row=0, column=0, sticky="nsew")
        # Listboxの選択色をttkbootstrapのINFOカラーに設定する
        select_bg_color = self.style.colors.primary
        select_fg_color = 'white'
        self.file_listbox.config(
            selectbackground=select_bg_color,
            selectforeground=select_fg_color
        )
        scrollbar = tb.Scrollbar(list_frame, orient=VERTICAL, command=self.file_listbox.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.file_listbox.config(yscrollcommand=scrollbar.set)
        self.file_listbox.drop_target_register(DND_FILES)
        self.file_listbox.dnd_bind('<<Drop>>', self.on_drop)
        self.file_listbox.bind("<<ListboxSelect>>", self.on_listbox_select)

        result_frame = tb.Labelframe(main_frame, text="Mousecape 設定情報", padding=10)
        result_frame.grid(row=2, column=0, sticky="nsew")
        result_frame.grid_rowconfigure(0, weight=1)
        result_frame.grid_columnconfigure(0, weight=1)
        self.info_text = tk.Text(result_frame, wrap="word", height=10, state="disabled")
        self.info_text.grid(row=0, column=0, sticky="nsew")
        info_scroll = tb.Scrollbar(result_frame, orient=VERTICAL, command=self.info_text.yview)
        info_scroll.grid(row=0, column=1, sticky="ns")
        self.info_text.config(yscrollcommand=info_scroll.set)

        preview_frame = tb.Labelframe(main_frame, text="プレビュー", padding=10)
        preview_frame.grid(row=2, column=1, sticky="nsew", padx=(10, 0))
        preview_frame.grid_rowconfigure(0, weight=1)
        preview_frame.grid_columnconfigure(0, weight=1)
        self.preview_label = tb.Label(preview_frame)
        self.preview_label.grid(row=0, column=0, sticky="nsew")

        button_frame = tb.Frame(main_frame)
        button_frame.grid(row=3, column=0, columnspan=2, sticky="ew", pady=(10, 0))
        button_frame.grid_columnconfigure(3, weight=1)

        tb.Button(button_frame, text="ファイルを追加...", command=self.add_files, bootstyle=PRIMARY).grid(row=0, column=0, padx=5)
        tb.Button(button_frame, text="選択中のファイルを削除", command=self.remove_selected_file, bootstyle=DANGER).grid(row=0, column=1, padx=5)
        tb.Button(button_frame, text="リセット", command=self.clear_all, bootstyle=DANGER).grid(row=0, column=2, padx=5)
        self.progress = tb.Progressbar(button_frame, mode='determinate', length=150)
        self.progress.grid(row=0, column=3, sticky="e", padx=10)
        tb.Button(button_frame, text="一括変換して保存", command=self.start_conversion, bootstyle=SUCCESS).grid(row=0, column=4, padx=5)

    def add_files(self):
        paths = filedialog.askopenfilenames(title="カーソルファイルを選択", filetypes=(("カーソルファイル", "*.cur *.ani"), ("すべてのファイル", "*.*")))
        if paths: self.update_file_list(paths)

    def on_drop(self, event):
        paths = self.file_listbox.tk.splitlist(event.data)
        self.update_file_list(paths)

    def update_file_list(self, new_paths):
        had_selection = bool(self.file_listbox.curselection())
        for path in new_paths:
            if path not in self.file_paths and (path.lower().endswith(".cur") or path.lower().endswith(".ani")):
                self.file_paths.append(path)
                self.file_listbox.insert(tk.END, os.path.basename(path))

        # <<<--- UI改善点: ファイル追加後に先頭を自動選択
        if self.file_listbox.size() > 0 and not had_selection:
            self.file_listbox.selection_set(0)
            self.on_listbox_select(None) # イベントを強制的に呼び出して表示を更新

    def remove_selected_file(self):
        selection_indices = self.file_listbox.curselection()
        if not selection_indices: return
        selected_index = selection_indices[0]
        del self.file_paths[selected_index]
        self.file_listbox.delete(selected_index)
        self.file_listbox.selection_clear(0, tk.END)
        self.clear_info_preview()
        # 次の項目があればそれを選択
        if self.file_listbox.size() > 0:
            next_index = min(selected_index, self.file_listbox.size() - 1)
            self.file_listbox.selection_set(next_index)
            self.on_listbox_select(None)

    def clear_all(self):
        self.file_paths.clear()
        self.file_listbox.delete(0, tk.END)
        self.results.clear()
        self.clear_info_preview()
        
    def clear_info_preview(self):
        self.info_text.config(state="normal"); self.info_text.delete(1.0, tk.END); self.info_text.config(state="disabled")
        self.preview_label.config(image=''); self.preview_label.image = None

    def on_listbox_select(self, event):
        selection_indices = self.file_listbox.curselection()
        if not selection_indices: return
        selected_index = selection_indices[0]
        path = self.file_paths[selected_index]
        # リサイズ値が変更された可能性を考慮し、選択のたびに結果を再生成する
        try:
            target_size = self.size_var.get()
            converter = CursorConverter(path, target_size)
            result = converter.convert()
            self.results[path] = result
            self.display_result(result)
        except Exception as e:
            Messagebox.show_error(f"ファイル解析エラー:\n{path}\n\n{e}", "エラー")
            self.remove_selected_file()

    def display_result(self, result):
        self.info_text.config(state="normal")
        self.info_text.delete(1.0, tk.END)
        info_str = (
            f"ファイル名: {result['original_filename']}\n"
            f"-------------------------------------\n"
            f"Type: {result['type']}\n"
            f"Frames: {result['frames']}\n"
            f"Frame Duration: {result['duration']:.4f}\n"
            f"Hot Spot: {{{result['hotspot'][0]}, {result['hotspot'][1]}}}\n"
            f"Size: {{{result['frame_size'][0]}, {result['frame_size'][1]}}}\n"
        )
        self.info_text.insert(tk.END, info_str)
        self.info_text.config(state="disabled")
        img = result['image']
        max_h = 300
        if img.height > max_h:
            ratio = max_h / img.height
            new_w = int(img.width * ratio)
            img = img.resize((new_w, max_h), Image.Resampling.NEAREST)
        photo = ImageTk.PhotoImage(img)
        self.preview_label.config(image=photo)
        self.preview_label.image = photo

    def start_conversion(self):
        if not self.file_paths:
            Messagebox.show_warning("ファイルが選択されていません。", "警告"); return
        output_dir = filedialog.askdirectory(title="保存先フォルダを選択")
        if not output_dir: return
        self.progress['value'] = 0
        self.progress['maximum'] = len(self.file_paths)
        thread = threading.Thread(target=self.run_conversion_thread, args=(output_dir,))
        thread.start()

    def run_conversion_thread(self, output_dir):
        errors = []
        target_size = self.size_var.get()
        for i, path in enumerate(self.file_paths):
            try:
                converter = CursorConverter(path, target_size)
                result = converter.convert()
                base_name = os.path.splitext(result['original_filename'])[0]
                png_path = os.path.join(output_dir, f"{base_name}.png")
                result['image'].save(png_path, 'PNG')
                info_path = os.path.join(output_dir, f"{base_name}_info.txt")
                # <<<--- 改善点: 保存するテキストにもSizeを追加
                with open(info_path, 'w', encoding='utf-8') as f:
                    f.write(f"Source: {result['original_filename']}\n")
                    f.write("---------------------------\n")
                    f.write(f"Type: {result['type']}\n")
                    f.write(f"Frames: {result['frames']}\n")
                    f.write(f"Frame Duration: {result['duration']:.4f}\n")
                    f.write(f"Hot Spot: {{{result['hotspot'][0]}, {result['hotspot'][1]}}}\n")
                    f.write(f"Size: {{{result['frame_size'][0]}, {result['frame_size'][1]}}}\n")
            except Exception as e:
                errors.append(f"ファイル '{os.path.basename(path)}' の変換に失敗しました: {e}")
            self.after(0, self.update_progress, i + 1)
        self.after(0, self.show_completion_message, output_dir, errors)

    def update_progress(self, value):
        self.progress['value'] = value

    def show_completion_message(self, output_dir, errors):
        if errors:
            error_msg = "\n\n".join(errors)
            Messagebox.show_error(f"いくつかのファイルでエラーが発生しました:\n\n{error_msg}", "変換エラー")
        else:
            Messagebox.show_info(f"変換が完了しました。\nファイルは '{output_dir}' に保存されました。", "成功")
        self.progress['value'] = 0

if __name__ == "__main__":
    try:
        from ctypes import windll
        windll.shcore.SetProcessDpiAwareness(1)
    except (ImportError, AttributeError): pass
    app = ConverterApp()
    app.mainloop()