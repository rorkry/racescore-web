'use client';

import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';

interface TodayRace {
  place: string;
  raceNumber: string;
  className: string;
  trackType: string;
  distance: string;
  isGrade?: boolean;
}

// ログイン必要メッセージコンポーネント（useSearchParamsを使用）
function LoginRequiredBanner() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const loginRequired = searchParams.get('login_required') === 'true';
  
  if (!loginRequired || session) return null;
  
  return (
    <div className="bg-yellow-50 border-b border-yellow-200">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔐</span>
            <p className="text-yellow-800 font-medium">
              このページを見るにはログインが必要です
            </p>
          </div>
          <button
            onClick={() => signIn('google')}
            className="px-6 py-2 bg-white border border-yellow-400 text-yellow-800 rounded-lg font-bold hover:bg-yellow-100 transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Googleでログイン
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [todayRaces, setTodayRaces] = useState<TodayRace[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayDate, setTodayDate] = useState('');

  useEffect(() => {
    const fetchTodayRaces = async () => {
      try {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateStr = `${month}${day}`;
        setTodayDate(`${month}/${day}`);

        const res = await fetch(`/api/races?date=${dateStr}&year=${year}`);
        if (res.ok) {
          const data = await res.json();
          const races: TodayRace[] = [];
          
          for (const venue of data.venues || []) {
            for (const race of venue.races || []) {
              const isGrade = race.class_name?.includes('G1') || 
                             race.class_name?.includes('G2') || 
                             race.class_name?.includes('G3') ||
                             race.class_name?.includes('重賞');
              races.push({
                place: venue.place,
                raceNumber: race.race_number,
                className: race.class_name || '',
                trackType: race.track_type || '',
                distance: race.distance || '',
                isGrade,
              });
            }
          }
          
          races.sort((a, b) => {
            if (a.isGrade && !b.isGrade) return -1;
            if (!a.isGrade && b.isGrade) return 1;
            return parseInt(b.raceNumber) - parseInt(a.raceNumber);
          });
          
          setTodayRaces(races.slice(0, 6));
        }
      } catch (err) {
        console.error('Failed to fetch today races:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTodayRaces();
  }, []);

  return (
    <div className="min-h-screen">
      {/* ログイン必要メッセージ（Suspenseでラップ） */}
      <Suspense fallback={null}>
        <LoginRequiredBanner />
      </Suspense>
      
      {/* ヒーローセクション */}
      <section className="relative py-10 md:py-16 overflow-hidden">
        {/* 装飾 */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 left-10 w-72 h-72 bg-green-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-yellow-500/5 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-green-600/5 rounded-full blur-3xl"></div>
        </div>
        
        <div className="container mx-auto px-4 text-center relative z-10">
          {/* メインタイトル */}
          <div className="mb-6">
            <span className="inline-block px-4 py-2 rounded-full text-sm font-bold bg-green-700 text-white shadow-md mb-4">
              🏆 競馬データ分析プラットフォーム
            </span>
          </div>
          
          <h2 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 text-balance">
            <span className="text-green-800">データを、</span>
            <span className="gold-text">直感に。</span>
          </h2>
          
          <p className="text-lg md:text-xl text-gray-700 mb-10 max-w-2xl mx-auto leading-relaxed text-pretty">
            複雑な競馬データをビジュアル化。<br className="hidden md:block" />
            AI分析と独自スコアで、あなたの予想をサポートします。
          </p>
          
          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link 
              href="/card"
              className="w-full sm:w-auto px-8 py-4 btn-gold rounded-xl text-lg shadow-xl hover-lift"
            >
              🏇 今日のレースを見る
            </Link>
            <Link 
              href="/about"
              className="w-full sm:w-auto px-8 py-4 btn-turf rounded-xl text-lg hover-lift"
            >
              使い方を見る
            </Link>
          </div>
          
          {/* 統計 */}
          <div className="mt-10 grid grid-cols-3 gap-4 max-w-xl mx-auto">
            <div className="bg-white/80 rounded-xl p-4 shadow-md border border-gray-200">
              <div className="text-2xl md:text-3xl font-bold text-green-700 tabular-nums">7年+</div>
              <div className="text-xs text-gray-600 font-medium">データ蓄積</div>
            </div>
            <div className="bg-white/80 rounded-xl p-4 shadow-md border border-gray-200">
              <div className="text-2xl md:text-3xl font-bold text-green-700 tabular-nums">AI</div>
              <div className="text-xs text-gray-600 font-medium">展開予想</div>
            </div>
            <div className="bg-white/80 rounded-xl p-4 shadow-md border border-gray-200">
              <div className="text-2xl md:text-3xl font-bold text-green-700 tabular-nums">6指数</div>
              <div className="text-xs text-gray-600 font-medium">独自分析</div>
            </div>
          </div>
        </div>
      </section>
      
      {/* 今日の注目レース */}
      <section className="py-10 md:py-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h3 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2 text-balance">
              {todayDate ? `${todayDate}` : '今日'} の注目レース
            </h3>
            <div className="w-24 h-1 gold-gradient mx-auto rounded-full"></div>
          </div>
          
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block size-12 border-4 border-green-700 border-t-gold-500 rounded-full animate-spin"></div>
              <p className="mt-4 text-gray-500">レース情報を取得中...</p>
            </div>
          ) : todayRaces.length > 0 ? (
            <div className="max-w-4xl mx-auto grid gap-4">
              {todayRaces.map((race, idx) => (
                <Link 
                  key={`${race.place}-${race.raceNumber}`}
                  href="/card"
                  className={`bg-white rounded-xl p-5 block shadow-md border hover:shadow-lg transition-shadow ${
                    race.isGrade ? 'border-yellow-500' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`size-12 rounded-lg flex items-center justify-center ${
                        race.isGrade 
                          ? 'gold-gradient' 
                          : 'bg-green-100 border border-green-200'
                      }`}>
                        <span className="text-xl">{race.isGrade ? '👑' : '🏇'}</span>
                      </div>
                      <div>
                        <h4 className="font-bold text-lg text-gray-800">
                          {race.place} {race.raceNumber}R
                          {race.className && (
                            <span className="ml-2 text-gray-600">{race.className}</span>
                          )}
                        </h4>
                        <p className="text-sm text-gray-500">
                          {race.trackType}{race.distance}m
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {race.isGrade && (
                        <span className="px-3 py-1 rounded-full text-xs font-bold gold-gradient text-green-900">
                          重賞
                        </span>
                      )}
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-700 text-white">
                        AI分析
                      </span>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
              
              <Link 
                href="/card"
                className="text-center py-4 text-green-700 hover:text-green-800 font-bold transition flex items-center justify-center gap-2"
              >
                全レースを見る
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl max-w-md mx-auto shadow-md border border-gray-200">
              <div className="text-4xl mb-4">🌙</div>
              <p className="text-gray-600 mb-4">本日のレースデータはありません</p>
              <Link 
                href="/card"
                className="inline-block px-6 py-2 btn-turf rounded-lg text-sm"
              >
                過去のレースを見る
              </Link>
            </div>
          )}
        </div>
      </section>
      
      {/* 特徴セクション */}
      <section className="py-10 md:py-14 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h3 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2 text-balance">
              ストライドの特徴
            </h3>
            <div className="w-24 h-1 gold-gradient mx-auto rounded-full"></div>
          </div>
          
          <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-6">
            {/* 特徴1 */}
            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-shadow">
              <div className="size-14 rounded-xl gold-gradient flex items-center justify-center mb-5 shadow-lg">
                <span className="text-2xl">📊</span>
              </div>
              <h4 className="font-bold text-lg text-gray-800 mb-3 text-balance">独自スコアで一目で分かる</h4>
              <p className="text-gray-600 text-sm leading-relaxed text-pretty">
                複雑な数字を「競うスコア」「ポテンシャル」「巻き返し指数」で視覚化。初心者でも直感的に理解できます。
              </p>
            </div>
            
            {/* 特徴2 */}
            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-shadow">
              <div className="size-14 rounded-xl gold-gradient flex items-center justify-center mb-5 shadow-lg">
                <span className="text-2xl">🧠</span>
              </div>
              <h4 className="font-bold text-lg text-gray-800 mb-3 text-balance">AI分析で多角的に評価</h4>
              <p className="text-gray-600 text-sm leading-relaxed text-pretty">
                過去のレースデータから学習したAIが、コース適性・ローテーション・展開を総合的に分析します。
              </p>
            </div>
            
            {/* 特徴3 */}
            <div className="bg-white rounded-xl p-6 shadow-md border border-gray-100 hover:shadow-lg transition-shadow">
              <div className="size-14 rounded-xl gold-gradient flex items-center justify-center mb-5 shadow-lg">
                <span className="text-2xl">🎯</span>
              </div>
              <h4 className="font-bold text-lg text-gray-800 mb-3 text-balance">展開予想を可視化</h4>
              <p className="text-gray-600 text-sm leading-relaxed text-pretty">
                スタート後とゴール前の隊列を予測。レース展開が視覚的に分かり、戦略が立てやすくなります。
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* 使い方セクション */}
      <section className="py-10 md:py-14 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h3 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2 text-balance">
              かんたん3ステップ
            </h3>
            <div className="w-24 h-1 gold-gradient mx-auto rounded-full"></div>
          </div>
          
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { num: '01', title: 'レースを選ぶ', desc: '日付と競馬場を選択して、見たいレースを選びます', icon: '📅' },
                { num: '02', title: 'スコアを確認', desc: '競うスコアや各種指数で馬の実力を把握します', icon: '📈' },
                { num: '03', title: '展開を予想', desc: 'AI展開予想で隊列をチェック、予想に活かします', icon: '🎯' },
              ].map((step, idx) => (
                <div key={idx} className="text-center relative">
                  {idx < 2 && (
                    <div className="hidden md:block absolute top-8 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-green-300 to-transparent"></div>
                  )}
                  <div className="relative z-10">
                    <div className="size-16 rounded-full gold-gradient flex items-center justify-center mx-auto mb-4 shadow-xl">
                      <span className="text-2xl">{step.icon}</span>
                    </div>
                    <div className="text-xs text-yellow-600 font-bold mb-2 tabular-nums">STEP {step.num}</div>
                    <h4 className="font-bold text-lg text-gray-800 mb-2 text-balance">{step.title}</h4>
                    <p className="text-gray-600 text-sm text-pretty">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="text-center mt-8">
              <Link 
                href="/card"
                className="inline-block px-10 py-4 btn-gold rounded-xl text-lg shadow-xl hover-lift"
              >
                🏇 さっそく使ってみる
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
