import type { Metadata } from 'next';
import Link from 'next/link';
import { HeartHandshake, Languages, ShieldCheck, Users } from 'lucide-react';
import { ArrowCircle, Caption, Display, Grid, Heading, Page, PhotoTile, Pill, Tile, ring, tile, pad } from '@/components/site/ui';
import { getServerLocale } from '@/lib/i18n/server';
import type { SupportedLocale } from '@/lib/states';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Asian Health Hub helps Vietnamese, Korean, and Chinese-speaking patients find language-accessible clinics across the United States.',
  alternates: {
    canonical: '/about',
  },
};

const ABOUT_COPY: Record<
  SupportedLocale,
  {
    eyebrow: string;
    heroTitle: string;
    heroSub: string;
    findClinic: string;
    claimProfile: string;
    statBarriers: string;
    ourStory: string;
    storyHeading: string;
    storyPoints: { k: string; title: string }[];
    missionVision: string;
    ourMission: string;
    missionText: string;
    ourVision: string;
    visionText: string;
    stats: { value: string; label: string }[];
    standForTitle: string;
    standForSub: string;
    values: string[];
    steps: string[];
    closingTitle: string;
    forClinics: string;
    claimHeading: string;
    claimNow: string;
  }
> = {
  en: {
    eyebrow: 'About Asian Health Hub',
    heroTitle: 'Care in the language you trust',
    heroSub: 'Connecting Vietnamese, Korean and Chinese-speaking families with clinics that speak their language',
    findClinic: 'Find a Clinic',
    claimProfile: 'Claim a Free Profile',
    statBarriers: 'Vietnamese, Korean and Chinese Americans face language barriers in care',
    ourStory: 'Our story',
    storyHeading: 'Healthcare is too important to be limited by language.',
    storyPoints: [
      { k: '3.4M+ patients', title: 'Closing the communication gap' },
      { k: 'Verified profiles', title: 'Clear language and specialty details' },
      { k: 'Under 5 minutes', title: 'From search to direct booking' },
    ],
    missionVision: 'Mission & vision',
    ourMission: 'Our mission',
    missionText: 'Care in your language, easy to find and free.',
    ourVision: 'Our vision',
    visionText: 'The right clinic in under five minutes, anywhere.',
    stats: [
      { value: '9+', label: 'Medical specialties covered in the directory' },
      { value: '15+', label: 'US states with verified multilingual clinics' },
      { value: '3+', label: 'Languages supported: Vietnamese, Korean and Chinese' },
      { value: '100%', label: 'Free for patients and families, always' },
    ],
    standForTitle: 'What we stand for',
    standForSub: 'The principles that shape how we build Asian Health Hub and serve our community',
    values: ['Language First', 'Radical Transparency', 'Free for Patients', 'Community First'],
    steps: ['Search the directory', 'Compare clinic profiles', 'Filter by state or language', 'Contact the clinic'],
    closingTitle: 'Ready to find care your family trusts?',
    forClinics: 'For clinics',
    claimHeading: 'Claim your free profile',
    claimNow: 'Claim Now',
  },
  vi: {
    eyebrow: 'Về Asian Health Hub',
    heroTitle: 'Chăm sóc y tế bằng ngôn ngữ bạn tin cậy',
    heroSub: 'Kết nối các gia đình người Việt, Hàn, Hoa tại Mỹ với những phòng khám nói đúng ngôn ngữ mẹ đẻ',
    findClinic: 'Tìm phòng khám',
    claimProfile: 'Xác nhận hồ sơ miễn phí',
    statBarriers: 'Người gốc Á tại Hoa Kỳ gặp rào cản ngôn ngữ khi đi khám bệnh',
    ourStory: 'Câu chuyện của chúng tôi',
    storyHeading: 'Sức khỏe quá quan trọng để bị giới hạn bởi rào cản ngôn ngữ.',
    storyPoints: [
      { k: '3.4M+ bệnh nhân', title: 'Xóa bỏ khoảng cách giao tiếp y tế' },
      { k: 'Hồ sơ xác thực', title: 'Minh bạch ngôn ngữ hỗ trợ và chuyên khoa' },
      { k: 'Dưới 5 phút', title: 'Từ lúc tìm kiếm đến khi liên hệ đặt lịch' },
    ],
    missionVision: 'Sứ mệnh & Tầm nhìn',
    ourMission: 'Sứ mệnh',
    missionText: 'Tìm dịch vụ y tế bằng ngôn ngữ của bạn một cách dễ dàng và hoàn toàn miễn phí.',
    ourVision: 'Tầm nhìn',
    visionText: 'Giúp mọi gia đình tìm đúng phòng khám phù hợp chỉ trong chưa đầy 5 phút.',
    stats: [
      { value: '9+', label: 'Chuyên khoa y tế trọng tâm trong danh bạ' },
      { value: '15+', label: 'Tiểu bang Hoa Kỳ có phòng khám đa ngôn ngữ' },
      { value: '3+', label: 'Ngôn ngữ trọng tâm: Tiếng Việt, Hàn và Trung' },
      { value: '100%', label: 'Miễn phí trọn đời cho bệnh nhân và gia đình' },
    ],
    standForTitle: 'Giá trị cốt lõi',
    standForSub: 'Những nguyên tắc định hình cách chúng tôi xây dựng Asian Health Hub phục vụ cộng đồng',
    values: ['Ưu tiên ngôn ngữ mẹ đẻ', 'Minh bạch thông tin', 'Miễn phí cho bệnh nhân', 'Vì cộng đồng trước tiên'],
    steps: ['Tìm trong danh bạ', 'So sánh hồ sơ phòng khám', 'Lọc theo tiểu bang & ngôn ngữ', 'Liên hệ trực tiếp phòng khám'],
    closingTitle: 'Sẵn sàng tìm phòng khám mà gia đình bạn an tâm tin tưởng?',
    forClinics: 'Dành cho phòng khám',
    claimHeading: 'Xác nhận hồ sơ miễn phí',
    claimNow: 'Xác nhận ngay',
  },
  ko: {
    eyebrow: 'Asian Health Hub 소개',
    heroTitle: '가장 편안한 모국어로 받는 진료',
    heroSub: '미국 내 한국어·베트남어·중국어 사용 가정을 모국어 진료가 가능한 병원과 연결합니다',
    findClinic: '병원 찾기',
    claimProfile: '무료 프로필 인증',
    statBarriers: '언어 장벽으로 인해 진료에 어려움을 겪는 미국 내 아시안 환자 수',
    ourStory: '우리의 이야기',
    storyHeading: '건강은 언어 장벽 때문에 제한되어서는 안 됩니다.',
    storyPoints: [
      { k: '340만+ 환자', title: '진료실의 언어 장벽 해소' },
      { k: '검증된 프로필', title: '명확한 언어 지원 및 진료 과목 안내' },
      { k: '5분 이내', title: '검색부터 병원 직접 예약까지' },
    ],
    missionVision: '미션 & 비전',
    ourMission: '미션',
    missionText: '모국어로 소통하는 병원을 누구나 쉽고 무료로 찾을 수 있도록 돕습니다.',
    ourVision: '비전',
    visionText: '미국 어디서나 5분 안에 우리 가족에게 맞는 병원을 찾는 세상.',
    stats: [
      { value: '9+', label: '디렉토리에 등록된 주요 진료 과목' },
      { value: '15+', label: '검증된 다국어 병원이 위치한 미국 주(State)' },
      { value: '3+', label: '주요 지원 언어: 한국어, 베트남어, 중국어' },
      { value: '100%', label: '환자와 가족에게는 언제나 무료' },
    ],
    standForTitle: '핵심 가치',
    standForSub: 'Asian Health Hub가 커뮤니티를 위해 지키는 원칙',
    values: ['모국어 소통 우선', '투명한 병원 정보', '환자 100% 무료', '커뮤니티 중심'],
    steps: ['디렉토리 검색', '병원 프로필 비교', '주(State) 및 언어 필터', '병원 직접 연락'],
    closingTitle: '우리 가족이 믿고 찾을 수 있는 병원을 만나보세요.',
    forClinics: '병원 관계자용',
    claimHeading: '무료 병원 프로필 인증',
    claimNow: '지금 신청하기',
  },
  zh: {
    eyebrow: '关于 Asian Health Hub',
    heroTitle: '用您最信赖的母语安心就医',
    heroSub: '连接全美华人、越南裔与韩裔家庭与提供母语服务的认证医疗诊所',
    findClinic: '查找诊所',
    claimProfile: '免费认领诊所主页',
    statBarriers: '在美亚裔患者在就医过程中面临语言沟通障碍',
    ourStory: '我们的故事',
    storyHeading: '医疗健康至关重要，绝不应受限于语言。',
    storyPoints: [
      { k: '340万+ 患者', title: '消除医患之间的语言沟通鸿沟' },
      { k: '经核实的档案', title: '清晰标注医护语言与专科详情' },
      { k: '不到 5 分钟', title: '从搜索筛选到直接致电预约' },
    ],
    missionVision: '使命与愿景',
    ourMission: '我们的使命',
    missionText: '让每个家庭都能轻松、免费地找到母语医疗服务。',
    ourVision: '我们的愿景',
    visionText: '无论身在全美何处，5 分钟内找到合适的诊所。',
    stats: [
      { value: '9+', label: '名录覆盖的核心临床专科' },
      { value: '15+', label: '收录认证多语言诊所的美国各州' },
      { value: '3+', label: '支持的核心语言：中文、越南语、韩语' },
      { value: '100%', label: '对患者与家庭永久免费' },
    ],
    standForTitle: '我们的准则',
    standForSub: '指导我们构建 Asian Health Hub 并服务亚裔社区的核心原则',
    values: ['母语沟通优先', '信息公开透明', '患者完全免费', '深耕亚裔社区'],
    steps: ['搜索诊所名录', '对比诊所档案', '按州或语言筛选', '直接联系诊所'],
    closingTitle: '准备好为您和家人寻找值得信赖的母语医生了吗？',
    forClinics: '诊所入驻',
    claimHeading: '免费认领诊所主页',
    claimNow: '立即认领',
  },
};

