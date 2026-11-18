export type SupportedLocale = 'en' | 'vi' | 'ko' | 'zh';

export interface StateInfo {
  code: string;
  name: string;
  vi: string;
  ko: string;
  zh: string;
}

export const US_STATES_MAP: Record<string, StateInfo> = {
  AL: { code: 'AL', name: 'Alabama', vi: 'Alabama', ko: '앨라배마', zh: '阿拉巴马州' },
  AK: { code: 'AK', name: 'Alaska', vi: 'Alaska', ko: '알래스카', zh: '阿拉斯加州' },
  AZ: { code: 'AZ', name: 'Arizona', vi: 'Arizona', ko: '애리조나', zh: '亚利桑那州' },
  AR: { code: 'AR', name: 'Arkansas', vi: 'Arkansas', ko: '아칸소', zh: '阿肯色州' },
  CA: { code: 'CA', name: 'California', vi: 'California', ko: '캘리포니아', zh: '加利福尼亚州' },
  CO: { code: 'CO', name: 'Colorado', vi: 'Colorado', ko: '콜로라도', zh: '科罗拉多州' },
  CT: { code: 'CT', name: 'Connecticut', vi: 'Connecticut', ko: '코네티컷', zh: '康涅狄格州' },
  DE: { code: 'DE', name: 'Delaware', vi: 'Delaware', ko: '델라웨어', zh: '特拉华州' },
  DC: { code: 'DC', name: 'Washington, D.C.', vi: 'Washington, D.C.', ko: '워싱턴 D.C.', zh: '华盛顿特区' },
  FL: { code: 'FL', name: 'Florida', vi: 'Florida', ko: '플로리다', zh: '佛罗里达州' },
  GA: { code: 'GA', name: 'Georgia', vi: 'Georgia', ko: '조지아', zh: '佐治亚州' },
  HI: { code: 'HI', name: 'Hawaii', vi: 'Hawaii', ko: '하와이', zh: '夏威夷州' },
  ID: { code: 'ID', name: 'Idaho', vi: 'Idaho', ko: '아이다호', zh: '爱达荷州' },
  IL: { code: 'IL', name: 'Illinois', vi: 'Illinois', ko: '일리노이', zh: '伊利诺伊州' },
  IN: { code: 'IN', name: 'Indiana', vi: 'Indiana', ko: '인디애나', zh: '印第安纳州' },
  IA: { code: 'IA', name: 'Iowa', vi: 'Iowa', ko: '아이오와', zh: '艾奥瓦州' },
  KS: { code: 'KS', name: 'Kansas', vi: 'Kansas', ko: '캔자스', zh: '堪萨斯州' },
  KY: { code: 'KY', name: 'Kentucky', vi: 'Kentucky', ko: '켄터키', zh: '肯塔基州' },
  LA: { code: 'LA', name: 'Louisiana', vi: 'Louisiana', ko: '루이지애나', zh: '路易斯安那州' },
  ME: { code: 'ME', name: 'Maine', vi: 'Maine', ko: '메인', zh: '缅因州' },
  MD: { code: 'MD', name: 'Maryland', vi: 'Maryland', ko: '메릴랜드', zh: '马里兰州' },
  MA: { code: 'MA', name: 'Massachusetts', vi: 'Massachusetts', ko: '매사추세츠', zh: '马萨诸塞州' },
  MI: { code: 'MI', name: 'Michigan', vi: 'Michigan', ko: '미시간', zh: '密歇根州' },
  MN: { code: 'MN', name: 'Minnesota', vi: 'Minnesota', ko: '미네소타', zh: '明尼苏达州' },
  MS: { code: 'MS', name: 'Mississippi', vi: 'Mississippi', ko: '미시시피', zh: '密西西比州' },
  MO: { code: 'MO', name: 'Missouri', vi: 'Missouri', ko: '미주리', zh: '密苏里州' },
  MT: { code: 'MT', name: 'Montana', vi: 'Montana', ko: '몬태나', zh: '蒙大拿州' },
  NE: { code: 'NE', name: 'Nebraska', vi: 'Nebraska', ko: '네브래스카', zh: '内布拉斯加州' },
  NV: { code: 'NV', name: 'Nevada', vi: 'Nevada', ko: '네바다', zh: '内华达州' },
  NH: { code: 'NH', name: 'New Hampshire', vi: 'New Hampshire', ko: '뉴햄프셔', zh: '新罕布什尔州' },
  NJ: { code: 'NJ', name: 'New Jersey', vi: 'New Jersey', ko: '뉴저지', zh: '新泽西州' },
  NM: { code: 'NM', name: 'New Mexico', vi: 'New Mexico', ko: '뉴멕시코', zh: '新墨西哥州' },
  NY: { code: 'NY', name: 'New York', vi: 'New York', ko: '뉴욕', zh: '纽约州' },
  NC: { code: 'NC', name: 'North Carolina', vi: 'North Carolina', ko: '노스캐롤라이나', zh: '北卡罗来纳州' },
  ND: { code: 'ND', name: 'North Dakota', vi: 'North Dakota', ko: '노스다코타', zh: '北达科他州' },
  OH: { code: 'OH', name: 'Ohio', vi: 'Ohio', ko: '오하이오', zh: '俄亥俄州' },
  OK: { code: 'OK', name: 'Oklahoma', vi: 'Oklahoma', ko: '오클라호마', zh: '俄克拉荷马州' },
  OR: { code: 'OR', name: 'Oregon', vi: 'Oregon', ko: '오리건', zh: '俄勒冈州' },
  PA: { code: 'PA', name: 'Pennsylvania', vi: 'Pennsylvania', ko: '펜실베이니아', zh: '宾夕法尼亚州' },
  RI: { code: 'RI', name: 'Rhode Island', vi: 'Rhode Island', ko: '로드아일랜드', zh: '罗得岛州' },
  SC: { code: 'SC', name: 'South Carolina', vi: 'South Carolina', ko: '사우스캐롤라이나', zh: '南卡罗来纳州' },
  SD: { code: 'SD', name: 'South Dakota', vi: 'South Dakota', ko: '사우스다코타', zh: '南达科他州' },
  TN: { code: 'TN', name: 'Tennessee', vi: 'Tennessee', ko: '테네시', zh: '田纳西州' },
  TX: { code: 'TX', name: 'Texas', vi: 'Texas', ko: '텍사스', zh: '得克萨斯州' },
  UT: { code: 'UT', name: 'Utah', vi: 'Utah', ko: '유타', zh: '犹他州' },
  VT: { code: 'VT', name: 'Vermont', vi: 'Vermont', ko: '버몬트', zh: '佛蒙特州' },
  VA: { code: 'VA', name: 'Virginia', vi: 'Virginia', ko: '버지니아', zh: '弗吉尼亚州' },
  WA: { code: 'WA', name: 'Washington', vi: 'Washington', ko: '워싱턴', zh: '华盛顿州' },
  WV: { code: 'WV', name: 'West Virginia', vi: 'West Virginia', ko: '웨스트버지니아', zh: '西弗吉尼亚州' },
  WI: { code: 'WI', name: 'Wisconsin', vi: 'Wisconsin', ko: '위스콘신', zh: '威斯康星州' },
  WY: { code: 'WY', name: 'Wyoming', vi: 'Wyoming', ko: '와이오밍', zh: '怀俄明州' },
};

