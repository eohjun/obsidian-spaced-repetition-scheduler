/**
 * Note ID Utility
 * Vault Embeddings 플러그인과 호환되는 hash 기반 noteId 생성
 *
 * ⚠️ CRITICAL: 이 함수는 Vault Embeddings의 generateNoteId와 동일해야 함
 */

/**
 * 문자열을 8자리 16진수 해시로 변환
 * @param str 해시할 문자열
 * @returns 8자리 16진수 문자열
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // 32bit 정수로 변환
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * 파일 경로에서 Vault Embeddings 호환 noteId 생성
 *
 * @example
 * generateNoteId('04_Zettelkasten/인지 편향.md')
 * // → 'a1b2c3d4' (8자리 해시)
 *
 * @param path 파일 경로 (.md 확장자 포함)
 * @returns 8자리 16진수 noteId
 */
export function generateNoteId(path: string): string {
  // .md 확장자 제거 후 해시
  const pathWithoutExt = path.replace(/\.md$/, '');
  return simpleHash(pathWithoutExt);
}

/**
 * noteId를 파일 시스템에서 안전하게 사용할 수 있는 형태로 변환
 * 특수문자를 언더스코어로 치환
 *
 * @param noteId 원본 noteId
 * @returns 파일 시스템 안전한 ID
 */
export function toSafeId(noteId: string): string {
  return noteId.replace(/[^a-zA-Z0-9-_]/g, '_');
}

/**
 * 파일 경로에서 노트 제목 추출
 *
 * @example
 * extractNoteTitle('04_Zettelkasten/인지 편향.md')
 * // → '인지 편향'
 *
 * @param path 파일 경로
 * @returns 노트 제목 (확장자 제외)
 */
export function extractNoteTitle(path: string): string {
  const parts = path.split(/[/\\]/);
  const filename = parts[parts.length - 1];
  return filename.replace(/\.md$/, '');
}
