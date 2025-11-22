# check_ani.py
import sys
from ani_file import ani_file

def analyze_ani(file_path):
    print(f"--- ファイルを解析中: {file_path} ---\n")
    try:
        af = ani_file.open(file_path, 'r')

        # レート情報を取得
        rates = af.getrate()
        print(f"【レート情報 (getrate() の結果)】")
        if rates:
            print(f"  - 取得成功: {rates}")
            print(f"  - 秒換算 (1/60秒): {[r / 60.0 for r in rates]}")
        else:
            print(f"  - 取得失敗: {rates} (Noneまたは空のリスト)")

        # フレームデータを取得
        frames_data = af.getframesdata()
        print(f"\n【フレーム数 (getframesdata() の結果)】")
        if frames_data:
            print(f"  - {len(frames_data)} フレーム")
        else:
            print("  - フレームが見つかりません")

        # シーケンス情報を取得
        seq = af.getseq()
        print(f"\n【シーケンス情報 (getseq() の結果)】")
        if seq:
            print(f"  - 取得成功: {seq}")
        else:
            print(f"  - 取得失敗: {seq} (Noneまたは空のリスト)")

        af.close()

    except Exception as e:
        print(f"\n*** エラーが発生しました: {e} ***")

    print("\n--- 解析終了 ---")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        analyze_ani(sys.argv[1])
    else:
        print("使用方法: python check_ani.py \"あなたのaniファイルへのパス\"")
        print("例: python check_ani.py \"C:\\Users\\Taro\\Desktop\\my_cursor.ani\"")