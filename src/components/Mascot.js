// 마스코트 '몽실이' (연분홍 솜구름)
export default function Mascot() {
  return (
    <svg viewBox="0 0 120 100" aria-hidden="true">
      <defs>
        <linearGradient id="cloud" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF3F7" />
          <stop offset="1" stopColor="#FFDCE7" />
        </linearGradient>
      </defs>
      <g fill="url(#cloud)">
        <rect x="14" y="46" width="92" height="42" rx="21" />
        <circle cx="38" cy="50" r="20" /><circle cx="62" cy="38" r="26" /><circle cx="86" cy="52" r="18" />
      </g>
      <ellipse cx="49" cy="62" rx="3.4" ry="4.4" fill="#3A2E2B" /><ellipse cx="73" cy="62" rx="3.4" ry="4.4" fill="#3A2E2B" />
      <ellipse cx="41" cy="71" rx="5.5" ry="3.2" fill="#FF8FB0" opacity=".6" /><ellipse cx="81" cy="71" rx="5.5" ry="3.2" fill="#FF8FB0" opacity=".6" />
      <path d="M57 69 q4 4 8 0" stroke="#3A2E2B" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}
