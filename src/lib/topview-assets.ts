/** 공개 화면에서 사용할 수 있는 현재 게임 설치본 기반 탑뷰만 노출한다. */
import topviewData from '../data/curated/topview-assets.json' with { type: 'json' };

export const RUNTIME_TOPVIEW_SOURCE = 'game-install-cl-502094';

export type TopviewAsset = (typeof topviewData.assets)[number];

export function isRuntimeTopviewAsset(asset: TopviewAsset): boolean {
  return asset.sourceId === RUNTIME_TOPVIEW_SOURCE && asset.reviewStatus === 'approved';
}

export const topviewAssets = topviewData.assets;
export const runtimeTopviewAssets = topviewAssets.filter(isRuntimeTopviewAsset);
