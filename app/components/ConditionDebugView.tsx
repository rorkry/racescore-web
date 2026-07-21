'use client';

/**
 * 条件のデバッグビュー
 * テストと検証用の詳細情報を表示
 */

interface ConditionDebugViewProps {
  result: any;
  index: number;
}

export default function ConditionDebugView({ result, index }: ConditionDebugViewProps) {
  const stats = result.statistics;
  const baseline = result.baseline_comparison;
  
  return (
    <div className={`border rounded-lg p-4 ${
      result.is_promising 
        ? 'border-green-300 bg-green-50' 
        : 'border-gray-300 bg-gray-50'
    }`}>
      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">#{index + 1}</span>
            <h4 className="font-bold text-gray-900">{result.candidate.name}</h4>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            💡 {result.candidate.hypothesis}
          </p>
        </div>
        <div className="ml-4 flex flex-col items-end gap-1">
          {result.is_promising ? (
            <span className="bg-green-600 text-white text-xs px-2 py-1 rounded font-medium">
              ✓ 有望
            </span>
          ) : (
            <span className="bg-gray-400 text-white text-xs px-2 py-1 rounded font-medium">
              ✗ 棄却
            </span>
          )}
          <span className="text-xs text-gray-600">
            スコア: {result.promising_score}/100
          </span>
        </div>
      </div>

      {/* 条件詳細 */}
      <details className="mb-3">
        <summary className="text-xs text-gray-600 cursor-pointer hover:text-gray-900">
          📋 条件詳細を表示
        </summary>
        <div className="mt-2 p-2 bg-white rounded border border-gray-200">
          <pre className="text-xs overflow-x-auto">
            {JSON.stringify(result.candidate.conditions, null, 2)}
          </pre>
        </div>
      </details>

      {/* 競争成績 */}
      <div className="mb-3">
        <div className="text-xs font-medium text-gray-700 mb-2">📊 競争成績</div>
        <div className="grid grid-cols-5 gap-2">
          <div className="bg-white p-2 rounded border border-gray-200">
            <div className="text-xs text-gray-600">サンプル</div>
            <div className="font-bold text-purple-700">{stats.sample_size}走</div>
          </div>
          <div className="bg-white p-2 rounded border border-gray-200">
            <div className="text-xs text-gray-600">勝率</div>
            <div className="font-bold text-gray-900">{(stats.win_rate * 100).toFixed(1)}%</div>
          </div>
          <div className="bg-white p-2 rounded border border-gray-200">
            <div className="text-xs text-gray-600">連対率</div>
            <div className="font-bold text-gray-900">{(stats.place_rate * 100).toFixed(1)}%</div>
          </div>
          <div className="bg-white p-2 rounded border border-gray-200">
            <div className="text-xs text-gray-600">三着内率</div>
            <div className="font-bold text-orange-700">{(stats.show_rate * 100).toFixed(1)}%</div>
          </div>
          <div className="bg-white p-2 rounded border border-gray-200">
            <div className="text-xs text-gray-600">平均着順</div>
            <div className="font-bold text-gray-900">{stats.avg_finish?.toFixed(1) || '-'}</div>
          </div>
        </div>
      </div>

      {/* 投資成績 */}
      <div className="mb-3">
        <div className="text-xs font-medium text-gray-700 mb-2">💰 投資成績</div>
        <div className="grid grid-cols-5 gap-2">
          <div className="bg-white p-2 rounded border border-gray-200">
            <div className="text-xs text-gray-600">単勝回収率</div>
            <div className="font-bold text-blue-700">{stats.win_return_rate.toFixed(1)}%</div>
          </div>
          <div className="bg-white p-2 rounded border border-gray-200">
            <div className="text-xs text-gray-600">複勝回収率</div>
            <div className="font-bold text-blue-700">{stats.place_return_rate.toFixed(1)}%</div>
          </div>
          <div className="bg-white p-2 rounded border border-gray-200">
            <div className="text-xs text-gray-600">期待値</div>
            <div className={`font-bold ${stats.expected_value_diff >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {stats.expected_value_diff >= 0 ? '+' : ''}{stats.expected_value_diff.toFixed(0)}円
            </div>
          </div>
          <div className="bg-white p-2 rounded border border-gray-200">
            <div className="text-xs text-gray-600">総投資</div>
            <div className="font-bold text-gray-900">{(stats.total_investment || 0).toLocaleString()}円</div>
          </div>
          <div className="bg-white p-2 rounded border border-gray-200">
            <div className="text-xs text-gray-600">利益</div>
            <div className={`font-bold ${(stats.profit || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {(stats.profit || 0) >= 0 ? '+' : ''}{(stats.profit || 0).toLocaleString()}円
            </div>
          </div>
        </div>
      </div>

      {/* ベースライン比較 */}
      {baseline && (
        <div className="mb-3">
          <div className="text-xs font-medium text-gray-700 mb-2">📈 ベースライン比較</div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white p-2 rounded border border-gray-200">
              <div className="text-xs text-gray-600">勝率向上</div>
              <div className={`font-bold ${baseline.win_rate_lift >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {baseline.win_rate_lift >= 0 ? '+' : ''}{baseline.win_rate_lift.toFixed(0)}%
              </div>
            </div>
            <div className="bg-white p-2 rounded border border-gray-200">
              <div className="text-xs text-gray-600">三着内率向上</div>
              <div className={`font-bold ${baseline.show_rate_lift >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {baseline.show_rate_lift >= 0 ? '+' : ''}{baseline.show_rate_lift.toFixed(0)}%
              </div>
            </div>
            <div className="bg-white p-2 rounded border border-gray-200">
              <div className="text-xs text-gray-600">回収率向上</div>
              <div className={`font-bold ${baseline.return_rate_lift >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {baseline.return_rate_lift >= 0 ? '+' : ''}{baseline.return_rate_lift.toFixed(0)}pt
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 評価詳細 */}
      <div className="mb-3">
        <div className="text-xs font-medium text-gray-700 mb-2">⚖️ 評価詳細</div>
        <div className="space-y-1">
          {result.promising_reasons?.map((reason: string, i: number) => (
            <div key={i} className="text-xs text-green-700 flex items-start gap-1">
              <span>✓</span>
              <span>{reason}</span>
            </div>
          ))}
          {result.promising_warnings?.map((warning: string, i: number) => (
            <div key={i} className="text-xs text-orange-600 flex items-start gap-1">
              <span>⚠️</span>
              <span>{warning}</span>
            </div>
          ))}
          {result.rejection_reason && (
            <div className="text-xs text-red-600 flex items-start gap-1">
              <span>✗</span>
              <span>棄却理由: {result.rejection_reason}</span>
            </div>
          )}
        </div>
      </div>

      {/* AIの解釈 */}
      {result.ai_interpretation && (
        <div className="mb-3 p-3 bg-blue-50 rounded border border-blue-200">
          <div className="text-xs font-medium text-blue-900 mb-1">🤖 AIの解釈</div>
          <p className="text-xs text-blue-800">{result.ai_interpretation.summary}</p>
          {result.ai_interpretation.next_steps && result.ai_interpretation.next_steps.length > 0 && (
            <div className="mt-2">
              <div className="text-xs text-blue-700 font-medium">次の手:</div>
              <ul className="text-xs text-blue-700 list-disc list-inside">
                {result.ai_interpretation.next_steps.map((step: string, i: number) => (
                  <li key={i}>{step}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* デバッグ情報 */}
      {result.debug_info && (
        <details>
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
            🔧 デバッグ情報
          </summary>
          <div className="mt-2 p-2 bg-gray-100 rounded text-xs">
            <div>評価時刻: {new Date(result.debug_info.evaluated_at).toLocaleString('ja-JP')}</div>
            <div>処理時間: {result.debug_info.evaluation_duration_ms}ms</div>
            <div>使用ツール: {result.debug_info.analysis_tool_used}</div>
            <div>統計的信頼度: {result.confidence.confidence_level.toFixed(0)}%</div>
          </div>
        </details>
      )}
    </div>
  );
}
