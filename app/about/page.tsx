'use client';

import Link from 'next/link';

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        {/* ヘッダー */}
        <div className="mb-8">
          <Link 
            href="/"
            className="inline-flex items-center text-cyan-400 hover:text-cyan-300 transition mb-4"
          >
            <svg className="w-5 h-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            トップに戻る
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold text-cyan-400">
            RaceScore について
          </h1>
        </div>

        {/* コンテンツ */}
        <div className="space-y-8">
          {/* 概要 */}
          <section className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
            <h2 className="text-xl font-bold text-amber-400 mb-4">🏇 サービス概要</h2>
            <p className="text-slate-300 leading-relaxed">
              RaceScore は、競馬データを独自の指数で分析し、レース予想をサポートする Web アプリケーションです。
              過去走データ、ラップタイム、コース適性など多角的な視点から馬の能力を評価します。
            </p>
          </section>

          {/* 主な機能 */}
          <section className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
            <h2 className="text-xl font-bold text-amber-400 mb-4">⚡ 主な機能</h2>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-start">
                <span className="text-cyan-400 mr-2">•</span>
                <div>
                  <strong className="text-slate-100">俺AI分析</strong>
                  <p className="text-sm text-slate-400 mt-1">
                    独自ロジックによる能力評価、タイム比較、ラップ分析を提供
                  </p>
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-cyan-400 mr-2">•</span>
                <div>
                  <strong className="text-slate-100">T2F / L4F 指数</strong>
                  <p className="text-sm text-slate-400 mt-1">
                    前半2ハロン・後半4ハロンの独自指数で脚質を分析
                  </p>
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-cyan-400 mr-2">•</span>
                <div>
                  <strong className="text-slate-100">レースペース予測</strong>
                  <p className="text-sm text-slate-400 mt-1">
                    出走馬の脚質構成からペースを予測
                  </p>
                </div>
              </li>
              <li className="flex items-start">
                <span className="text-cyan-400 mr-2">•</span>
                <div>
                  <strong className="text-slate-100">過去走レベル判定</strong>
                  <p className="text-sm text-slate-400 mt-1">
                    過去レースの出走馬の次走成績からレースレベルを評価
                  </p>
                </div>
              </li>
            </ul>
          </section>

          {/* 指数の説明 */}
          <section className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
            <h2 className="text-xl font-bold text-amber-400 mb-4">📊 指数の見方</h2>
            <div className="space-y-4 text-slate-300">
              <div>
                <h3 className="font-bold text-cyan-400">T2F（Top 2 Furlong）</h3>
                <p className="text-sm text-slate-400">
                  前半2ハロン（約400m）での位置取り能力を示す指数。
                  値が高いほど先行力があります。
                </p>
              </div>
              <div>
                <h3 className="font-bold text-cyan-400">L4F（Last 4 Furlong）</h3>
                <p className="text-sm text-slate-400">
                  後半4ハロン（約800m）での末脚性能を示す指数。
                  値が高いほど強い末脚を持っています。
                </p>
              </div>
              <div>
                <h3 className="font-bold text-cyan-400">巻き返し指数</h3>
                <p className="text-sm text-slate-400">
                  不利があった際の巻き返し能力を示す指数。
                  高いほど展開不利からの巻き返し力が高いです。
                </p>
              </div>
            </div>
          </section>

          {/* 注意事項 */}
          <section className="bg-slate-900/50 rounded-lg p-6 border border-slate-800">
            <h2 className="text-xl font-bold text-amber-400 mb-4">⚠️ ご注意</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              本サービスの情報は参考として提供しており、馬券購入の最終判断はご自身の責任で行ってください。
              データの正確性については最善を尽くしておりますが、完全性を保証するものではありません。
            </p>
          </section>
        </div>

        {/* フッター */}
        <div className="mt-12 pt-6 border-t border-slate-800 text-center text-slate-500 text-sm">
          <p>© 2026 RaceScore. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
