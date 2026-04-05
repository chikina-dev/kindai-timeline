export type DayOfWeek = "月" | "火" | "水" | "木" | "金" | "土" | "日";

export type Category = "共通教養" | "外国語" | "専門";

export type Feature = "KICSオンデマンド" | "メディア授業" | "専門科目オンデマンド";

export type Requirement =
  | "必修科目"
  | "選択必修科目"
  | "選択科目"
  | "自由選択科目";

export type Semester = "前期" | "後期";

export const DAYS: DayOfWeek[] = ["月", "火", "水", "木", "金", "土", "日"];
export const PERIODS = [1, 2, 3, 4, 5, 6];
export const CATEGORIES: Category[] = ["共通教養", "外国語", "専門"];
export const FEATURES: Feature[] = [
  "KICSオンデマンド",
  "メディア授業",
  "専門科目オンデマンド",
];
export const REQUIREMENTS: Requirement[] = [
  "必修科目",
  "選択必修科目",
  "選択科目",
  "自由選択科目",
];
export const SEMESTERS: Semester[] = ["前期", "後期"];

const DAY_SET = new Set<DayOfWeek>(DAYS);
const CATEGORY_SET = new Set<Category>(CATEGORIES);
const FEATURE_SET = new Set<Feature>(FEATURES);
const REQUIREMENT_SET = new Set<Requirement>(REQUIREMENTS);

export function isDayOfWeek(value: string): value is DayOfWeek {
  return DAY_SET.has(value as DayOfWeek);
}

export function isCategory(value: string): value is Category {
  return CATEGORY_SET.has(value as Category);
}

export function isFeature(value: string): value is Feature {
  return FEATURE_SET.has(value as Feature);
}

export function isRequirement(value: string): value is Requirement {
  return REQUIREMENT_SET.has(value as Requirement);
}