# 💬 iMessage Web & Mobile Fullstack Project

React(Vite) 프론트엔드와 Node.js(Express) 백엔드, MongoDB 데이터베이스를 결합하고, **Clerk** 인증 및 **Render.com** 단일 배포, **Keep-Alive Cron**을 적용한 풀스택 프로젝트입니다.

---

## 🚀 주요 기술 스택

### 🖥️ Frontend (Web)
- **Framework**: React 19 (Vite)
- **Authentication**: `@clerk/react`
- **State Management**: TanStack Query (React Query)
- **Styling**: Tailwind CSS / CSS Modules

### ⚙️ Backend
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js (v5)
- **Authentication & Security**: `@clerk/express`, CORS
- **Database**: MongoDB Atlas + Mongoose ODM
- **Media Storage**: Cloudinary SDK
- **Automation**: `cron` (14분 Keep-Alive Health Check)

---

## 📁 프로젝트 구조

```
webMobile-imessage/
├── backend/                  # 백엔드 Express 소스 코드
│   ├── src/
│   │   ├── config/           # DB(MongoDB) 및 Cloudinary 연결 설정
│   │   ├── controllers/      # API 및 Webhook 비즈니스 로직
│   │   ├── lib/              # Keep-Alive Cron 등 라이브러리 유틸
│   │   ├── models/           # Mongoose 스키마 (User, Message 등)
│   │   ├── routes/           # Express 라우터 정의
│   │   └── server.js         # 백엔드 진입점 (정적 서빙, CORS, Cron)
│   ├── .env                  # 백엔드 환경 변수
│   └── package.json          # 백엔드 의존성 관리
│
├── frontend/                 # 프론트엔드 React(Vite) 소스 코드
│   ├── src/
│   │   ├── App.jsx           # 메인 React 컴포넌트
│   │   ├── main.jsx          # ClerkProvider 및 React 루트 마운트
│   │   └── ...
│   ├── .env                  # 프론트엔드 환경 변수
│   ├── index.html            # SPA 템플릿
│   ├── vite.config.js        # Vite 설정
│   └── package.json          # 프론트엔드 의존성 관리
│
├── mobile/                   # 모바일 앱 (Expo React Native 예정)
├── package.json              # 루트 통합 빌드 및 실행 스크립트
├── clerk.md                  # 📘 Clerk 인증 및 Webhook 동기화 가이드
└── render.md                 # 🌐 Render.com 단일 배포 & Keep-Alive 가이드
```

---

## 🛠️ 실행 방법

### 1) 로컬 개발 환경 실행

```bash
# 의존성 설치
npm run build

# 백엔드 실행 (기본 포트: 3000)
npm run dev:backend

# 프론트엔드 실행 (기본 포트: 5173)
npm run dev:frontend
```

> 💡 로컬 개발 모드(`NODE_ENV !== 'production'`)에서는 Keep-Alive Cron 작업이 자동으로 비활성화됩니다.

---

### 2) 통합 프로덕션 빌드 & 실행 테스트

```bash
# 전체 빌드 (백엔드/프론트엔드 설치 및 Vite 번들링)
npm run build

# 프로덕션 서버 실행 (정적 파일 서빙 및 헬스 체크 활성화)
npm start
```

---

## 🌐 Render.com 배포 & 상세 가이드

자세한 배포 및 연동 방법은 루트 디렉토리의 가이드 문서를 참조하세요:

- [render.md](file:///Users/guniluk/Desktop/CODING/webMobile-imessage/render.md) : **Render.com 단일 배포, Express 5 정적 서빙, 14분 Keep-Alive Cron 설정 및 트러블슈팅 가이드**
- [clerk.md](file:///Users/guniluk/Desktop/CODING/webMobile-imessage/clerk.md) : **Clerk 인증 연동, Express 미들웨어 적용, svix 기반 MongoDB Webhook CRUD 동기화 가이드**
