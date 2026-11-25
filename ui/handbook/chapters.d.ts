export interface Lesson {
  id: string; title: string; level: string; idea: string;
  fig: object; body?: string; spot?: string[]; trap?: string; aka?: string;
}
export interface Chapter { id: string; title: string; intro: string; sections: Lesson[] }
export const CHAPTERS: Chapter[];
export const LEVELS: Record<string, string>;
export const CHEATSHEET: string[][];
