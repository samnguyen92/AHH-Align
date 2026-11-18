import type { SupportedLocale } from '@/lib/states';
import type { ClinicMetadata, HighlightItem, ServiceOffering, ClinicFaq } from '@/types/database';

export type { SupportedLocale };

export const LOCALE_COOKIE = 'ahh_locale';

export const LOCALES: { code: SupportedLocale; label: string; short: string; htmlLang: string }[] = [
  { code: 'en', label: 'English', short: 'EN', htmlLang: 'en' },
  { code: 'vi', label: 'Tiếng Việt', short: 'VI', htmlLang: 'vi' },
  { code: 'ko', label: '한국어', short: 'KO', htmlLang: 'ko' },
  { code: 'zh', label: '中文', short: '中文', htmlLang: 'zh' },
];

export function parseLocale(raw?: string | null): SupportedLocale {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'vi' || v.startsWith('vi-')) return 'vi';
  if (v === 'ko' || v.startsWith('ko-')) return 'ko';
  if (v === 'zh' || v.startsWith('zh-')) return 'zh';
  return 'en';
}

export const SPECIALTY_TRANSLATIONS: Record<string, Record<SupportedLocale, { name: string; blurb: string }>> = {
  'Primary Care': {
    en: { name: 'Primary Care', blurb: 'Check-ups, chronic care, referrals' },
    vi: { name: 'Nội tổng quát & Bác sĩ gia đình', blurb: 'Khám tổng quát, bệnh mãn tính, chuyển tuyến' },
    ko: { name: '일차 진료 (내과·가정의학과)', blurb: '정기 검진, 만성 질환 관리, 전문의 의뢰' },
    zh: { name: '全科与家庭医学', blurb: '年度体检、慢病管理、专科转诊' },
  },
  'Family Medicine': {
    en: { name: 'Family Medicine', blurb: 'Comprehensive care for all ages' },
    vi: { name: 'Y học gia đình', blurb: 'Chăm sóc sức khỏe cho mọi lứa tuổi' },
    ko: { name: '가정의학과', blurb: '온 가족을 위한 종합 진료' },
    zh: { name: '家庭医学科', blurb: '适合全家各年龄段的综合医疗' },
  },
  'Internal Medicine': {
    en: { name: 'Internal Medicine', blurb: 'Adult primary and complex care' },
    vi: { name: 'Nội khoa', blurb: 'Khám và điều trị bệnh nội khoa người lớn' },
    ko: { name: '내과', blurb: '성인 질환 진단 및 치료' },
    zh: { name: '内科', blurb: '成人常见病与慢性病诊疗' },
  },
  Dental: {
    en: { name: 'Dental', blurb: 'Cleanings, fillings, orthodontics' },
    vi: { name: 'Nha khoa', blurb: 'Cạo vôi, trám răng, cấy ghép & chỉnh nha' },
    ko: { name: '치과', blurb: '스케일링, 충치 치료, 임플란트·교정' },
    zh: { name: '牙科', blurb: '洗牙、补牙、种植牙与正畸' },
  },
  'Acupuncture & TCM': {
    en: { name: 'Acupuncture & TCM', blurb: 'Acupuncture, herbal medicine, pain relief' },
    vi: { name: 'Châm cứu & Đông y', blurb: 'Châm cứu, thuốc Đông y, giảm đau & phục hồi' },
    ko: { name: '침술 및 한의학', blurb: '침 치료, 한약 처방, 통증·체질 관리' },
    zh: { name: '针灸与中医', blurb: '针灸理疗、中药调理、疼痛与康复' },
  },
  'Mental Health': {
    en: { name: 'Mental Health', blurb: 'Counseling and psychiatry' },
    vi: { name: 'Sức khỏe tâm thần', blurb: 'Tư vấn tâm lý và bác sĩ tâm thần' },
    ko: { name: '정신건강의학과·심리상담', blurb: '심리 상담 및 정신건강 진료' },
    zh: { name: '心理与精神健康', blurb: '心理咨询与精神科诊疗' },
  },
  'OB/GYN': {
    en: { name: 'OB/GYN', blurb: 'Pregnancy and women’s health' },
    vi: { name: 'Sản phụ khoa (OB/GYN)', blurb: 'Thai sản và chăm sóc sức khỏe phụ nữ' },
    ko: { name: '산부인과', blurb: '임신·출산 및 여성 건강 진료' },
    zh: { name: '妇产科 (OB/GYN)', blurb: '孕产护理与女性健康管理' },
  },
  Pediatrics: {
    en: { name: 'Pediatrics', blurb: 'Babies, kids and teens' },
    vi: { name: 'Nhi khoa', blurb: 'Khám cho trẻ sơ sinh, trẻ nhỏ và thiếu niên' },
    ko: { name: '소아청소년과', blurb: '영유아·어린이·청소년 진료 및 예방접종' },
    zh: { name: '儿科', blurb: '婴幼儿与青少年健康及疫苗接种' },
  },
  Cardiology: {
    en: { name: 'Cardiology', blurb: 'Heart and blood pressure' },
    vi: { name: 'Tim mạch', blurb: 'Khám tim mạch và huyết áp' },
    ko: { name: '심장내과', blurb: '심혈관 질환 및 고혈압 관리' },
    zh: { name: '心脏科', blurb: '心血管与高血压专科诊疗' },
  },
  Ophthalmology: {
    en: { name: 'Ophthalmology', blurb: 'Eye exams and eye surgery' },
    vi: { name: 'Nhãn khoa (Mắt)', blurb: 'Khám mắt, đo thị lực và phẫu thuật mắt' },
    ko: { name: '안과·검안과', blurb: '시력 검사, 안질환 진료 및 수술' },
    zh: { name: '眼科与视光', blurb: '视力检查、眼病诊治与眼科手术' },
  },
  Optometry: {
    en: { name: 'Optometry', blurb: 'Vision exams, glasses and contact lenses' },
    vi: { name: 'Khúc xạ & Đo mắt', blurb: 'Đo thị lực, cắt kính và kính áp tròng' },
    ko: { name: '검안과', blurb: '시력 검사, 안경 및 콘택트렌즈 처방' },
    zh: { name: '视光科', blurb: '验光配镜与隐形眼镜检查' },
  },
  Dermatology: {
    en: { name: 'Dermatology', blurb: 'Skin, hair and nails' },
    vi: { name: 'Da liễu', blurb: 'Khám và điều trị da, tóc, móng' },
    ko: { name: '피부과', blurb: '피부·모발·손발톱 질환 및 치료' },
    zh: { name: '皮肤科', blurb: '皮肤、毛发与指甲疾病诊疗' },
  },
  Orthopedics: {
    en: { name: 'Orthopedics', blurb: 'Bones, joints and sports injuries' },
    vi: { name: 'Chấn thương chỉnh hình & Cơ xương khớp', blurb: 'Xương khớp, cột sống và chấn thương thể thao' },
    ko: { name: '정형외과', blurb: '뼈·관절·척추 및 스포츠 손상 치료' },
    zh: { name: '骨科与运动医学', blurb: '骨骼、关节、脊椎与运动损伤' },
  },
  'Community Health Center': {
    en: { name: 'Community Health Center', blurb: 'Multilingual community care and sliding-scale fees' },
    vi: { name: 'Trung tâm Y tế Cộng đồng', blurb: 'Chăm sóc đa ngôn ngữ, hỗ trợ chi phí theo thu nhập' },
    ko: { name: '커뮤니티 보건소', blurb: '다국어 지원 및 소득 연동 진료비 혜택' },
    zh: { name: '社区医疗中心', blurb: '多语言社区医疗与阶梯收费支持' },
  },
  Hospital: {
    en: { name: 'Hospital', blurb: 'Inpatient, emergency and specialty care' },
    vi: { name: 'Bệnh viện', blurb: 'Nội trú, cấp cứu và đa chuyên khoa' },
    ko: { name: '종합병원', blurb: '입원·응급 및 전문 진료' },
    zh: { name: '综合医院', blurb: '住院、急诊与多专科医疗' },
  },
  'Urgent Care': {
    en: { name: 'Urgent Care', blurb: 'Same-day walk-in care' },
    vi: { name: 'Khám khẩn cấp (Urgent Care)', blurb: 'Khám nhanh trong ngày không cần hẹn trước' },
    ko: { name: '긴급 진료 (Urgent Care)', blurb: '예약 없이 당일 방문 가능한 진료' },
    zh: { name: '急诊门诊 (Urgent Care)', blurb: '无需预约的当日快速门诊' },
  },
};

