"""
機械学習による特徴量重要度分析
- どの指数が次走成績に最も影響するか
- 期待値の高いパターンを発見

使い方:
pip install pandas scikit-learn
python scripts/analyze-ml.py
"""

import json
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import warnings
warnings.filterwarnings('ignore')

# データ読み込み
print("=== 機械学習による特徴量重要度分析 ===\n")
print("データを読み込み中...")

try:
    with open('data/learning-data/learning-data-full.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    print(f"読み込み完了: {len(data):,}件")
except FileNotFoundError:
    print("エラー: data/learning-data/learning-data-full.json が見つかりません")
    print("先に node scripts/export-learning-data.js を実行してください")
    exit(1)

# DataFrameに変換
df = pd.DataFrame(data)

# 特徴量を選択
features = [
    'potential', 'makikaeshi', 'L4F', 'T2F',
    'finish_position', 'popularity', 'corner_4',
    'field_size', 'forward_rate'
]

# 欠損値を除外
df_valid = df.dropna(subset=['next_finish'] + ['potential', 'makikaeshi'])
df_valid = df_valid[df_valid['next_finish'] < 99]

print(f"有効データ: {len(df_valid):,}件\n")

# 目的変数: 3着以内かどうか
df_valid['is_top3'] = (df_valid['next_finish'] <= 3).astype(int)

# 特徴量を準備
X = df_valid[features].fillna(0)
y = df_valid['is_top3']

# 訓練/テスト分割
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

print("=== RandomForest による分析 ===\n")

# モデル訓練
rf = RandomForestClassifier(n_estimators=100, max_depth=10, random_state=42)
rf.fit(X_train, y_train)

# 特徴量重要度
importance = pd.DataFrame({
    '特徴量': features,
    '重要度': rf.feature_importances_
}).sort_values('重要度', ascending=False)

print("【特徴量重要度ランキング】")
print("-" * 40)
for _, row in importance.iterrows():
    bar = "█" * int(row['重要度'] * 50)
    print(f"{row['特徴量']:15} {row['重要度']:.3f} {bar}")

# 予測精度
y_pred = rf.predict(X_test)
accuracy = (y_pred == y_test).mean()
print(f"\n予測精度: {accuracy:.1%}")

# 3着以内予測の詳細
print("\n【分類レポート】")
print(classification_report(y_test, y_pred, target_names=['4着以下', '3着以内']))

# === 閾値別の詳細分析 ===
print("\n=== 閾値別 詳細分析 ===\n")

def analyze_threshold(df, col, thresholds, higher_is_better=True):
    print(f"【{col}】")
    print(f"{'範囲':10} | {'件数':>8} | {'3着内率':>8} | {'1着率':>6} | {'回収率':>8}")
    print("-" * 55)
    
    for i in range(len(thresholds) - 1):
        low, high = thresholds[i], thresholds[i + 1]
        mask = (df[col] >= low) & (df[col] < high)
        subset = df[mask]
        
        if len(subset) < 100:
            continue
        
        top3_rate = (subset['next_finish'] <= 3).mean() * 100
        win_rate = (subset['next_finish'] == 1).mean() * 100
        
        # 回収率（next_payoutがある場合）
        if 'next_payout' in subset.columns:
            roi = subset[subset['next_finish'] == 1]['next_payout'].sum() / (len(subset) * 100) * 100
        else:
            roi = 0
        
        mark = "★" if roi >= 100 else "○" if roi >= 80 else ""
        print(f"{low}〜{high}     | {len(subset):>8,} | {top3_rate:>7.1f}% | {win_rate:>5.1f}% | {roi:>7.1f}% {mark}")
    print()

# ポテンシャル指数
analyze_threshold(df_valid, 'potential', [0, 2, 4, 5, 6, 7, 8, 10])

# 巻き返し指数
analyze_threshold(df_valid, 'makikaeshi', [0, 1, 2, 3, 4, 5, 6, 8, 10])

# === 複合条件分析 ===
print("=== 複合条件分析 ===\n")

# 最強パターン: potential高 + makikaeshi最適ゾーン
best_pattern = df_valid[
    (df_valid['potential'] >= 5) & 
    (df_valid['makikaeshi'] >= 2) & 
    (df_valid['makikaeshi'] <= 4)
]
if len(best_pattern) > 0:
    top3_rate = (best_pattern['next_finish'] <= 3).mean() * 100
    win_rate = (best_pattern['next_finish'] == 1).mean() * 100
    if 'next_payout' in best_pattern.columns:
        roi = best_pattern[best_pattern['next_finish'] == 1]['next_payout'].sum() / (len(best_pattern) * 100) * 100
    else:
        roi = 0
    print(f"【最強パターン】potential>=5 & makikaeshi 2〜4")
    print(f"  件数: {len(best_pattern):,}")
    print(f"  3着内率: {top3_rate:.1f}%")
    print(f"  1着率: {win_rate:.1f}%")
    print(f"  回収率: {roi:.1f}%")

print("\n=== 分析完了 ===")
