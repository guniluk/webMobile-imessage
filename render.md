# 🌐 Render.com 풀스택(Frontend + Backend) 단일 배포 & Keep-Alive 완벽 가이드

이 문서는 React(Frontend)와 Express(Backend)를 하나의 웹 서비스로 묶어 **Render.com**에 배포하고, 무료 인스턴스의 비활성화(Sleep)를 방지하기 위해 **14분 주기 Keep-Alive Cron**을 운영하는 전체 과정을 단계별로 알기 쉽게 정리한 가이드입니다.

---

## 📌 목차
1. [전체 동작 원리 및 아키텍처](#1-전체-동작-원리-및-아키텍처)
2. [배포 전 준비 사항](#2-배포-전-준비-사항)
3. [프로젝트 내 구현된 핵심 코드 구성](#3-프로젝트-내-구현된-핵심-코드-구성)
4. [Render.com 대시보드 설정 단계별 가이드](#4-rendercom-대시보드-설정-단계별-가이드)
5. [배포 후 확인 및 검증](#5-배포-후-확인-및-검증)
6. [자주 묻는 질문 및 문제 해결 (Troubleshooting)](#6-자주-묻는-질문-및-문제-해결-troubleshooting)

---

## 1. 전체 동작 원리 및 아키텍처

```
                     [ 사용자의 브라우저 ]
                              │
                              ▼ (https://webmobile-imessage.onrender.com)
┌────────────────────────────────────────────────────────────────────────────┐
│                             Render.com 웹 서비스                            │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Node.js (Express 서버)                        │  │
│  │                                                                      │  │
│  │  1. 정적 파일 서빙 (최우선):                                         │  │
│  │     (/assets/*.css, /assets/*.js, 이미지 등) ──► frontend/dist 즉시 서빙│  │
│  │                                                                      │  │
│  │  2. API 라우트: (/api/...) ───────────────────► Express 컨트롤러      │  │
│  │  3. Health Check: (/health) ──────────────────► 200 OK 응답          │  │
│  │                                                                      │  │
│  │  4. SPA Client Fallback (Express 5 정규식):                          │  │
│  │     (app.get(/.*/, ...)) ────────────────────► dist/index.html 서빙 │  │
│  │                                                                      │  │
│  │  5. Keep-Alive Cron (14분 주기, 프로덕션 전용):                       │  │
│  │     Express ──(Self Ping GET)──► /health                             │  │
│  │     (Render 인스턴스 15분 Sleep 방지)                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

1. **단일 서비스 통합 서빙**:
   - Render.com에서 `npm run build`를 실행하면 프론트엔드 Vite 프로젝트가 `frontend/dist`로 빌드됩니다.
   - 백엔드 Express 서버가 프로덕션 모드(`NODE_ENV=production`)에서 이 `dist` 폴더를 정적 파일로 서빙하며, React Router(SPA) 새로고침을 위해 모든 알 수 없는 경로를 `index.html`로 연결(Fallback)합니다.
2. **14분 Keep-Alive Cron**:
   - Render 무료 티어는 15분 동안 인바운드 요청이 없으면 서버가 절전(Sleep) 상태로 들어갑니다.
   - 백엔드에 내장된 Cron 작업이 14분마다 서버 자체의 `/health` 주소로 GET 요청을 보내 서버를 항상 깨어있는 상태(Always Active)로 유지합니다. (로컬 개발 환경에서는 자동으로 스킵됩니다.)

---

## 2. 배포 전 준비 사항

### 1) Git 최신 코드 푸시
로컬에서 수정한 코드를 GitHub의 `main` 브랜치에 커밋 및 푸시합니다.
```bash
git add .
git commit -m "feat: setup unified render deployment and keep-alive cron"
git push origin main
```

### 2) 환경 변수 준비
배포 시 Render.com 대시보드에 입력할 키 값들을 미리 정리해둡니다:
- `NODE_ENV`: `production`
- `MONGODB_URI`: MongoDB Atlas 연결 URL
- `CLERK_PUBLISHABLE_KEY`: Clerk 공개 키 (`pk_test_...`)
- `CLERK_SECRET_KEY`: Clerk 비밀 키 (`sk_test_...`)
- `VITE_CLERK_PUBLISHABLE_KEY`: 프론트엔드 빌드 시 주입될 Clerk 공개 키 (`pk_test_...`)
- `CLOUDINARY_CLOUD_NAME`: Cloudinary 클라우드 이름
- `CLOUDINARY_API_KEY`: Cloudinary API 키
- `CLOUDINARY_API_SECRET`: Cloudinary API 시크릿

> 💡 **참고 (PORT 관련)**: Render.com에서는 시스템이 `PORT` 환경 변수를 자동 생성하여 주입하므로, 환경 변수 목록에 `PORT`를 따로 넣지 않아도 서버가 자동 바인딩됩니다.

---

## 3. 프로젝트 내 구현된 핵심 코드 구성

### ① 루트 `package.json` (통합 빌드 및 실행 스크립트)
```json
{
  "name": "webmobile-imessage",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:backend": "npm run dev --prefix backend",
    "dev:frontend": "npm run dev --prefix frontend",
    "build": "npm install --prefix backend && npm install --prefix frontend && npm run build --prefix frontend",
    "start": "npm start --prefix backend"
  }
}
```

### ② `backend/src/lib/cron.js` (14분 슬립 방지 Cron)
- 로컬 개발 환경(`process.env.NODE_ENV !== "production"`)에서는 실행되지 않고,
- Render 배포 환경에서만 14분마다 `/health` 엔드포인트를 호출합니다.

```javascript
import { CronJob } from "cron";
import https from "https";
import http from "http";

export const initKeepAliveCron = (port = process.env.PORT || 3000) => {
  // 로컬 개발 환경에서는 cron 작업을 실행하지 않음
  if (process.env.NODE_ENV !== "production") {
    console.log("[Keep-Alive Cron] Skipped in local/development environment.");
    return;
  }

  const serverUrl =
    process.env.SERVER_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${port}`;

  const healthUrl = `${serverUrl.replace(/\/$/, "")}/health`;

  // 14분마다 실행: '*/14 * * * *'
  const job = new CronJob("*/14 * * * *", () => {
    console.log(`[Keep-Alive Cron] Sending ping to: ${healthUrl} at ${new Date().toISOString()}`);

    const client = healthUrl.startsWith("https") ? https : http;

    client
      .get(healthUrl, (res) => {
        if (res.statusCode === 200) {
          console.log(`[Keep-Alive Cron] Ping successful (Status: ${res.statusCode})`);
        } else {
          console.warn(`[Keep-Alive Cron] Ping responded with status: ${res.statusCode}`);
        }
      })
      .on("error", (err) => {
        console.error(`[Keep-Alive Cron] Ping failed:`, err.message);
      });
  });

  job.start();
  console.log(`[Keep-Alive Cron] Initialized. Pinging ${healthUrl} every 14 minutes.`);
};
```

### ③ `backend/src/server.js` (정적 서빙 우선순위, Express 5 라우팅, CORS)
```javascript
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import { clerkMiddleware } from "@clerk/express";
import { initKeepAliveCron } from "./lib/cron.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수 로드 (루트 또는 backend 디렉토리 실행 모두 지원)
const envPath = fs.existsSync(path.resolve(__dirname, "../.env"))
  ? path.resolve(__dirname, "../.env")
  : path.resolve(".env");
dotenv.config({ path: envPath, quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// 1. 정적 파일 서빙 최우선 배치 (CORS/Auth 미들웨어보다 앞에 두어 500 MIME 에러 방지)
const candidateDistPaths = [
  path.resolve(__dirname, "../../frontend/dist"),
  path.resolve(__dirname, "../frontend/dist"),
  path.resolve(process.cwd(), "frontend/dist"),
  path.resolve(process.cwd(), "../frontend/dist"),
];
const distPath =
  candidateDistPaths.find((p) => fs.existsSync(p)) || candidateDistPaths[0];

if (process.env.NODE_ENV === "production" && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// 2. CORS 설정 (배포 도메인, 로컬, 모바일 앱 모두 지원)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8081",
  process.env.CLIENT_URL?.replace(/\/$/, ""),
  process.env.SERVER_URL?.replace(/\/$/, ""),
  process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, ""),
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const isAllowed =
        process.env.NODE_ENV !== "production" ||
        allowedOrigins.includes(origin) ||
        origin.endsWith(".onrender.com") ||
        origin.includes("localhost");

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Rejected origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(clerkMiddleware());

// Health Check 라우트
app.get("/health", (_, res) => {
  res.status(200).json({
    message: "iMessage Backend is healthy...",
    timestamp: new Date().toLocaleString(),
  });
});

// 3. SPA Fallback (Express 5 정규식 문법 /.*/ 사용)
if (process.env.NODE_ENV === "production" && fs.existsSync(distPath)) {
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// 글로벌 에러 핸들러
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({
    error: err.message || "Internal Server Error",
  });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      initKeepAliveCron(PORT);
    });
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1);
  });
```

---

## 4. Render.com 대시보드 설정 단계별 가이드

### Step 1: Render.com 로그인 & 새 서비스 생성
1. [Render.com](https://render.com/)에 접속하여 로그인합니다.
2. 대시보드 우측 상단의 **+ New** 버튼을 누르고 **Web Service**를 선택합니다.

### Step 2: GitHub 리포지토리 연결
1. **Build and deploy from a Git repository**를 선택하고 **Next**를 누릅니다.
2. `webMobile-imessage` 저장소를 찾아서 **Connect**를 클릭합니다.

### Step 3: 기본 설정 및 빌드/실행 명령어 입력
화면의 설정 항목을 아래와 같이 정확하게 입력합니다:

| 항목 | 입력할 내용 | 설명 |
| :--- | :--- | :--- |
| **Name** | `webmobile-imessage` (원하는 이름) | 서비스 식별 이름 및 서브도메인이 됩니다 |
| **Region** | `Singapore (Southeast Asia)` 또는 `Oregon (US West)` | 원하는 리전 선택 |
| **Branch** | `main` | 배포할 Git 브랜치 |
| **Root Directory** | *(비워 둠)* | 루트 디렉토리에서 실행하므로 비워둡니다 |
| **Runtime** | `Node` | Node.js 환경 |
| **Build Command** | `npm run build` | 백엔드/프론트엔드 의존성 설치 및 React 빌드 |
| **Start Command** | `npm start` | 백엔드 Express 서버 시작 |
| **Instance Type** | `Free` ($0/month) | 무료 티어 선택 |

### Step 4: 환경 변수(Environment Variables) 등록
페이지 하단의 **Environment Variables** 섹션에서 **Add Environment Variable**을 눌러 다음 변수들을 등록합니다:

| Key | Value (값 예시) | 설명 |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | 프로덕션 모드 활성화 (정적 서빙 & Cron 활성화) |
| `MONGODB_URI` | `mongodb+srv://...` | MongoDB Atlas 연결 문자열 |
| `CLERK_PUBLISHABLE_KEY` | `pk_test_...` | Clerk 공개 키 |
| `CLERK_SECRET_KEY` | `sk_test_...` | Clerk 비밀 키 |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test_...` | 프론트엔드 React Vite 빌드용 공개 키 |
| `CLOUDINARY_CLOUD_NAME` | `dbfsq5eup` | Cloudinary 클라우드 이름 |
| `CLOUDINARY_API_KEY` | `574263248134532` | Cloudinary API 키 |
| `CLOUDINARY_API_SECRET` | `teixqG8ZWmn7wnWkrqUpIb4Op1M` | Cloudinary API 시크릿 |

> 💡 **주의**: `PORT` 환경 변수는 Render.com이 자체 포트를 자동 주입하므로 추가하지 않아도 됩니다.

### Step 5: 배포 시작
모든 설정이 끝났으면 페이지 맨 아래의 **Create Web Service** (또는 **Deploy Web Service**) 버튼을 클릭합니다.

---

## 5. 배포 후 확인 및 검증

### 1) 빌드 및 배포 로그 확인
Render 대시보드의 **Logs** 탭에서 실시간 배포 로그를 확인합니다:
```text
==> Running build command 'npm run build'...
==> frontend built successfully!
==> Starting service with 'npm start'...
MongoDB connected: ...
Server running on port 10000
[Keep-Alive Cron] Initialized. Pinging https://webmobile-imessage.onrender.com/health every 14 minutes.
==> Your service is live 🎉
```

### 2) 웹 애플리케이션 및 Health Check 접속
- 배포가 완료되면 상단 URL(`https://webmobile-imessage.onrender.com`)을 클릭하여 접속합니다.
- React 프론트엔드 화면과 Clerk 버튼이 정상 렌더링되는지 확인합니다.
- `https://webmobile-imessage.onrender.com/health` 접속 시 200 OK JSON이 반환되는지 확인합니다.

### 3) 14분 Cron 동작 확인
- 배포 후 14분 주기로 Render의 **Logs** 탭에 아래 메시지가 기록됩니다:
```text
[Keep-Alive Cron] Sending ping to: https://webmobile-imessage.onrender.com/health at 2026-09-29T...
[Keep-Alive Cron] Ping successful (Status: 200)
```

---

## 6. 자주 묻는 질문 및 문제 해결 (Troubleshooting)

### Q1. `Refused to apply style ... MIME type ('text/html') is not a supported stylesheet` 및 500 에러
- **원인**:
  1. `app.use(express.static)`가 CORS 또는 인증 미들웨어보다 뒤에 있어서 정적 파일 요청이 CORS 거부 오류(500)에 걸렸거나,
  2. `dist` 경로가 올바르게 잡히지 않아 CSS 요청이 SPA 라우트로 넘어가 `index.html`을 응답했을 때 발생합니다.
- **해결책**:
  - `backend/src/server.js`에서 `express.static(distPath)`를 CORS 미들웨어보다 맨 위에 배치하고, `candidateDistPaths`로 절대 경로를 보장합니다.

### Q2. `PathError: Missing parameter name at index 1: *` 에러로 서버가 꺼져요.
- **원인**: Express 5에서는 `app.get("*", ...)` 문법이 지원되지 않습니다.
- **해결책**: 정규식 와일드카드 `app.get(/.*/, ...)`를 사용하여 SPA Fallback을 처리합니다.

### Q3. 프론트엔드에서 Clerk Publishable Key 누락 에러가 발생해요.
- **해결책**: Render 환경 변수에 `VITE_CLERK_PUBLISHABLE_KEY`가 정확하게 등록되어 있는지 확인 후, Render 대시보드에서 **Manual Deploy** ➡️ **Clear build cache & deploy**를 실행합니다.