export function translateSpecialty(spec?: string | null, locale: SupportedLocale = 'en'): string {
  const s = (spec ?? '').trim();
  if (!s || locale === 'en') return s;
  const exact = SPECIALTY_TRANSLATIONS[s];
  if (exact) return exact[locale].name;
  for (const [k, v] of Object.entries(SPECIALTY_TRANSLATIONS)) {
    if (k.toLowerCase() === s.toLowerCase()) return v[locale].name;
  }
  return s;
}

export function translateSpecialtyBlurb(spec: string, fallback: string, locale: SupportedLocale = 'en'): string {
  const exact = SPECIALTY_TRANSLATIONS[spec];
  if (exact) return exact[locale].blurb;
  return fallback;
}

export const LANGUAGE_LABELS: Record<string, Record<SupportedLocale, string>> = {
  English: { en: 'English', vi: 'Tiếng Anh', ko: '영어', zh: '英语' },
  Vietnamese: { en: 'Vietnamese', vi: 'Tiếng Việt', ko: '베트남어', zh: '越南语' },
  Korean: { en: 'Korean', vi: 'Tiếng Hàn', ko: '한국어', zh: '韩语' },
  Chinese: { en: 'Chinese', vi: 'Tiếng Trung', ko: '중국어', zh: '中文' },
  Mandarin: { en: 'Mandarin', vi: 'Tiếng Phổ thông (Mandarin)', ko: '중국어 북경어 (Mandarin)', zh: '普通话 / 国语' },
  Cantonese: { en: 'Cantonese', vi: 'Tiếng Quảng Đông (Cantonese)', ko: '중국어 광동어 (Cantonese)', zh: '粤语 / 广东话' },
  Toisanese: { en: 'Toisanese', vi: 'Tiếng Đài Sơn', ko: '타이산어', zh: '台山话' },
  Hokkien: { en: 'Hokkien', vi: 'Tiếng Phúc Kiến / Đài Loan', ko: '민남어·대만어', zh: '闽南语 / 台语' },
  Fuzhounese: { en: 'Fuzhounese', vi: 'Tiếng Phúc Châu', ko: '푸저우어', zh: '福州话' },
  Japanese: { en: 'Japanese', vi: 'Tiếng Nhật', ko: '일본어', zh: '日语' },
  Tagalog: { en: 'Tagalog', vi: 'Tiếng Tagalog (Philippines)', ko: '타갈로그어', zh: '他加禄语' },
  Hindi: { en: 'Hindi', vi: 'Tiếng Hindi', ko: '힌디어', zh: '印地语' },
  Thai: { en: 'Thai', vi: 'Tiếng Thái', ko: '태국어', zh: '泰语' },
  Spanish: { en: 'Spanish', vi: 'Tiếng Tây Ban Nha', ko: '스페인어', zh: '西班牙语' },
};

