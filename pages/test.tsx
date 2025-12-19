import { useState } from 'react';
import { trpc } from '../lib/trpc';

export default function TestPage() {
  const [raceId, setRaceId] = useState('2025121406050412');
  const { data, isLoading, error, refetch } = trpc.getRaceData.useQuery({ raceId });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    refetch();
  };

  if (isLoading) {
    return <div style={{ padding: '2rem' }}>読み込み中...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: 'red' }}>
        エラー: {error.message}
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
        データベーステスト
      </h1>
      
      <form onSubmit={handleSubmit} style={{ marginBottom: '2rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          レースID:
        </label>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input
            type="text"
            value={raceId}
            onChange={(e) => setRaceId(e.target.value)}
            style={{
              flex: 1,
              padding: '0.5rem',
              border: '1px solid #ccc',
              borderRadius: '4px',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            検索
          </button>
        </div>
      </form>

      <p style={{ marginBottom: '1rem' }}>
        データ件数: {data?.length || 0}
      </p>
      
      {data && data.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
            レース {raceId} の出走馬
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse',
              backgroundColor: 'white',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f3f4f6' }}>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>馬番</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>馬名</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>指数</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>騎手</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>斤量</th>
                  <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>人気</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '0.75rem' }}>{row.horse_number}</td>
                    <td style={{ padding: '0.75rem' }}>{row.horse_name}</td>
                    <td style={{ padding: '0.75rem' }}>{row.index_value}</td>
                    <td style={{ padding: '0.75rem' }}>{row.jockey}</td>
                    <td style={{ padding: '0.75rem' }}>{row.jockey_weight}</td>
                    <td style={{ padding: '0.75rem' }}>{row.popularity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <details style={{ marginTop: '2rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '1rem' }}>
              最初の1件の詳細データ（JSON）
            </summary>
            <pre style={{ 
              backgroundColor: '#f5f5f5', 
              padding: '1rem', 
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '0.875rem'
            }}>
              {JSON.stringify(data[0], null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
