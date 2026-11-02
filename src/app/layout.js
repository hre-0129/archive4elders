import './globals.css';

// 글꼴은 빌드할 때 받지 않고 브라우저가 구글 폰트에서 직접 불러온다.
// (next/font 로 빌드 때 받으면 구글 폰트 응답에 따라 Vercel 배포가 실패할 때가 있었다)
const FONT_URL = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700;900&display=swap';

export const metadata = {
  title: '기억 아카이브',
  description: '사진과 이야기를 몽실이와 나누고 가족과 함께 보는 기억 기록'
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_URL} />
      </head>
      <body>{children}</body>
    </html>
  );
}
