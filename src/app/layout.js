import { Noto_Sans_KR } from 'next/font/google';
import './globals.css';

const noto = Noto_Sans_KR({ subsets: ['latin'], weight: ['500', '700', '900'], variable: '--font-noto', display: 'swap' });

export const metadata = {
  title: '기억 아카이브',
  description: '사진과 이야기를 몽실이와 나누고 가족과 함께 보는 기억 기록'
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={noto.variable}>
      <body>{children}</body>
    </html>
  );
}
