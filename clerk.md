# 🚀 Clerk 완전 정복 가이드 (Frontend, Backend & MongoDB Webhook 연동)

이 가이드는 **Clerk** 인증 서비스를 React(Frontend), Express(Backend), 그리고 **MongoDB(Mongoose)**와 완벽하게 연동하는 방법을 단계별로 알기 쉽게 정리한 문서입니다.

---

## 📌 목차
1. [Clerk Dashboard 초기 설정](#1-clerk-dashboard-초기-설정)
2. [Frontend (React + Vite) 연동](#2-frontend-react--vite-연동)
3. [Backend (Express) 설정 및 API 보호](#3-backend-express-설정-및-api-보호)
4. [Clerk Webhook과 MongoDB 동기화 (가입/수정/삭제)](#4-clerk-webhook과-mongodb-동기화-가입수정삭제)
5. [로컬 및 배포 환경 Webhook 테스트 방법](#5-로컬-및-배포-환경-webhook-테스트-방법)

---

## 1. Clerk Dashboard 초기 설정

1. [Clerk 공식 홈페이지](https://clerk.com/)에 접속하여 회원가입/로그인합니다.
2. 새 애플리케이션 생성 (**Add application**):
   - 애플리케이션 이름을 입력합니다 (예: `iMessage Web & Mobile`).
   - 로그인 방식(Email, Google, GitHub 등)을 선택하고 **Create application**을 클릭합니다.
3. 좌측 메뉴의 **Configure ➡️ Developers ➡️ API Keys**로 이동하여 다음 키들을 복사합니다:
   - `Publishable key` (Frontend용, `pk_test_...`)
   - `Secret key` (Backend용, `sk_test_...`)

---

## 2. Frontend (React + Vite) 연동

### Step 1: 라이브러리 설치
`frontend` 폴더에서 최신 `@clerk/react`를 설치합니다.

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
React 애플리케이션의 최상단을 `ClerkProvider`로 감싸줍니다.

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
`@clerk/react`의 `<Show>`, `<SignInButton>`, `<SignUpButton>`, `<UserButton>`, `useAuth`, `useUser` 등을 활용합니다.

```jsx
// frontend/src/App.jsx 예시
import { Show, SignInButton, SignUpButton, UserButton, useUser, useAuth } from "@clerk/react";

export default function App() {
  const { user } = useUser();
  const { getToken } = useAuth();

  // Backend 인증 API 호출 예시
  const fetchProtectedData = async () => {
    const token = await getToken();
    const res = await fetch("/api/protected", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    console.log("Protected API Data:", data);
  };

  return (
    <div className="p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">iMessage Web</h1>
        
        {/* 로그아웃 상태일 때 */}
        <Show when="signed-out">
          <div className="space-x-2">
            <SignInButton mode="modal">
              <button className="px-4 py-2 bg-blue-500 text-white rounded">로그인</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="px-4 py-2 bg-green-500 text-white rounded">회원가입</button>
            </SignUpButton>
          </div>
        </Show>

        {/* 로그인 상태일 때 */}
        <Show when="signed-in">
          <div className="flex items-center gap-3">
            <span>환영합니다, {user?.fullName || user?.firstName}님!</span>
            <UserButton />
          </div>
        </Show>
      </header>

      <Show when="signed-in">
        <button
          onClick={fetchProtectedData}
          className="px-3 py-1 bg-gray-700 text-white rounded"
        >
          인증된 백엔드 데이터 요청
        </button>
      </Show>
    </div>
  );
}
```

---

## 3. Backend (Express) 설정 및 API 보호

### Step 1: 라이브러리 설치
`backend` 폴더에서 `@clerk/express`와 Webhook 검증 라이브러리 `svix`를 설치합니다.

```bash
cd backend
npm install @clerk/express svix
```

### Step 2: 환경 변수 설정
`backend/.env` 파일에 다음 환경 변수들을 등록합니다:

```env
PORT=3000
MONGODB_URI=mongodb+srv://...
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
CLERK_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
```

### Step 3: 미들웨어 적용 및 인증된 라우트 구성
`@clerk/express`의 `clerkMiddleware()`와 `requireAuth()`를 사용합니다.

```javascript
// backend/src/server.js 예시
import express from "express";
import dotenv from "dotenv";
import { clerkMiddleware, requireAuth } from "@clerk/express";
import webhookRoutes from "./routes/webhook.route.js";

dotenv.config();
const app = express();

// ⚠️ Webhook 라우트는 JSON 파서 이전에 등록 (svix 검증을 위한 raw body 처리)
app.use("/api/webhooks", webhookRoutes);

app.use(express.json());
app.use(clerkMiddleware()); // req.auth 객체 주입

// 보호된 API 엔드포인트 예시
app.get("/api/protected", requireAuth(), (req, res) => {
  const { userId } = req.auth; // Clerk User ID (예: 'user_2xyz...')
  res.json({ message: "인증 성공", userId });
});
```

---

## 4. Clerk Webhook과 MongoDB 동기화 (가입/수정/삭제)

사용자가 Clerk을 통해 가입, 정보 수정, 계정 삭제를 할 때 우리 MongoDB 데이터베이스의 `User` 컬렉션과 자동으로 동기화되도록 Webhook을 구축합니다.

### Step 1: MongoDB User 모델 (`backend/src/models/user.model.js`)
```javascript
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
      default: "offline",
    },
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

### Step 2: Webhook 컨트롤러 (`backend/src/controllers/webhook.controller.js`)
```javascript
import { Webhook } from "svix";
import User from "../models/user.model.js";

export const handleClerkWebhook = async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    console.error("CLERK_WEBHOOK_SECRET 환경 변수가 누락되었습니다.");
    return res.status(500).json({ error: "Webhook secret is not configured" });
  }

  // 1. Svix 헤더 추출
  const svix_id = req.headers["svix-id"];
  const svix_timestamp = req.headers["svix-timestamp"];
  const svix_signature = req.headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).json({ error: "Svix 헤더가 존재하지 않습니다." });
  }

  // 2. 서명 검증 (body는 raw string 형태)
  const payload = req.body.toString();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt;
  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("Webhook 서명 검증 실패:", err.message);
    return res.status(400).json({ error: "Webhook verification failed" });
  }

  // 3. 이벤트별 MongoDB 동기화
  const eventType = evt.type;
  const { id: clerkId, email_addresses, first_name, last_name, image_url } = evt.data;

  try {
    // 🟢 1) 회원가입 (user.created)
    if (eventType === "user.created") {
      const email = email_addresses?.[0]?.email_address;
      const fullName = `${first_name || ""} ${last_name || ""}`.trim() || "Anonymous";

      const newUser = await User.create({
        clerkId,
        email,
        fullName,
        profilePic: image_url || "",
      });

      console.log("✅ 신규 사용자 MongoDB 저장 완료:", newUser._id);
      return res.status(201).json({ success: true, user: newUser });
    }

    // 🟡 2) 회원 정보 수정 (user.updated)
    if (eventType === "user.updated") {
      const email = email_addresses?.[0]?.email_address;
      const fullName = `${first_name || ""} ${last_name || ""}`.trim() || "Anonymous";

      const updatedUser = await User.findOneAndUpdate(
        { clerkId },
        {
          email,
          fullName,
          profilePic: image_url || "",
        },
        { new: true }
      );

      console.log("🔄 사용자 정보 수정 완료:", updatedUser?._id);
      return res.status(200).json({ success: true, user: updatedUser });
    }

    // 🔴 3) 회원 탈퇴 (user.deleted)
    if (eventType === "user.deleted") {
      await User.findOneAndDelete({ clerkId });
      console.log(`🗑️ 사용자 삭제 완료 (ClerkId: ${clerkId})`);
      return res.status(200).json({ success: true, message: "User deleted" });
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Webhook 처리 중 DB 에러:", error);
    return res.status(500).json({ error: "Database sync error" });
  }
};
```

### Step 3: Webhook 라우트 (`backend/src/routes/webhook.route.js`)
```javascript
import express from "express";
import bodyParser from "body-parser";
import { handleClerkWebhook } from "../controllers/webhook.controller.js";

const router = express.Router();

// Webhook 엔드포인트 (raw body 파서 적용)
router.post(
  "/",
  bodyParser.raw({ type: "application/json" }),
  handleClerkWebhook
);

export default router;
```

---

## 5. 로컬 및 배포 환경 Webhook 테스트 방법

### 1) 로컬 개발 테스트 (ngrok 사용)
1. 터미널에서 로컬 포트로 ngrok 터널을 엽니다:
   ```bash
   npx ngrok http 3000
   ```
2. 생성된 `https://xxxx.ngrok-free.app` 주소를 복사합니다.
3. Clerk Dashboard ➡️ **Webhooks ➡️ Add Endpoint** 클릭
4. Endpoint URL에 `https://xxxx.ngrok-free.app/api/webhooks` 입력
5. 구독 이벤트 선택: `user.created`, `user.updated`, `user.deleted`
6. 생성 후 발급된 **Signing Secret**(`whsec_...`)을 복사하여 `backend/.env`의 `CLERK_WEBHOOK_SECRET`에 입력합니다.

### 2) Render.com 프로덕션 Webhook 등록
1. 배포된 Render 서비스 주소(`https://webmobile-imessage.onrender.com/api/webhooks`)를 Clerk Dashboard에 엔드포인트로 등록합니다.
2. 발급된 **Signing Secret**을 Render.com 대시보드의 **Environment Variables** (`CLERK_WEBHOOK_SECRET`)에 추가합니다.
3. 실제 회원가입/수정 시 MongoDB Atlas에 실시간으로 데이터가 동기화되는 것을 확인합니다.
