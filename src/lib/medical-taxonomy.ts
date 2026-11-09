/**
 * medical-taxonomy.ts — Track A & D: Multilingual Symptom, Treatment, Language & Insurance Intent Mapper.
 *
 * Maps everyday patient queries (English, Vietnamese, Korean, Chinese) to canonical
 * specialties, languages, insurance buckets, and deep search tokens.
 */

export interface ResolvedSearchIntent {
  rawQuery: string;
  matchedSpecialties: string[];
  matchedLanguage?: string;
  matchedInsurance?: string;
  searchTerms: string[];
}

interface SpecialtyIntentRule {
  specialties: string[];
  patterns: RegExp[];
}

const SPECIALTY_INTENT_RULES: SpecialtyIntentRule[] = [
  {
    specialties: ['Dental'],
    patterns: [
      /\b(dentist|dental|orthodont\w*|periodont\w*|endodont\w*|implant\w*|root\s*canal|crown\w*|veneer\w*|tooth\w*|teeth|braces|invisalign|cavity|extraction|wisdom\s*tooth|whitening|denture\w*)\b/i,
      /(nha\s*khoa|nha\s*sĩ|răng|trồng\s*răng|nhổ\s*răng|niềng\s*răng|tẩy\s*trắng|đau\s*răng)/i,
      /(치과|치과의사|임플란트|교정|사랑니|충치|스케일링)/,
      /(牙医|牙科|种植牙|拔牙|洗牙|根管|正畸|牙齿|牙痛)/,
    ],
  },
  {
    specialties: ['Acupuncture & TCM', 'Acupuncture and Chinese Medicine'],
    patterns: [
      /\b(acupunct\w*|tcm|chinese\s*medicine|oriental\s*medicine|herbal\w*|cupping|moxibustion|qi|meridian|holistic\s*pain)\b/i,
      /(châm\s*cứu|đông\s*y|y\s*học\s*cổ\s*truyền|bắt\s*mạch|thuốc\s*bắc|thuốc\s*nam|bấm\s*huyệt|giác\s*hơi)/i,
      /(한의원|한의사|침술|한약|부항|추나|한방)/,
      /(中医|针灸|中药|拔罐|推拿|中草药|号脉)/,
    ],
  },
  {
    specialties: ['OB/GYN'],
    patterns: [
      /\b(ob\/?gyn|obstet\w*|gynec\w*|prenatal|pregnancy|pregnant|pap\s*smear|pelvic|menopause|fertility|maternity|ultrasound|women'?s\s*health|birth\s*control|iud)\b/i,
      /(sản\s*phụ\s*khoa|phụ\s*khoa|sản\s*khoa|khám\s*thai|siêu\s*âm\s*thai|sinh\s*con|hiếm\s*muộn)/i,
      /(산부인과|여성병원|산전검사|임신|출산|부인과)/,
      /(妇产科|产科|妇科|产检|怀孕|孕期|B超)/,
    ],
  },
  {
    specialties: ['Ophthalmology'],
    patterns: [
      /\b(ophthalm\w*|optometr\w*|eye\s*exam|eye\s*doctor|eye\s*care|vision|cataract\w*|glaucoma|lasik|retina|cornea|contact\s*lens\w*|glasses|myopia|dry\s*eye)\b/i,
      /(nhãn\s*khoa|khám\s*mắt|bác\s*sĩ\s*mắt|cận\s*thị|đục\s*thủy\s*tinh\s*thể|đo\s*mắt|kính\s*mắt)/i,
      /(안과|검안|시력|백내장|녹내장|라식|라섹|안경)/,
      /(眼科|视力|白内障|青光眼|配镜|验光|近视|干眼)/,
    ],
  },
  {
    specialties: ['Pediatrics'],
    patterns: [
      /\b(pediatr\w*|child\s*doctor|children'?s\s*health|newborn|infant|toddler|well-?child|school\s*physical|pediatric\s*vaccine\w*)\b/i,
      /(nhi\s*khoa|bác\s*sĩ\s*nhi|khám\s*trẻ\s*em|sơ\s*sinh|chích\s*ngừa\s*cho\s*bé)/i,
      /(소아과|소아청소년과|영유아|예방접종)/,
      /(儿科|小儿科|儿童医院|新生儿|儿童疫苗)/,
    ],
  },
  {
    specialties: ['Mental Health'],
    patterns: [
      /\b(mental\s*health|psychiatr\w*|psycholog\w*|therap\w*|counsel\w*|depression|anxiety|adhd|ptsd|trauma|bipolar|insomnia|grief)\b/i,
      /(tâm\s*lý|tâm\s*thần|trầm\s*cảm|lo\s*âu|mất\s*ngủ|tham\s*vấn|trị\s*liệu\s*tâm\s*lý)/i,
      /(정신과|정신건강|심리상담|우울증|불안장애|불면증)/,
      /(心理|精神科|心理咨询|抑郁|焦虑|失眠|心理医生)/,
    ],
  },
  {
    specialties: ['Dermatology'],
    patterns: [
      /\b(dermatol\w*|skin\s*doctor|skin\s*rash|acne|eczema|psoriasis|mole\s*check|skin\s*cancer|botox|rosacea|hair\s*loss|alopecia)\b/i,
      /(da\s*liễu|bác\s*sĩ\s*da|mụn|chàm|vẩy\s*nến|dị\s*ứng\s*da|khám\s*da)/i,
      /(피부과|여드름|아토피|습진|피부질환|탈모)/,
      /(皮肤科|湿疹|痤疮|青春痘|皮肤过敏|脱发)/,
    ],
  },
  {
    specialties: ['Cardiology'],
    patterns: [
      /\b(cardiol\w*|heart\s*doctor|cardiovascular|ekg|ecg|echocardiogram|arrhythmia|chest\s*pain|hypertension|pacemaker|cholesterol)\b/i,
      /(tim\s*mạch|bác\s*sĩ\s*tim|huyết\s*áp\s*cao|điện\s*tâm\s*đồ|đau\s*ngực)/i,
      /(심장내과|순환기내과|고혈압|심전도|부정맥)/,
      /(心脏科|心血管|心内科|高血压|心电图|心脏病)/,
    ],
  },
  {
    specialties: ['Orthopedics'],
    patterns: [
      /\b(orthoped\w*|orthopaed\w*|joint\s*pain|knee\s*pain|shoulder\s*pain|back\s*pain|spine|fracture|sports\s*medicine|arthritis|sciatica|physical\s*therapy|chiropract\w*)\b/i,
      /(cơ\s*xương\s*khớp|chấn\s*thương\s*chỉnh\s*hình|đau\s*lưng|đau\s*khớp|thoát\s*vị\s*đĩa\s*đệm|vật\s*lý\s*trị\s*liệu)/i,
      /(정형외과|관절|척추|허리통증|무릎|재활의학과|도수치료)/,
      /(骨科|关节|脊椎|腰疼|膝盖|物理治疗|运动医学)/,
    ],
  },
  {
    specialties: ['Primary Care', 'Family Medicine', 'Internal Medicine', 'Community Health Center'],
    patterns: [
      /\b(primary\s*care|family\s*doctor|family\s*medicine|internal\s*medicine|internist|general\s*practitioner|annual\s*physical|check-?up|blood\s*test|lab\s*work|vaccin\w*|flu\s*shot|diabetes|thyroid|urgent\s*care|walk-?in)\b/i,
      /(bác\s*sĩ\s*gia\s*đình|khám\s*tổng\s*quát|nội\s*khoa|tiểu\s*đường|mỡ\s*máu|xét\s*nghiệm\s*máu|chích\s*ngừa)/i,
      /(내과|가정의학과|건강검진|종합검진|당뇨|갑상선|주치의)/,
      /(家庭医生|全科医生|内科|体检|年度体检|糖尿病|甲状腺|抽血)/,
    ],
  },
];

const LANGUAGE_INTENT_RULES: Array<{ language: string; pattern: RegExp }> = [
  { language: 'Vietnamese', pattern: /\b(vietnamese|viet)\b|(tiếng\s*việt|người\s*việt|bác\s*sĩ\s*việt)/i },
  { language: 'Korean', pattern: /\b(korean)\b|(한국어|한인|한국말)/i },
  { language: 'Mandarin', pattern: /\b(mandarin)\b|(普通话|国语|tiếng\s*phổ\s*thông)/i },
  { language: 'Cantonese', pattern: /\b(cantonese)\b|(粤语|广东话|tiếng\s*quảng\s*đông)/i },
  { language: 'Chinese', pattern: /\b(chinese)\b|(中文|华人|华语|tiếng\s*trung|tiếng\s*hoa)/i },
];

const INSURANCE_INTENT_RULES: Array<{ insurance: string; pattern: RegExp }> = [
  { insurance: 'Medicare', pattern: /\bmedicare\b/i },
  { insurance: 'Medicaid', pattern: /\b(medicaid|medi-cal)\b/i },
  { insurance: 'Delta Dental', pattern: /\bdelta(\s*dental)?\b/i },
  { insurance: 'Blue Cross Blue Shield', pattern: /\b(blue\s*cross|blue\s*shield|bcbs|anthem)\b/i },
  { insurance: 'UnitedHealthcare', pattern: /\b(united\s*health\w*|uhc)\b/i },
  { insurance: 'Aetna', pattern: /\baetna\b/i },
  { insurance: 'Cigna', pattern: /\bcigna\b/i },
  { insurance: 'Humana', pattern: /\bhumana\b/i },
  { insurance: 'Kaiser Permanente', pattern: /\bkaiser\b/i },
  { insurance: 'MetLife', pattern: /\bmetlife\b/i },
  { insurance: 'Guardian', pattern: /\bguardian\b/i },
];

const STOP_WORDS = new Set([
  'in', 'near', 'for', 'and', 'or', 'the', 'a', 'an', 'with', 'speaking',
  'doctor', 'doctors', 'clinic', 'clinics', 'center', 'care', 'medical',
  'bác', 'sĩ', 'phòng', 'khám', 'tiếng',
]);

export function resolveSearchIntent(rawQuery?: string | null): ResolvedSearchIntent {
  const cleaned = (rawQuery || '').trim();
  if (!cleaned) {
    return { rawQuery: '', matchedSpecialties: [], searchTerms: [] };
  }

  const matchedSpecialties: string[] = [];
  for (const rule of SPECIALTY_INTENT_RULES) {
    if (rule.patterns.some((re) => re.test(cleaned))) {
      for (const spec of rule.specialties) {
        if (!matchedSpecialties.includes(spec)) {
          matchedSpecialties.push(spec);
        }
      }
    }
  }

  let matchedLanguage: string | undefined;
  for (const rule of LANGUAGE_INTENT_RULES) {
    if (rule.pattern.test(cleaned)) {
      matchedLanguage = rule.language;
      break;
    }
  }

  let matchedInsurance: string | undefined;
  for (const rule of INSURANCE_INTENT_RULES) {
    if (rule.pattern.test(cleaned)) {
      matchedInsurance = rule.insurance;
      break;
    }
  }

  const sanitized = cleaned
    .replace(/[(),.;:!?'"/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const searchTerms = sanitized
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));

  return {
    rawQuery: cleaned,
    matchedSpecialties,
    matchedLanguage,
    matchedInsurance,
    searchTerms,
  };
}

export const POPULAR_INSURANCE_BUCKETS = [
  'Medicare',
  'Medicaid',
  'Blue Cross Blue Shield',
  'Delta Dental',
  'Aetna',
  'Cigna',
  'UnitedHealthcare',
  'Humana',
  'MetLife',
  'Guardian',
] as const;

export const PRICE_TIER_BUCKETS = [
  { value: '$', label: '$ · Community / Sliding Scale' },
  { value: '$$', label: '$$ · Standard In-Network' },
  { value: '$$$', label: '$$$ · Specialty / Concierge' },
] as const;

