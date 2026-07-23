/**
 * HUD 表示条件（純粋・テスト可能）
 *
 * production 通常URLでは DEBUG 系を非表示。
 * production でも ?debug=1 のときのみ表示可能。
 * development では表示してよい。
 *
 * NODE_ENV だけに依存せず、URL の debug パラメータも判定する。
 */

export interface HudVisibilityEnv {
  /** process.env.NODE_ENV 相当 */
  nodeEnv?: string;
  /** window.location.search 相当（"?debug=1" など） */
  search?: string;
}

export function shouldShowDebugHud(env: HudVisibilityEnv): boolean {
  const nodeEnv = env.nodeEnv ?? '';
  // development / test 等 production 以外は表示
  if (nodeEnv !== 'production') return true;
  // production は ?debug=1 のときだけ
  const search = env.search ?? '';
  try {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return params.get('debug') === '1';
  } catch {
    return false;
  }
}