const STORY_IMAGES = ['/brand/photos/a2-section2.webp', '/brand/photos/a4-guide-right.webp', '/brand/photos/h2-step-filter.webp'];
const VALUE_ICONS = [Languages, ShieldCheck, HeartHandshake, Users];
const STEP_IMAGES = ['/brand/photos/b3-steps.webp', '/brand/photos/h3-step-compare.webp', '/brand/photos/a3-guide-left.webp', '/brand/photos/clinic-3.webp'];
const VALUE_TONES = ['mint', 'cream', 'mint', 'cream'] as const;

export default async function AboutPage() {
  const locale = await getServerLocale();
  const c = ABOUT_COPY[locale] ?? ABOUT_COPY.en;

  return (
    <Page>
      {/* 1. Hero: the title tile beside the photo */}
      <Grid className="md:min-h-[calc(100svh-7.25rem)] md:grid-cols-2">
        <Tile tone="stone" as="header" className={`flex min-h-[28rem] flex-col justify-between gap-10 ${pad}`}>
          <Caption>{c.eyebrow}</Caption>
          <div>
            <Display as="h1">{c.heroTitle}</Display>
            <Caption className="mt-5 max-w-[46ch] opacity-75">{c.heroSub}</Caption>
            <div className="mt-7 flex flex-wrap gap-2">
              <Pill href="/search">{c.findClinic}</Pill>
              <Pill href="/claim" variant="line">{c.claimProfile}</Pill>
            </div>
          </div>
        </Tile>
        <div className="relative min-h-[22rem]">
          <PhotoTile src="/brand/photos/h1-hero.webp" alt="A doctor talking with an older patient and his daughter" className="h-full min-h-[22rem]" eager />
          <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-white/90 p-4 backdrop-blur-md md:bottom-5 md:left-5 md:right-auto md:max-w-sm md:rounded-2xl md:p-5">
            <p className="text-4xl font-bold leading-none tracking-tight md:text-5xl">3.4M+</p>
            <p className="mt-2 text-xs font-semibold md:text-sm">{c.statBarriers}</p>
          </div>
        </div>
      </Grid>

      {/* 2. Our story: the claim, then three proof tiles */}
      <Grid className="md:grid-cols-4">
        <Tile tone="ink" className={`flex min-h-[20rem] flex-col justify-between gap-8 ${pad}`}>
          <Caption className="opacity-70">{c.ourStory}</Caption>
          <div>
            <Heading as="h2" className="md:text-4xl">{c.storyHeading}</Heading>
          </div>
        </Tile>
        {c.storyPoints.map((p, idx) => (
          <Tile key={p.title} tone="none" className="group flex min-h-[26rem] flex-col">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={STORY_IMAGES[idx]} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
            <div className="relative mt-auto p-4 text-white md:p-6">
              <span className="inline-flex rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-[#0D1F1C]">{p.k}</span>
              <h3 className="mt-3 text-xl font-bold leading-tight md:text-2xl">{p.title}</h3>
            </div>
          </Tile>
        ))}
      </Grid>

      {/* 3. Mission and vision */}
      <Grid id="mission" className="md:grid-cols-2">
        <PhotoTile
          src="/brand/photos/a5-tall-portrait.webp"
          alt="A grandmother with her two granddaughters"
          className="min-h-[22rem] md:min-h-[36rem]"
        />
        <Tile tone="mint" className={`flex flex-col justify-between gap-10 ${pad}`}>
          <Display>{c.missionVision}</Display>
          <div className="grid gap-6">
            <div>
              <Caption className="text-[#024E44]">{c.ourMission}</Caption>
              <p className="mt-2 text-2xl font-bold leading-tight md:text-3xl">{c.missionText}</p>
            </div>
            <div>
              <Caption className="text-[#024E44]">{c.ourVision}</Caption>
              <p className="mt-2 text-2xl font-bold leading-tight md:text-3xl">{c.visionText}</p>
            </div>
          </div>
        </Tile>
      </Grid>

      {/* 4. Numbers */}
      <Grid className="grid-cols-2 md:grid-cols-4">
        {c.stats.map((s, i) => (
          <Tile key={s.label} tone={i === 0 ? 'green' : 'stone'} className={`flex min-h-[12rem] flex-col justify-between gap-6 ${pad}`}>
            <span className="text-[clamp(3.5rem,8vw,8rem)] font-bold leading-[0.8] tracking-tight tabular-nums">{s.value}</span>
            <Caption className={i === 0 ? 'opacity-85' : 'opacity-75'}>{s.label}</Caption>
          </Tile>
        ))}
      </Grid>

      {/* 5. What we stand for */}
      <Grid className="md:grid-cols-4">
        <Tile tone="zinc" className={`isolate flex min-h-[16rem] flex-col justify-end gap-4 md:col-span-4 md:min-h-[24rem] md:flex-row md:items-end md:justify-between ${pad}`}>
          <div className="site-spec-drift pointer-events-none absolute inset-x-0 top-[10%] -z-10 flex w-max opacity-[0.08]" aria-hidden="true">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center gap-[clamp(2.5rem,5vw,5rem)] pr-[clamp(2.5rem,5vw,5rem)]">
                {[...VALUE_ICONS, ...VALUE_ICONS].map((Icon, k) => (
                  <Icon key={k} className="h-[clamp(5rem,11vw,10rem)] w-auto" strokeWidth={1.1} />
                ))}
              </div>
            ))}
          </div>
          <Display>{c.standForTitle}</Display>
          <Caption className="max-w-xs md:text-right">{c.standForSub}</Caption>
        </Tile>
        {c.values.map((title, i) => {
          const Icon = VALUE_ICONS[i];
          return (
            <Tile key={title} tone={VALUE_TONES[i]} className={`isolate flex min-h-[16rem] flex-col justify-between gap-8 ${pad}`}>
              <Icon className="pointer-events-none absolute -top-[10%] right-0 -z-10 h-[125%] w-auto translate-x-[34%] opacity-[0.07]" strokeWidth={1} aria-hidden="true" />
              <span className="grid h-14 w-14 place-items-center rounded-full bg-white/70">
                <Icon className="h-7 w-7" strokeWidth={1.6} aria-hidden="true" />
              </span>
              <h3 className="text-xl font-bold leading-tight md:text-2xl">{title}</h3>
            </Tile>
          );
        })}
      </Grid>

      {/* 6. How it works */}
      <Grid className="md:grid-cols-4">
        {c.steps.map((title, i) => (
          <Tile key={title} tone={i % 2 ? 'zinc' : 'stone'} className="flex min-h-[30rem] flex-col">
            <div className={pad}>
              <span className="block text-[clamp(4rem,8vw,8rem)] font-bold leading-[0.8] tracking-tight tabular-nums">0{i + 1}</span>
              <h3 className="mt-4 text-xl font-bold md:text-2xl">{title}</h3>
            </div>
            <div className="mx-2 mb-2 mt-auto min-h-[12rem] flex-1 overflow-hidden rounded-xl md:mx-3 md:mb-3 md:rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={STEP_IMAGES[i]} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
          </Tile>
        ))}
      </Grid>

      {/* 7. Closing: directory and claim */}
      <Grid className="md:grid-cols-4">
        <Link href="/search" className={`group relative min-h-[24rem] overflow-hidden md:col-span-3 ${tile} ${ring}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/photos/a1-hero.webp" alt="" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-6 text-white md:bottom-7 md:left-7 md:right-7">
            <div>
              <h2 className="max-w-[16ch] text-[clamp(2rem,4.5vw,4.5rem)] font-bold leading-[0.95] tracking-tight">{c.closingTitle}</h2>
            </div>
            <ArrowCircle light />
          </div>
        </Link>
        <Tile tone="mint" className={`flex min-h-[18rem] flex-col justify-between gap-6 ${pad}`}>
          <div>
            <Caption className="text-[#024E44]">{c.forClinics}</Caption>
            <h3 className="mt-3 text-2xl font-bold leading-tight md:text-3xl">{c.claimHeading}</h3>
          </div>
          <Pill href="/claim" className="self-start">{c.claimNow}</Pill>
        </Tile>
      </Grid>
    </Page>
  );
}
