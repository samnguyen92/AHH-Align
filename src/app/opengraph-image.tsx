import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/site';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'center',
          background: '#1263f1',
          color: 'white',
          display: 'flex',
          height: '100%',
          justifyContent: 'center',
          padding: '72px',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 32, fontWeight: 700, letterSpacing: 2 }}>
            {SITE_NAME.toUpperCase()}
          </div>
          <div style={{ fontSize: 74, fontWeight: 800, lineHeight: 1.05 }}>
            Find Clinics That Speak Your Language
          </div>
          <div style={{ color: '#bfdbfe', fontSize: 30, lineHeight: 1.35 }}>
            Vietnamese, Korean, Chinese, and Asian-language healthcare directory.
          </div>
        </div>
      </div>
    ),
    size
  );
}
