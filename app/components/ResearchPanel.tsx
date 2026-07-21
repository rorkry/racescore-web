/**
 * 研究AIパネルコンポーネント
 */

'use client';

import { useState } from 'react';

interface ResearchPanelProps {
  targetType: 'race' | 'horse' | 'jockey' | 'sire' | 'course';
  targetId: string;
}

interface ResearchStepDisplay {
  step_number: number;
  tool_name: string;
  tool_input: Record<string, any>;
  tool_output: Record<string, any>;
}

export function ResearchPanel({ targetType, targetId }: ResearchPanelProps) {
  const [question, setQuestion] = useState('');
  const [goal, setGoal] = useState('');
  const [steps, setSteps] = useState<ResearchStepDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const startResearch = async () => {
    if (!question || !goal) {
      setError('疑問とゴールを入力してください');
      return;
    }
    
    setLoading(true);
    setError('');
    setSteps([]);
    
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          target_type: targetType,
          target_id: targetId,
          question,
          goal
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.message || data.error || 'エラーが発生しました');
        return;
      }
      
      setSteps(data.steps || []);
    } catch (err) {
      setError('通信エラーが発生しました');
      console.error('Research error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg p-6 shadow-md">
      <h2 className="text-2xl font-bold mb-4">🔬 研究AI</h2>
      
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            今回何を明らかにしたいか（ゴール）
          </label>
          <input
            type="text"
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder="例: 過大評価の理由を明らかにする"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            疑問
          </label>
          <textarea
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="例: 5番はなぜ人気なのか？"
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        <button
          onClick={startResearch}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? '研究中...' : '研究開始'}
        </button>
      </div>
      
      {steps.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-4">研究ログ（何をやったか）</h3>
          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-blue-600">
                    Step {step.step_number}
                  </span>
                  <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {step.tool_name}
                  </span>
                </div>
                
                <div className="space-y-2">
                  <div>
                    <strong className="text-sm text-gray-700">📥 入力:</strong>
                    <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                      {JSON.stringify(step.tool_input, null, 2)}
                    </pre>
                  </div>
                  
                  <div>
                    <strong className="text-sm text-gray-700">📤 出力:</strong>
                    {step.tool_output.summary ? (
                      <div className="mt-1 text-sm bg-green-50 p-3 rounded border border-green-200">
                        {step.tool_output.summary}
                      </div>
                    ) : (
                      <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-x-auto">
                        {JSON.stringify(step.tool_output, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
