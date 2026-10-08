# 🚀 Clerk 완전 정복 가이드 (Frontend, Backend & MongoDB Webhook 연동)

이 가이드는 **Clerk** 인증 서비스를 React(Frontend), Express(Backend), 그리고 **MongoDB(Mongoose)**와 완벽하게 연동하고 실시간 동기화(Webhook)를 구현하기 위해 **현재 프로젝트에 실제로 작성된 코드와 설정**을 단계별로 체계적으로 정리한 문서입니다.

---

## 📌 목차
1. [🌟 Clerk & MongoDB 실시간 동기화 아키텍처](#1-clerk--mongodb-실시간-동기화-아키텍처)
2. [1. Clerk Dashboard 초기 설정 & API Key 발급](#2-1-clerk-dashboard-초기-설정--api-key-발급)
3. [2. Frontend (React + Vite) 연동 가이드](#3-2-frontend-react--vite-연동-가이드)
4. [3. Backend (Express) 기본 설정 및 API 보호](#4-3-backend-express-기본-설정-및-api-보호)
5. [4. Clerk Dashboard에서 Webhook 등록하기 (UI 상세 가이드)](#5-4-clerk-dashboard에서-webhook-등록하기-ui-상세-가이드)
6. [5. 백엔드 Webhook 실제 구현 코드 총정리](#6-5-백엔드-webhook-실제-구현-코드-총정리)
   - [Step 1: MongoDB User 모델 (`backend/src/models/user.model.js`)](#step-1-mongodb-user-모델-backendsrcmodelsusermodeljs)
   - [Step 2: Clerk Webhook 핸들러 (`backend/src/webhooks/clerk.webhook.js`)](#step-2-clerk-webhook-핸들러-backendsrcwebhooksclerkwebhookjs)
   - [Step 3: Server에 Webhook 라우트 연결 (`backend/src/server.js`)](#step-3-server에-webhook-라우트-연결-backendsrcserverjs)
7. [6. Webhook 테스트 및 검증 방법](#7-6-webhook-테스트-및-검증-방법)
8. [7. 자주 발생하는 오류 및 트러블슈팅 (Troubleshooting)](#8-7-자주-발생하는-오류-및-트러블슈팅-troubleshooting)

---

## 1. 🌟 Clerk & MongoDB 실시간 동기화 아키텍처

Clerk를 인증 공급자로 사용할 때, 사용자가 회원가입/수정/탈퇴하면 Clerk 서버가 우리 백엔드 서버의 `/api/webhooks/clerk` 엔드포인트로 Webhook 이벤트를 전송합니다.

백엔드는 `@clerk/backend/webhooks`의 `verifyWebhook`을 통해 서명을 안전하게 검증한 뒤, **MongoDB `User` 컬렉션에 실시간으로 Upsert(생성/갱신) 및 Delete(삭제)**를 처리합니다.

```
+-----------------------------------------------------------------------------------------+
| 1. 사용자 액션 (회원가입 / 프로필 수정 / 회원탈퇴)                                             |
|    [React Frontend] ────(Clerk UI / SDK)────► [Clerk Cloud Server]                      |
+-----------------------------------------------------------------------------------------+
                                             │
                                             ▼ (Webhook 이벤트 발송)
+-----------------------------------------------------------------------------------------+
| 2. Clerk Webhook 발송 (POST /api/webhooks/clerk)                                        |
|    - Headers: svix-id, svix-timestamp, svix-signature                                   |
|    - Payload: Raw JSON Buffer (user.created / user.updated / user.deleted)              |
+-----------------------------------------------------------------------------------------+
                                             │
                                             ▼
+-----------------------------------------------------------------------------------------+
| 3. Express Backend (backend/src/webhooks/clerk.webhook.js)                              |
|    - express.raw({ type: 'application/json' })로 원본 Payload 보존                       |
|    - verifyWebhook(request, { signingSecret }) 서명 검증                                 |
|    - User.findOneAndUpdate(..., { upsert: true }) / User.deleteOne(...)                 |
+-----------------------------------------------------------------------------------------+
```

---

## 2. 1. Clerk Dashboard 초기 설정 & API Key 발급

1. [Clerk 공식 홈페이지](https://clerk.com/)에 접속하여 로그인합니다.
2. 새 애플리케이션 생성 (**Add application**):
   - 애플리케이션 이름을 입력합니다 (예: `iMessage Web & Mobile`).
   - 로그인 방식(Email, Google, GitHub 등)을 선택하고 **Create application**을 클릭합니다.
3. 좌측 메뉴의 **Configure ➡️ Developers ➡️ API Keys**로 이동하여 다음 키들을 복사합니다:
   - `Publishable key` (Frontend용, `pk_test_...`)
   - `Secret key` (Backend용, `sk_test_...`)

---

## 3. 2. Frontend (React + Vite) 연동 가이드

### Step 1: 라이브러리 설치
`frontend` 폴더에서 `@clerk/react`를 설치합니다.

```bash
cd frontend
npm install @clerk/react
```

### Step 2: 환경 변수 설정
`frontend/.env` 파일에 Clerk Publishable Key를 추가합니다.

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
```

### Step 3: `main.jsx`에 ClerkProvider 설정
React 애플리케이션 최상단을 `ClerkProvider`로 감싸줍니다.

```jsx
// frontend/src/main.jsx
import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";
import App from "./App.jsx";
import "./index.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!PUBLISHABLE_KEY) {
  throw new Error("Missing Publishable Key: VITE_CLERK_PUBLISHABLE_KEY is not defined.");
}

createRoot(document.getElementById("root")).render(
  <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
    <App />
  </ClerkProvider>,
);
```

### Step 4: UI 컴포넌트 및 인증 상태 사용 예시
`@clerk/react`의 `<Show>`, `<SignInButton>`, `<SignUpButton>`, `<UserButton>` 컴포넌트를 사용합니다.

```jsx
// frontend/src/App.jsx
import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/react";

const App = () => {
  return (
    <div>
      <h1>App execute</h1>
      <header>
        <Show when="signed-out">
          <SignInButton mode="modal" />
          <SignUpButton mode="modal" />
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>
    </div>
  );
};

export default App;
```

---

## 4. 3. Backend (Express) 기본 설정 및 API 보호

### Step 1: 라이브러리 설치
`backend` 폴더에서 필수 패키지들을 설치합니다.

```bash
cd backend
npm install @clerk/express @clerk/backend express mongoose cors dotenv
```

### Step 2: 환경 변수 설정 (`backend/.env`)

```env
PORT=3000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

MONGODB_URI=mongodb+srv://...

CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
CLERK_WEBHOOK_SIGNING_SECRET=whsec_your_webhook_signing_secret
```

---

## 5. 4. Clerk Dashboard에서 Webhook 등록하기 (UI 상세 가이드)

### [단계 1] Webhooks 메뉴 이동
1. [Clerk Dashboard](https://dashboard.clerk.com/) 로그인 ➡️ 애플리케이션 선택
2. 좌측 메뉴에서 **Configure** ➡️ **Developers** ➡️ **Webhooks** 클릭

### [단계 2] 새 Endpoint 추가 (**Add Endpoint**)
1. 우측 상단의 **Add Endpoint** 클릭
2. **Endpoint URL** 입력:
   - **로컬 개발 테스트 시**: `https://<ngrok주소>.ngrok-free.app/api/webhooks/clerk`
   - **Render 배포 환경**: `https://webmobile-imessage.onrender.com/api/webhooks/clerk`
3. **Subscribe to events (3가지 필수 이벤트 체크)**:
   - ✅ `user.created` (회원가입)
   - ✅ `user.updated` (프로필/이름/아바타 수정)
   - ✅ `user.deleted` (회원 탈퇴/계정 삭제)
4. **Create** 버튼 클릭하여 엔드포인트 생성

### [단계 3] Signing Secret (`whsec_...`) 복사
1. 생성된 엔드포인트 화면 우측의 **Signing Secret**에서 눈 모양 클릭 후 복사
   - 형태: `whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### [단계 4] 환경 변수 등록 (로컬 & Render.com 배포 환경)

#### 1) 로컬 개발 환경 (`backend/.env`)
```env
CLERK_WEBHOOK_SIGNING_SECRET=whsec_your_copied_secret_key
```

#### 2) Render.com 배포 환경 (프로덕션)
1. [Render Dashboard](https://dashboard.render.com/) 로그인 ➡️ 배포된 **Web Service** 클릭
2. 좌측 **Environment** 탭 ➡️ **Add Environment Variable** 클릭
3. **Key**: `CLERK_WEBHOOK_SIGNING_SECRET` (또는 `CLERK_WEBHOOK_SECRET`)
4. **Value**: Clerk에서 복사한 `whsec_...` 입력 ➡️ **Save Changes** 클릭
   *(Render가 자동으로 최신 환경 변수를 주입하여 무중단 자동 재배포합니다.)*

---

## 6. 5. 백엔드 Webhook 실제 구현 코드 총정리

현재 프로젝트에 구현된 3가지 핵심 파일의 실제 코드입니다.

```
backend/src/
 ├─ models/
 │   └─ user.model.js           # 1. MongoDB User 모델 스키마
 ├─ webhooks/
 │   └─ clerk.webhook.js        # 2. Clerk verifyWebhook & MongoDB Upsert/Delete 로직
 └─ server.js                   # 3. Raw Body 파서 적용 및 엔드포인트(/api/webhooks/clerk) 라우팅
```

---

### Step 1: MongoDB User 모델 (`backend/src/models/user.model.js`)

Clerk의 `user.id`를 저장하는 고유 인덱스 `clerkId` 필드가 정의되어 있습니다.

```javascript
// backend/src/models/user.model.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    clerkId: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    profilePic: {
      type: String,
      default: "",
    },
    bio: {
      type: String,
    },
    lastActive: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      default: "offline", // "online", "offline", "busy"
    },
    // relationship
    contacts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
```

---

### Step 2: Clerk Webhook 핸들러 (`backend/src/webhooks/clerk.webhook.js`)

`@clerk/backend/webhooks`의 `verifyWebhook` 함수를 사용하여 서명을 검증하고, `findOneAndUpdate`의 `upsert: true` 옵션을 사용하여 가입/수정을 원자적(Atomic)으로 처리합니다.

```javascript
// backend/src/webhooks/clerk.webhook.js
import express from 'express';
import User from '../models/user.model.js';
import { verifyWebhook } from '@clerk/backend/webhooks';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const signingSecret =
      process.env.CLERK_WEBHOOK_SIGNING_SECRET ||
      process.env.CLERK_WEBHOOK_SECRET;
    if (!signingSecret) {
      console.error('Missing webhook signing secret');
      return res.status(503).json({ error: 'webhook signing secret missing' });
    }

    // Clerk의 서명 검증기는 raw body 웹 요청을 요구하므로 Buffer를 문자열로 변환
    const payload = Buffer.isBuffer(req.body)
      ? req.body.toString('utf-8')
      : String(req.body);

    const request = new Request('http://internal/webhooks/clerk', {
      method: 'POST',
      headers: new Headers(req.headers),
      body: payload,
    });

    const evt = await verifyWebhook(request, { signingSecret });
    console.log(`[Clerk Webhook] Received event: ${evt.type}`);

    // 🟢 회원가입(user.created) 및 회원정보 수정(user.updated) 처리
    if (evt.type === 'user.created' || evt.type === 'user.updated') {
      const u = evt.data;
      const email =
        u.email_addresses?.find((e) => e.id === u.primary_email_address_id)
          ?.email_address ?? u.email_addresses?.[0]?.email_address;
      if (!email) {
        console.warn(`[Clerk Webhook] User has no email address (Clerk ID: ${u.id})`);
        return res.status(400).json({ error: 'User has no email address' });
      }
      const fullName =
        [u.first_name, u.last_name].filter(Boolean).join(' ') ||
        u.username ||
        email.split('@')[0];

      const profilePic = u.image_url || '';

      // Upsert를 통해 race condition 없이 안전하게 MongoDB에 저장/업데이트
      const updatedUser = await User.findOneAndUpdate(
        { clerkId: u.id },
        {
          clerkId: u.id,
          email,
          fullName,
          profilePic,
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
      console.log(`[Clerk Webhook] ✅ MongoDB sync success for user: ${updatedUser._id} (${fullName})`);
    }

    // 🔴 회원 탈퇴(user.deleted) 처리
    if (evt.type === 'user.deleted') {
      if (evt.data.id) {
        await User.deleteOne({ clerkId: evt.data.id });
        console.log(`[Clerk Webhook] 🗑️ User deleted from MongoDB: ${evt.data.id}`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Clerk Webhook] ❌ Webhook error:', error.message || error);
    res.status(400).json({ message: 'Webhook verification failed', error: error.message });
  }
});

export default router;
```

---

### Step 3: Server에 Webhook 라우트 연결 (`backend/src/server.js`)

⚠️ **핵심 구현 원칙**:
Webhook 검증은 원본 바이트(Raw Buffer)를 기준으로 서명을 계산하므로, `/api/webhooks/clerk` 라우트는 **반드시 `express.raw({ type: '*/*' })` 미들웨어와 함께 `express.json()`보다 앞선 줄에 배치**해야 합니다.

```javascript
// backend/src/server.js (주요 Webhook 설정 발췌)
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { clerkMiddleware } from '@clerk/express';
import connectDB from './config/db.js';
import clerkWebhookHandler from './webhooks/clerk.webhook.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));

// ⚠️ 1. Webhook 라우트는 express.json()보다 먼저 raw body 파서와 함께 등록
app.use(
  '/api/webhooks/clerk',
  express.raw({ type: '*/*' }),
  clerkWebhookHandler,
);

// 2. 일반 API용 JSON 파서 및 Clerk 미들웨어
app.use(express.json());
app.use(clerkMiddleware());

// Health check 라우트
app.get('/health', (_, res) => {
  res.status(200).json({ message: 'iMessage Backend is healthy...' });
});

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
```

---

## 7. 6. Webhook 테스트 및 검증 방법

### 1) Clerk Dashboard 자체 [Testing] 탭 활용 (가장 빠른 방법)
1. Clerk Dashboard ➡️ **Webhooks** ➡️ 등록한 엔드포인트 클릭
2. 상단의 **Testing** 탭 선택 ➡️ `user.created` 선택
3. 우측 하단의 **Send Example** 버튼 클릭
4. 하단의 **Webhook Attempts** 로그에서 `200` 정상 수신 확인

### 2) 로컬 개발 환경에서 ngrok 실시간 테스트
1. 백엔드 실행:
   ```bash
   cd backend
   npm run dev
   ```
2. ngrok 터널 실행:
   ```bash
   npx ngrok http 3000
   ```
3. Clerk 대시보드의 Endpoint URL을 `https://<ngrok주소>/api/webhooks/clerk`로 등록
4. 프론트엔드(`localhost:5173`)에서 로그인/회원가입 진행 후 MongoDB Atlas에 데이터가 실시간 추가되는지 확인

### 3) Render 배포 환경 연동 및 실시간 검증
1. **Render 도메인 확인**: `https://webmobile-imessage.onrender.com`
2. **Clerk 대시보드 Webhook 등록**: Endpoint URL을 `https://webmobile-imessage.onrender.com/api/webhooks/clerk`로 설정
3. **Render 환경 변수 등록**: Clerk에서 발급된 Signing Secret을 Render 대시보드 `Environment`의 `CLERK_WEBHOOK_SIGNING_SECRET`에 입력 후 저장
4. **동작 검증**: 배포된 웹사이트에서 회원가입 후 Render 대시보드 Logs 및 MongoDB Atlas `users` 컬렉션 실시간 동기화 확인

---

## 8. 7. 자주 발생하는 오류 및 트러블슈팅 (Troubleshooting)

| 오류 증상 | 원인 | 해결 방법 |
| :--- | :--- | :--- |
| **`400 Webhook verification failed`** | 1. `CLERK_WEBHOOK_SIGNING_SECRET` 값 불일치<br>2. `express.json()`이 먼저 실행되어 body가 변조됨 | 1. Clerk 대시보드의 Signing Secret(`whsec_...`) 값을 `.env` 및 Render 환경변수에 정확히 입력<br>2. `server.js`에서 `/api/webhooks/clerk`를 `express.json()` **보다 앞선 줄**에 `express.raw`와 함께 배치 |
| **`503 webhook signing secret missing`** | 환경 변수에 Signing Secret이 정의되지 않음 | `.env` 또는 Render 대시보드에 `CLERK_WEBHOOK_SIGNING_SECRET` 등록 확인 |
| **`400 User has no email address`** | 가입 계정에 이메일 주소가 비어있음 | Clerk 대시보드에서 `Email address`가 필수(Required) 로그인 수단으로 체크되어 있는지 확인 |

---

✅ 이 가이드는 현재 프로젝트의 실제 소스 코드 구조([`user.model.js`](file:///Users/guniluk/Desktop/CLI/webMobile-imessage/backend/src/models/user.model.js), [`clerk.webhook.js`](file:///Users/guniluk/Desktop/CLI/webMobile-imessage/backend/src/webhooks/clerk.webhook.js), [`server.js`](file:///Users/guniluk/Desktop/CLI/webMobile-imessage/backend/src/server.js))와 100% 일치하도록 작성되었습니다.