export function translateLanguage(lang?: string | null, locale: SupportedLocale = 'en'): string {
  const key = (lang ?? '').trim();
  if (!key) return '';
  return LANGUAGE_LABELS[key]?.[locale] ?? key;
}

export const DAY_LABELS: Record<string, Record<SupportedLocale, string>> = {
  monday: { en: 'Mon', vi: 'Thứ 2', ko: '월', zh: '周一' },
  tuesday: { en: 'Tue', vi: 'Thứ 3', ko: '화', zh: '周二' },
  wednesday: { en: 'Wed', vi: 'Thứ 4', ko: '수', zh: '周三' },
  thursday: { en: 'Thu', vi: 'Thứ 5', ko: '목', zh: '周四' },
  friday: { en: 'Fri', vi: 'Thứ 6', ko: '금', zh: '周五' },
  saturday: { en: 'Sat', vi: 'Thứ 7', ko: '토', zh: '周六' },
  sunday: { en: 'Sun', vi: 'CN', ko: '일', zh: '周日' },
};

export interface ClinicLocalizedContent {
  short_description?: string;
  description?: string;
  about_highlight?: string;
  language_note?: string;
  cultural_context?: string;
  review_summary?: string;
  what_to_know?: HighlightItem[];
  differentiators?: HighlightItem[];
  before_you_book?: HighlightItem[];
  services_offered?: ServiceOffering[];
  faqs?: ClinicFaq[];
}

/** Pick localized clinic text from metadata.i18n[locale] when available, falling back cleanly. */
export function getLocalizedClinicData(meta?: ClinicMetadata | null, locale: SupportedLocale = 'en'): ClinicLocalizedContent {
  if (!meta || locale === 'en') return {};
  const i18nMap = (meta as Record<string, unknown>).i18n as Partial<Record<SupportedLocale, ClinicLocalizedContent>> | undefined;
  return i18nMap?.[locale] ?? {};
}

export { UI_STRINGS, getUiStrings, type UiDictionary } from './strings';
