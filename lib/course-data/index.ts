/**
 * コースデータベース
 * 
 * 全106コースのデータを提供
 */

import type { CourseCharacteristics } from '@/types/course-characteristics';
import { TURF_COURSES_A_B } from './turf-courses-ab';
import { TURF_COURSES_C } from './turf-courses-c';
import { DIRT_COURSES } from './dirt-courses';

// 全コースを統合
export const COURSE_DATABASE: Record<string, CourseCharacteristics> = {
  ...TURF_COURSES_A_B,
  ...TURF_COURSES_C,
  ...DIRT_COURSES,
};

/**
 * コース情報を取得
 */
export function getCourseData(
  racecourse: string,
  surface: '芝' | 'ダート',
  distance: number,
  trackSize?: '内' | '外'
): CourseCharacteristics | null {
  let courseId = `${racecourse}_${surface}_${distance}`;
  if (trackSize) {
    courseId = `${racecourse}_${surface}_${distance}_${trackSize}`;
  }
  
  return COURSE_DATABASE[courseId] || null;
}

/**
 * 全コース数を取得
 */
export function getCourseCount(): number {
  return Object.keys(COURSE_DATABASE).length;
}

/**
 * パターン別コース数を取得
 */
export function getPatternStats(): Record<string, number> {
  const stats: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
  
  for (const course of Object.values(COURSE_DATABASE)) {
    const pattern = course.coursePattern;
    if (pattern in stats) {
      stats[pattern]++;
    }
  }
  
  return stats;
}




