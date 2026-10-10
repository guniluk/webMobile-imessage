# 🚀 Clerk 완전 정복 가이드 (Frontend, Backend & MongoDB Webhook 연동)

이 가이드는 **Clerk** 인증 서비스를 React(Frontend), Express(Backend), 그리고 **MongoDB(Mongoose)**와 완벽하게 연동하고 실시간 동기화(Webhook)를 구현하기 위해 **Clerk 사이트와 Render 사이트, MongoDB Atlas에서 해야 할 일들을 실제 작업 순서에 맞춰 세밀하게 정리**한 종합 가이드입니다.

---

## 📌 목차
1. [🌟 Clerk & MongoDB 실시간 동기화 아키텍처](#1-clerk--mongodb-실시간-동기화-아키텍처)
2. [1. Clerk Dashboard 초기 설정 & API Key 발급](#2-1-clerk-dashboard-초기-설정--api-key-발급)
3. [2. Frontend (React + Vite) 연동 가이드](#3-2-frontend-react--vite-연동-가이드)
4. [3. Backend (Express) 기본 설정 및 API 보호](#4-3-backend-express-기본-설정-및-api-보호)
5. [4. 🔄 [실전 배포 순서도] Render ↔️ Clerk ↔️ MongoDB Webhook 연동 6단계](#5-4-실전-배포-순서도-render-️-clerk-️-mongodb-webhook-연동-6단계)
   - [Step 1: (Render) 배포된 백엔드 서비스 URL 확인](#step-1-render-배포된-백엔드-서비스-url-확인)
   - [Step 2: (Clerk) Webhook Endpoint 등록 및 3대 이벤트 구독](#step-2-clerk-webhook-endpoint-등록-및-3대-이벤트-구독)
   - [Step 3: (Clerk) 해당 Endpoint의 고유 Signing Secret 복사](#step-3-clerk-해당-endpoint의-고유-signing-secret-복사)
   - [Step 4: (Render) Environment에 Signing Secret 등록 & 자동 재배포](#step-4-render-environment에-signing-secret-등록--자동-재배포)
   - [Step 5: (MongoDB Atlas) Network Access IP 화이트리스트 점검](#step-5-mongodb-atlas-network-access-ip-화이트리스트-점검)
   - [Step 6: (Clerk & Render) Testing 탭 및 실시간 Logs 검증](#step-6-clerk--render-testing-탭-및-실시간-logs-검증)
6. [5. 로컬 개발 환경 Webhook 테스트 가이드 (ngrok)](#6-5-로컬-개발-환경-webhook-테스트-가이드-ngrok)
7. [6. 백엔드 Webhook 실제 구현 코드 총정리 & 핵심 해설](#7-6-백엔드-webhook-실제-구현-코드-총정리--핵심-해설)
   - [Step 1: MongoDB User 모델 (`backend/src/models/user.model.js`)](#step-1-mongodb-user-모델-backendsrcmodelsusermodeljs)
   - [Step 2: Clerk Webhook 핸들러 (`backend/src/webhooks/clerk.webhook.js`)](#step-2-clerk-webhook-핸들러-backendsrcwebhooksclerkwebhookjs)
   - [Step 3: Server에 Webhook 라우트 연결 (`backend/src/server.js`)](#step-3-server에-webhook-라우트-연결-backendsrcserverjs)
8. [7. 자주 발생하는 오류 및 트러블슈팅 (Troubleshooting)](#8-7-자주-발생하는-오류-및-트러블슈팅-troubleshooting)

---

## 1. 🌟 Clerk & MongoDB 실시간 동기화 아키텍처

Clerk를 인증 공급자로 사용할 때, 사용자가 회원가입/프로필수정/회원탈퇴를 하면 Clerk 클라우드 서버가 우리 백엔드 서버의 `/api/webhooks/clerk` 엔드포인트로 Webhook 이벤트를 전송합니다.

백엔드는 `@clerk/backend/webhooks`의 `verifyWebhook`을 통해 요청 헤더의 Svix 암호화 서명을 안전하게 검증한 뒤, **MongoDB `User` 컬렉션에 실시간으로 Upsert(생성/갱신) 및 Delete(삭제)**를 원자적(Atomic)으로 처리합니다.

```
+---------------------------------------------------------------------------------------------------+
| 1. 사용자 액션 (회원가입 / 프로필 수정 / 회원탈퇴)                                                       |
|    [React Frontend] ────────────(Clerk UI / SDK)────────────► [Clerk Cloud Server]                |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼ (Webhook HTTP POST 이벤트 발송)
+---------------------------------------------------------------------------------------------------+
| 2. Clerk Webhook 발송 (POST /api/webhooks/clerk)                                                  |
|    - Headers: svix-id, svix-timestamp, svix-signature                                             |
|    - Payload: Raw JSON Buffer (user.created / user.updated / user.deleted)                        |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------+
| 3. Express Backend (backend/src/webhooks/clerk.webhook.js)                                        |
|    - express.raw({ type: '*/*' })로 원본 Payload 보존                                               |
|    - verifyWebhook(request, { signingSecret }) 서명 위변조 검증                                   |
|    - User.findOneAndUpdate(..., { upsert: true, returnDocument: 'after' }) / User.deleteOne(...)   |
+---------------------------------------------------------------------------------------------------+
                                                  │
                                                  ▼
+---------------------------------------------------------------------------------------------------+
| 4. MongoDB Atlas (users 컬렉션)                                                                    |
|    - clerkId 고유 인덱스 기반 실시간 동기화 완료 (fullName, email, profilePic 등)                   |
+---------------------------------------------------------------------------------------------------+
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
npm install @clerk/express @clerk/backend express mongoose cors dotenv cloudinary
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

## 5. 4. 🔄 [실전 배포 순서도] Render ↔️ Clerk ↔️ MongoDB Webhook 연동 6단계

배포 환경에서 Clerk 가입자가 MongoDB에 실시간 동기화되도록 설정할 때, **각 대시보드(Render, Clerk, MongoDB Atlas)를 오가며 진행해야 하는 실전 순서**입니다.

```
[1. Render]        배포 서비스 도메인 확인 (https://webmobile-imessage.onrender.com)
      │
      ▼
[2. Clerk]         Webhooks ➡️ Add Endpoint (URL 입력 + 3대 필수 이벤트 체크)
      │
      ▼
[3. Clerk]         해당 엔드포인트의 Signing Secret (whsec_...) 복사
      │
      ▼
[4. Render]        Environment 탭 ➡️ CLERK_WEBHOOK_SIGNING_SECRET 추가 ➡️ Save Changes
      │
      ▼
[5. MongoDB Atlas] Network Access ➡️ 0.0.0.0/0 (IP 허용) 활성화 확인
      │
      ▼
[6. 검증]          Clerk Testing 탭 (Send Example) ➡️ Render Logs 실시간 동기화 확인
```

---

### Step 1: (Render) 배포된 백엔드 서비스 URL 확인
1. [Render.com Dashboard](https://dashboard.render.com/)에 로그인합니다.
2. 배포 완료된 **Web Service** (예: `webmobile-imessage`)를 클릭합니다.
3. 서비스 화면 좌측 상단에 표시된 **공식 배포 URL**을 확인하고 복사합니다:
   - 예: `https://webmobile-imessage.onrender.com`

---

### Step 2: (Clerk) Webhook Endpoint 등록 및 3대 이벤트 구독
1. [Clerk Dashboard](https://dashboard.clerk.com/)에 로그인 후 해당 프로젝트를 선택합니다.
2. 좌측 메뉴에서 **Configure ➡️ Developers ➡️ Webhooks**로 이동합니다.
3. 우측 상단의 **Add Endpoint** 버튼을 클릭합니다.
4. **Endpoint URL**에 Step 1의 Render 주소 뒤에 `/api/webhooks/clerk`를 붙여 입력합니다:
   - `https://webmobile-imessage.onrender.com/api/webhooks/clerk`
   - *(💡 팁: 우리 백엔드 코드는 `/api/webhooks/clerk`와 `/api/webhooks`를 둘 다 지원합니다.)*
5. **Subscribe to events (Message Filtering)** 섹션에서 아래 **3가지 필수 이벤트**를 반드시 체크합니다:
   - ✅ `user.created` (신규 사용자 회원가입)
   - ✅ `user.updated` (프로필/이름/아바타 변경)
   - ✅ `user.deleted` (회원 탈퇴 / 계정 삭제)
6. 하단의 **Create** 버튼을 클릭하여 Endpoint를 생성합니다.

---

### Step 3: (Clerk) 해당 Endpoint의 고유 Signing Secret 복사
1. 생성이 완료되면 방금 만든 Webhook Endpoint의 상세 관리 화면으로 이동합니다.
2. 화면 우측의 **Signing Secret** 섹션에서 눈 모양 아이콘을 누르거나 **Copy** 버튼을 클릭합니다:
   - 키 형태: `whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - ⚠️ **매우 중요**: 엔드포인트를 새로 만들 때마다 Signing Secret이 고유하게 달라집니다. 반드시 Step 2에서 생성한 **그 엔드포인트의 Secret**을 복사해야 합니다.

---

### Step 4: (Render) Environment에 Signing Secret 등록 & 자동 재배포
1. 다시 [Render.com Dashboard](https://dashboard.render.com/)로 이동하여 해당 Web Service를 선택합니다.
2. 좌측 사이드바 메뉴에서 **Environment** 탭을 클릭합니다.
3. **Add Environment Variable** 버튼을 클릭하여 다음을 입력합니다:
   - **Key**: `CLERK_WEBHOOK_SIGNING_SECRET`
   - **Value**: Step 3에서 Clerk 대시보드로부터 복사한 `whsec_xxxxxxxx...`
4. 하단의 **Save Changes** 버튼을 클릭합니다.
   - 💡 `Save Changes`를 누르면 Render가 자동으로 새 환경 변수를 주입하여 서버를 무중단 재배포(Deploy)합니다.

---

### Step 5: (MongoDB Atlas) Network Access IP 화이트리스트 점검
Render 서버는 동적 IP를 사용하므로 MongoDB Atlas 접속이 차단되지 않도록 IP를 허용해야 합니다.

1. [MongoDB Atlas](https://cloud.mongodb.com/) 로그인 ➡️ 해당 클러스터 선택
2. 좌측 메뉴의 **Security ➡️ Network Access**로 이동
3. **IP Access List**에 **`0.0.0.0/0` (Allow Access from Anywhere)** 항목이 활성화되어 있는지 확인합니다:
   - 목록에 없다면 **Add IP Address** ➡️ **Allow Access from Anywhere (`0.0.0.0/0`)** 클릭 후 **Confirm**
   - *(⚠️ 만약 내 로컬 컴퓨터 IP만 등록되어 있다면, Render 서버에서 MongoDB로 연결을 시도할 때 타임아웃되어 가입자 생성이 실패합니다.)*

---

### Step 6: (Clerk & Render) Testing 탭 및 실시간 Logs 검증
1. **Clerk 대시보드에서 테스트 이벤트 발송**:
   - [Clerk Dashboard](https://dashboard.clerk.com/) ➡️ **Webhooks** ➡️ 생성한 Render 엔드포인트 클릭
   - 상단의 **Testing** 탭 클릭 ➡️ 이벤트 목록에서 `user.created` 선택
   - 우측 하단의 **Send Example** 버튼 클릭
   - 하단의 **Webhook Attempts** 표에 상태 코드 `200`이 뜨는지 확인
2. **Render 대시보드 실시간 로그 확인**:
   - [Render Dashboard](https://dashboard.render.com/) ➡️ Web Service ➡️ **Logs** 탭 확인:
     ```text
     [Clerk Webhook] 📩 Incoming webhook request received
     [Clerk Webhook] Received event: user.created
     [Clerk Webhook] ✅ MongoDB sync success for user: 6ac... (Example User)
     ```
3. **MongoDB Atlas 실시간 확인**:
   - MongoDB Atlas ➡️ **Database ➡️ Collections** ➡️ `users` 컬렉션에 새 사용자 도큐먼트가 들어왔는지 확인합니다.

---

## 6. 5. 로컬 개발 환경 Webhook 테스트 가이드 (ngrok)

로컬 컴퓨터(`localhost:3000`)에서 개발 및 테스트할 때는 외부 인터넷(Clerk)이 로컬 서버에 접근할 수 있도록 `ngrok` 터널을 이용합니다.

1. **백엔드 서버 실행**:
   ```bash
   cd backend
   npm run dev
   ```
2. **ngrok 터널 실행** (새 터미널 창):
   ```bash
   npx ngrok http 3000
   ```
3. **Clerk 대시보드에 로컬용 엔드포인트 등록**:
   - Clerk Dashboard ➡️ **Webhooks ➡️ Add Endpoint**
   - **Endpoint URL**: `https://<ngrok주소>.ngrok-free.app/api/webhooks/clerk`
   - 구독 이벤트: `user.created`, `user.updated`, `user.deleted` 체크 후 **Create**
4. **로컬 `.env` 환경 변수 설정**:
   - 생성된 로컬 엔드포인트의 **Signing Secret (`whsec_...`)**을 복사하여 `backend/.env`의 `CLERK_WEBHOOK_SIGNING_SECRET`에 입력하고 서버를 재시작합니다.
5. **동기화 확인**:
   - 프론트엔드 React 앱(`localhost:5173`)에서 회원가입을 진행하면 백엔드 터미널에 `[Clerk Webhook] ✅ MongoDB sync success` 로그가 출력되며 MongoDB Atlas에 즉시 반영됩니다.

---

## 7. 6. 백엔드 Webhook 실제 구현 코드 총정리 & 핵심 해설

현재 프로젝트에 구현되어 완벽히 작동하는 3가지 핵심 파일의 실제 코드입니다.

```
backend/src/
 ├─ models/
 │   └─ user.model.js           # 1. MongoDB User 모델 스키마
 ├─ webhooks/
 │   └─ clerk.webhook.js        # 2. Clerk verifyWebhook & MongoDB Upsert/Delete 로직
 └─ server.js                   # 3. Raw Body 파서 적용 및 엔드포인트 라우팅
```

---

### Step 1: MongoDB User 모델 (`backend/src/models/user.model.js`)

Clerk의 `user.id`(예: `user_2xyz...`)를 1:1로 매핑하기 위해 `clerkId` 필드에 고유 인덱스(`unique: true`)가 설정되어 있습니다.

```javascript
// backend/src/models/user.model.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    clerkId: {
      type: String,
      required: true,
      unique: true, // Clerk 고유 ID로 1:1 매핑
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

`@clerk/backend/webhooks`의 `verifyWebhook` 함수를 사용하여 서명을 검증하고, `findOneAndUpdate`의 `upsert: true, returnDocument: 'after'` 옵션을 사용하여 가입(`user.created`)과 정보수정(`user.updated`)을 원자적(Atomic)으로 처리합니다.

```javascript
// backend/src/webhooks/clerk.webhook.js
import express from 'express';
import User from '../models/user.model.js';
import { verifyWebhook } from '@clerk/backend/webhooks';

const router = express.Router();

router.post('/', async (req, res) => {
  console.log('[Clerk Webhook] 📩 Incoming webhook request received');
  try {
    const signingSecret = (
      process.env.CLERK_WEBHOOK_SIGNING_SECRET ||
      process.env.CLERK_WEBHOOK_SECRET
    )?.trim();
    if (!signingSecret) {
      console.error('[Clerk Webhook] ❌ Missing webhook signing secret (CLERK_WEBHOOK_SIGNING_SECRET)');
      return res.status(503).json({ error: 'webhook signing secret missing' });
    }

    // Clerk의 서명 검증기는 raw body 웹 요청을 요구하므로 Buffer를 UTF-8 문자열로 변환
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
Webhook 검증은 원본 바이트(Raw Buffer)를 기준으로 서명을 계산하므로, Webhook 라우트는 **반드시 `express.raw({ type: '*/*' })` 미들웨어와 함께 `express.json()`보다 앞선 줄에 배치**해야 합니다.

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
// (/api/webhooks/clerk 및 /api/webhooks 둘 다 지원)
app.use(
  ['/api/webhooks/clerk', '/api/webhooks'],
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

## 8. 7. 자주 발생하는 오류 및 트러블슈팅 (Troubleshooting)

| 오류 증상 / HTTP 코드 | 원인 | 해결 방법 |
| :--- | :--- | :--- |
| **`400 Webhook verification failed`** | 1. Clerk 대시보드의 Signing Secret과 서버 환경 변수 불일치<br>2. `express.json()`이 Webhook보다 먼저 실행되어 Raw Body가 손상됨 | 1. Clerk 대시보드의 해당 엔드포인트 **Signing Secret (`whsec_...`)**을 복사하여 `.env` 또는 Render 환경 변수에 다시 저장<br>2. `server.js`에서 `express.raw({ type: '*/*' })`가 `express.json()` **보다 앞선 줄**에 있는지 확인 |
| **`503 webhook signing secret missing`** | 환경 변수에 `CLERK_WEBHOOK_SIGNING_SECRET` 키가 누락됨 | `.env` 또는 Render 대시보드의 Environment 탭에 `CLERK_WEBHOOK_SIGNING_SECRET` 추가 |
| **가입 후 DB에 데이터가 없고 로그도 없음** | 1. Clerk 대시보드에 Webhook Endpoint URL 미등록<br>2. `user.created` 구독 이벤트 체크 누락 | Clerk Dashboard ➡️ Webhooks에서 등록된 URL과 체크박스(`user.created`) 확인 |
| **`Database connection timeout` (Render 환경)** | MongoDB Atlas에서 Render 서버 IP 접속 차단 | MongoDB Atlas ➡️ **Network Access** ➡️ **`0.0.0.0/0` (Allow Access from Anywhere)** 허용 등록 |
| **`400 User has no email address`** | 가입한 사용자의 이메일 주소가 비어있음 | Clerk 대시보드에서 `Email address`가 필수(Required) 로그인 수단으로 활성화되어 있는지 확인 |

---

✅ 이 문서는 현재 프로젝트의 실제 소스 코드 구조([`user.model.js`](backend/src/models/user.model.js), [`clerk.webhook.js`](backend/src/webhooks/clerk.webhook.js), [`server.js`](backend/src/server.js)) 및 배포 환경(Render, MongoDB Atlas)과 100% 일치하도록 완벽하게 최신화되었습니다.
