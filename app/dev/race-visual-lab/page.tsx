'use client';

/**
 * /dev/race-visual-lab — Visual Lab（開発専用）
 *
 * 本番 RaceSimulator3DProto とは完全に分離した、ビジュアル比較用のサンドボックス。
 * 3案（Broadcast Cel / Semi-Realistic / Data Visualization）を同一条件で見比べる。
 *
 * アクセス制御:
 *  - 開発環境（NODE_ENV !== 'production'）では常時アクセス可
 *  - 本番では ?debug=1 が付いた時のみ表示（それ以外はブロック）
 */
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const VisualLabScene = dynamic(() => import('@/app/components/visual-lab/VisualLabScene'), {
  ssr: false,
  loading: () => <div className="p-8 text-gray-500">Visual Lab 読み込み中...</div>,
});

export default function RaceVisualLabPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    const isDev = process.env.NODE_ENV !== 'production';
    const debug = new URLSearchParams(window.location.search).get('debug') === '1';
    setAllowed(isDev || debug);
  }, []);

  if (allowed === null) {
    return <div className="p-8 text-gray-500">...</div>;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md p-12 text-center">
        <h1 className="text-balance text-lg font-bold text-gray-800">404 - Not Found</h1>
        <p className="mt-2 text-pretty text-sm text-gray-500">
          この画面は開発専用です。本番環境では利用できません。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-4">
        <h1 className="text-balance text-xl font-bold text-gray-900">
          3D Race Visual Lab <span className="text-sm font-normal text-gray-500">（開発専用 / 本番未統合）</span>
        </h1>
        <p className="mt-1 text-pretty text-sm text-gray-600">
          同一条件（同頭数・同コース幅・同カメラ・同密集）で 3 案を比較します。timeline / race-dynamics /
          course-direction には一切依存しない固定 fixture を使用します。
        </p>
      </header>
      <VisualLabScene />
    </div>
  );
}
