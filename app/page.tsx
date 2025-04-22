// app/page.tsx
'use client'

import { useState } from 'react'

export default function Home() {
  const [message, setMessage] = useState('出馬表表示テストページへようこそ！')

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem' }}>{message}</h1>
      <button
        onClick={() => setMessage('ボタンがクリックされました！')}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
        }}
      >
        ボタンを押す
      </button>
    </main>
  )
}
