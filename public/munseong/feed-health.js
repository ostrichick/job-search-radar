export const maximumFeedAgeMs = 24 * 60 * 60 * 1000;
export function feedHealth(updatedAt, now = Date.now()) {
  const timestamp = typeof updatedAt === 'string' ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(timestamp)) return { ok: false, message: '수집 시각을 확인할 수 없습니다. 지원 전 원문과 수집 상태를 확인하세요.' };
  if (timestamp > now + 5 * 60000) return { ok: false, message: '피드 수집 시각이 미래입니다. 수집 상태를 확인하세요.' };
  if (now - timestamp > maximumFeedAgeMs) return { ok: false, message: '24시간 이상 새 피드가 생성되지 않았습니다. 예약 수집이 중단됐을 수 있어 마지막 목록을 표시합니다.' };
  return { ok: true, message: '' };
}
