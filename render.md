# 🌐 Render.com 풀스택(Frontend + Backend) 단일 배포 & Keep-Alive 가이드

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
                        ▼ (https://your-app.onrender.com)
┌────────────────────────────────────────────────────────┐
│                   Render.com 웹 서비스                 │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │               Node.js (Express 서버)             │  │
│  │                                                  │  │
│  │  1. API 요청: (/api/...) ────────► 백엔드 로직   │  │
│  │  2. Health Check: (/health) ────► 200 OK 응답   │  │
│  │  3. 웹 페이지 요청: (/*) ───────► frontend/dist │  │
│  │     (index.html 및 빌드된 정적 리소스 서빙)     │  │
│  │                                                  │  │
│  │  4. Keep-Alive Cron (14분 주기):                 │  │
│  │     Express ──(Self Ping GET)──► /health         │  │
│  │     (Render 인스턴스 슬립 방지)                  │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

1. **단일 서비스 통합 서빙**:
   - Render.com에서 `npm run build`를 실행하면 프론트엔드 Vite 프로젝트가 `frontend/dist`로 빌드됩니다.
   - 백엔드 Express 서버가 프로덕션 모드(`NODE_ENV=production`)에서 이 `dist` 폴더를 정적 파일로 서빙하며, React Router(SPA) 새로고침을 위해 모든 알 수 없는 경로를 `index.html`로 연결(Fallback)합니다.
2. **14분 Keep-Alive Cron**:
   - Render 무료 티어는 15분 동안 인바운드 요청이 없으면 서버가 절전(Sleep) 상태로 들어갑니다.
   - 백엔드에 내장된 Cron 작업이 14분마다 서버 자체의 `/health` 주소로 GET 요청을 보내 서버를 항상 깨어있는 상태(Always Active)로 유지합니다.

---

## 2. 배포 전 준비 사항

### 1) Git 최신 코드 푸시
로컬에서 수정한 코드를 GitHub의 `main` 브랜치에 커밋 및 푸시합니다.
```bash
git add .
git commit -m "feat: configure unified render deployment and keep-alive cron"
git push origin main
```

### 2) 환경 변수 준비
배포 시 Render.com 대시보드에 입력할 키 값들을 미리 정리해둡니다:
- `MONGODB_URI`: MongoDB Atlas 연결 URL
- `CLERK_PUBLISHABLE_KEY`: Clerk 공개 키 (`pk_test_...`)
- `CLERK_SECRET_KEY`: Clerk 비밀 키 (`sk_test_...`)
- `VITE_CLERK_PUBLISHABLE_KEY`: 프론트엔드 빌드 시 주입될 Clerk 공개 키 (`pk_test_...`)
- `CLOUDINARY_CLOUD_NAME`: Cloudinary 클라우드 이름
- `CLOUDINARY_API_KEY`: Cloudinary API 키
- `CLOUDINARY_API_SECRET`: Cloudinary API 시크릿

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

### ③ `backend/src/server.js` (정적 서빙, CORS, Cron 시작)
```javascript
// 프로덕션 모드: frontend 빌드 결과물 정적 서빙 및 SPA fallback
if (process.env.NODE_ENV === "production") {
  const distPath = fs.existsSync(path.resolve("frontend/dist"))
    ? path.resolve("frontend/dist")
    : path.resolve("../frontend/dist");

  app.use(express.static(distPath));

  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      initKeepAliveCron(PORT); // Cron 활성화
    });
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
| **Build Command** | `npm run build` | 백엔드/프론트엔드 설치 및 React 빌드 |
| **Start Command** | `npm start` | 백엔드 Express 서버 시작 |
| **Instance Type** | `Free` ($0/month) | 무료 티어 선택 |

### Step 4: 환경 변수(Environment Variables) 등록
페이지 하단의 **Environment Variables** 섹션에서 **Add Environment Variable**을 눌러 다음 변수들을 등록합니다:

| Key | Value (값 예시) |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `MONGODB_URI` | `mongodb+srv://...` |
| `CLERK_PUBLISHABLE_KEY` | `pk_test_...` |
| `CLERK_SECRET_KEY` | `sk_test_...` |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_test_...` |
| `CLOUDINARY_CLOUD_NAME` | `dbfsq5eup` |
| `CLOUDINARY_API_KEY` | `574263248134532` |
| `CLOUDINARY_API_SECRET` | `teixqG8ZWmn7wnWkrqUpIb4Op1M` |

> 💡 **참고**: `SERVER_URL`은 따로 등록하지 않아도 Render가 기본적으로 제공하는 `RENDER_EXTERNAL_URL`(`https://<app-name>.onrender.com`)을 우리 Cron 코드가 자동으로 감지하여 핑을 보냅니다.

### Step 5: 배포 시작
모든 설정이 끝났으면 페이지 맨 아래의 **Create Web Service** (또는 **Deploy Web Service**) 버튼을 클릭합니다.

---

## 5. 배포 후 확인 및 검증

### 1) 빌드 및 배포 로그 확인
- Render 대시보드의 **Logs** 탭에서 실시간 배포 로그를 확인합니다:
  ```text
  ==> Running build command 'npm run build'...
  ==> frontend built successfully!
  ==> Starting service with 'npm start'...
  Server running on port 3000
  MongoDB connected successfully...
  [Keep-Alive Cron] Initialized. Pinging https://webmobile-imessage.onrender.com/health every 14 minutes.
  ==> Your service is live 🎉
  ```

### 2) 웹 애플리케이션 및 Health Check 접속
- 배포가 완료되면 상단에 생성된 URL(예: `https://webmobile-imessage.onrender.com`)을 클릭하여 접속합니다.
- React 프론트엔드 UI 및 Clerk 로그인 화면이 정상적으로 열리는지 확인합니다.
- `https://webmobile-imessage.onrender.com/health`로 접속하여 `{ "message": "iMessage Backend is healthy..." }` JSON 응답이 반환되는지 확인합니다.

### 3) 14분 Cron 동작 확인
- 14분이 지난 후 Render의 **Logs** 탭을 확인하면 아래와 같은 로그가 출력되는 것을 확인할 수 있습니다:
  ```text
  [Keep-Alive Cron] Sending ping to: https://webmobile-imessage.onrender.com/health at 2026-09-29T...
  [Keep-Alive Cron] Ping successful (Status: 200)
  ```

---

## 6. 자주 묻는 질문 및 문제 해결 (Troubleshooting)

### Q1. 프론트엔드에서 Clerk Publishable Key 에러가 발생해요.
- **원인**: Vite는 빌드 시점에 `VITE_` 접두사가 붙은 환경 변수를 번들에 포함합니다.
- **해결책**: Render 환경 변수에 `VITE_CLERK_PUBLISHABLE_KEY`가 정확하게 등록되어 있는지 확인 후 **Manual Deploy** -> **Clear build cache & deploy**를 진행합니다.

### Q2. 새로고침을 하면 404 Not Found가 발생해요.
- **해결책**: 백엔드 `server.js`의 `app.get("*", ...)` SPA Fallback 라우팅이 설정되어 있으므로 정상적으로 `index.html`이 응답됩니다. 배포 시 `NODE_ENV`가 `production`으로 설정되어 있는지 확인하세요.

### Q3. 로컬에서 개발할 때는 어떻게 실행하나요?
- 프론트엔드와 백엔드를 각각 독립된 터미널에서 실행합니다:
  - 백엔드: `npm run dev:backend` (포트 3000)
  - 프론트엔드: `npm run dev:frontend` (포트 5173)
- 로컬에서는 `[Keep-Alive Cron] Skipped in local/development environment.`가 출력되며 Cron이 작동하지 않습니다.
