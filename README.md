# 기억 아카이브

어르신이 마스코트 '몽실이'와 버튼으로 대화하며 사진과 이야기를 남기고, 가족과 나누는 웹사이트입니다.

- **어르신 화면** (`/elder`): 들어오면 몽실이가 오늘 할 일 → 새 가족 답장 → 사진 이야기 순서로 말을 겁니다. 모든 대답은 큰 색 버튼(초록=네, 빨강=아니요·그만, 파랑=다시 듣기·잘 모르겠어요)으로 하고, 말풍선은 소리로 읽어 줍니다.
- **가족 화면** (`/family`): 사진 올리기, 공유받은 이야기에 답장(사진·약속 첨부), 할 일 관리, 초대 코드와 설정.
- `prototype/memory-archive.html`: 처음 만든 클릭 시연판 (서버 없이 열림).

## 처음 한 번 설정하기

### 1. Supabase 준비
1. [supabase.com](https://supabase.com)에서 프로젝트를 만든다.
2. 왼쪽 메뉴 **SQL Editor** → **New query** → `supabase/schema.sql` 내용을 전부 붙여 넣고 **Run**.
3. 학교 시연처럼 가입 확인 메일 없이 바로 쓰고 싶다면: **Authentication → Sign In / Providers → Email** 에서 **Confirm email** 을 끈다.
4. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키를 복사해 둔다.

### 2. 환경 파일 만들기
`.env.local.example` 을 복사해 `.env.local` 로 이름을 바꾸고 위 두 값을 붙여 넣는다.
(`.env.local` 은 깃에 올라가지 않는다.)

### 3. 실행
```bash
npm install
npm run dev
```
브라우저에서 http://localhost:3000 을 연다.

## 써 보는 순서 (시연용)
1. 가족 계정으로 가입 → '가족' + '새로 만들기' → 설정 탭의 **초대 코드**를 확인.
2. 다른 브라우저(또는 시크릿 창)에서 어르신 계정으로 가입 → '어르신 본인' + 초대 코드 입력.
3. 가족 화면에서 할 일과 사진을 올린다. (시연에는 가상의 인물·사진만 쓴다.)
4. 어르신 화면에서 몽실이와 대화 → 이야기책에 남기기 → 가족에게 보여 주기.
5. 가족 화면 '이야기' 탭에서 답장(약속 넣기 포함) → 어르신 화면에서 몽실이가 답장을 읽어 주고, 약속을 할 일에 넣을지 묻는다.

## 폴더 구조 (파이썬에 빗대면)
| 위치 | 하는 일 |
|---|---|
| `src/app/**/page.js` | 주소 하나 = 파일 하나. `/family` 는 `src/app/family/page.js` |
| `src/app/elder/talk.js` | 몽실이 대화 각본. 나중에 AI로 바꿀 자리 |
| `src/lib/supabase.js` | 데이터베이스 연결 (파이썬의 DB 연결 모듈 같은 것) |
| `src/lib/useMember.js` | 지금 로그인한 사람과 가족 정보 불러오기 |
| `src/components/` | 아이콘, 몽실이 그림처럼 여러 화면에서 같이 쓰는 조각 |
| `supabase/schema.sql` | 표 구조와 권한 규칙. 같은 가족만 보고, '나만 보기'는 어르신만 본다 |

## 몽실이 AI
사진 대화의 질문과 버튼은 서버(`src/app/api/talk/route.js`)가 AI에게 받아 온다. 규칙과 응답 검사는 `src/lib/ai.js`.
AI가 꺼져 있거나 실패하면 자동으로 각본 대화(`src/app/elder/talk.js`)로 이어 간다.

`.env.local` 에서 고른다 (바꾸면 `npm run dev` 를 다시 켠다):
- `AI_PROVIDER=ollama` — 내 컴퓨터의 [Ollama](https://ollama.com). 처음 한 번 `ollama pull gemma3:4b`. 무료지만 내 컴퓨터에서만 동작, 이 노트북(CPU)에서 질문 하나에 10초 안팎(첫 질문은 사진을 읽느라 더 오래 걸려서 화면을 열 때 미리 요청해 둔다).
- `AI_PROVIDER=gemini` + `GEMINI_API_KEY` — 배포된 사이트에서도 쓰려면 이쪽. Vercel 의 Environment Variables 에도 같은 값을 넣는다.

## 다음에 할 일
- 배포된 사이트에서도 AI 쓰기 (Gemini 등 클라우드 키, 또는 Ollama 터널)
- 조원들의 '오늘의 생활' 기능과 `tasks` 표 맞추기
- Vercel 에 배포해서 휴대폰·태블릿에서 주소로 접속