const BY_NAME = new Map<string, StateInfo>();
for (const info of Object.values(US_STATES_MAP)) {
  BY_NAME.set(info.code.toLowerCase(), info);
  BY_NAME.set(info.name.toLowerCase(), info);
}

/** Normalize a raw state ("TX", "Texas", "tx") to its 2-letter US code, or null. */
export function normalizeStateCode(raw?: string | null): string | null {
  const cleaned = (raw ?? '').trim();
  if (!cleaned) return null;
  const hit = BY_NAME.get(cleaned.toLowerCase());
  if (hit) return hit.code;
  if (/^[A-Za-z]{2}$/.test(cleaned)) return cleaned.toUpperCase();
  return null;
}

/** Display name for a state code ("TX" -> "Texas" in en/vi, "텍사스" in ko, "得克萨斯州" in zh). */
export function getStateName(codeOrName?: string | null, locale: SupportedLocale = 'en'): string {
  const code = normalizeStateCode(codeOrName);
  const info = code ? US_STATES_MAP[code] : undefined;
  if (!info) return (codeOrName ?? '').trim();
  if (locale === 'ko') return info.ko;
  if (locale === 'zh') return info.zh;
  if (locale === 'vi') return info.vi;
  return info.name;
}

/** Formatted label with code, e.g. "Texas (TX)" or "텍사스 (TX)". */
export function getStateLabel(codeOrName?: string | null, locale: SupportedLocale = 'en'): string {
  const code = normalizeStateCode(codeOrName);
  const info = code ? US_STATES_MAP[code] : undefined;
  if (!info) return (codeOrName ?? '').trim();
  const name = getStateName(code, locale);
  return `${name} (${info.code})`;
}
