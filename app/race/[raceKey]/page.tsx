'use client';

import { useEffect, useState } from 'react';

export default function RacePage({ params }: { params: { raceKey: string } }) {
  const { raceKey } = params;
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/odds/${raceKey}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [raceKey]);

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!data)  return <p>Loading...</p>;

  return (
    <main style={{ padding: '1rem' }}>
      <h1 style={{ fontWeight: 'bold', marginBottom: '1rem' }}>
        Race Key: {raceKey}
      </h1>
      <pre style={{ whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </main>
  );
}
