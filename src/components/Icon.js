// 선 아이콘 모음. <Icon name="check" /> 처럼 쓴다. 색과 크기는 글자를 따라간다.
const P = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  question: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6" /><path d="M12 17h.01" /></>,
  speaker: <><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></>,
  mute: <><path d="M4 10v4h4l5 4V6L8 10z" /><path d="M17 9l5 5M22 9l-5 5" /></>,
  skip: <path d="M4 12h14M13 7l5 5-5 5" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  book: <><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" /><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  prev: <path d="M15 5l-7 7 7 7" />,
  next: <path d="M9 5l7 7-7 7" />,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  people: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M15.5 14.6c3-.4 5 1.2 5.5 5.4" /></>,
  calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  pill: <><path d="M10.5 4.5a4.95 4.95 0 0 1 7 7l-6 6a4.95 4.95 0 0 1-7-7z" /><path d="M8.5 8.5l7 7" /></>,
  music: <><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>,
  phone: <path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.6 1.5A16 16 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z" />,
  pot: <><path d="M4 10h16v3a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z" /><path d="M2 10h20M9.5 6.5c0-1 1-1 1-2.5M13.5 6.5c0-1 1-1 1-2.5" /></>,
  walk: <><circle cx="13" cy="4.5" r="1.8" /><path d="M10 21l2-6-2.5-2.5L11 8l4 3 3 1M9.5 12.5L7 14M13 15l3 6" /></>,
  photo: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" /></>,
  logout: <><path d="M14 4h5v16h-5" /><path d="M10 8l-4 4 4 4M6 12h10" /></>
};

export const TASK_ICONS = ['pill', 'music', 'phone', 'walk', 'pot', 'calendar'];

export default function Icon({ name, className = '' }) {
  if (!name || !P[name]) return null;
  return (
    <svg className={`i ${className}`} viewBox="0 0 24 24" aria-hidden="true">{P[name]}</svg>
  );
}
