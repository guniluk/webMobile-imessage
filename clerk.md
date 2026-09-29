# 🚀 Clerk 완전 정복 가이드 (Frontend, Backend & MongoDB Webhook 연동)

이 가이드는 **Clerk** 인증 서비스를 React(Frontend), Express(Backend), 그리고 **MongoDB(Mongoose)**와 완벽하게 연동하는 방법을 단계별로 쉽게 정리한 문서입니다.

---

## 📌 목차
1. [Clerk Dashboard 초기 설정](#1-clerk-dashboard-초기-설정)
2. [Frontend (React + Vite) 연동](#2-frontend-react--vite-연동)
3. [Backend (Express) 설정 및 API 보호](#3-backend-express-설정-및-api-보호)
4. [Clerk Webhook과 MongoDB 동기화 (가입/수정/삭제)](#4-clerk-webhook과-mongodb-동기화-가입수정삭제)
5. [로컬 환경 Webhook 테스트 방법](#5-로컬-환경-webhook-테스트-방법)

---

## 1. Clerk Dashboard 초기 설정

1. [Clerk 공식 홈페이지](https://clerk.com/)에 접속하여 회원가입/로그인합니다.
2. 새 애플리케이션 생성 (**Add application**):
   - 애플리케이션 이름을 입력합니다.
   - 로그인 방식(Email, Google, GitHub 등)을 선택하고 **Create application**을 누릅니다.
3. 좌측 메뉴의 **API Keys**로 이동하여 다음 키들을 확인합니다:
   - `Publishable key` (Frontend용, `pk_test_...`)
   - `Secret key` (Backend용, `sk_test_...`)

---

## 2. Frontend (React + Vite) 연동

### Step 1: 라이브러리 설치
`frontend` 폴더에서 `@clerk/clerk-react`를 설치합니다.

```bash
cd frontend
npm install @clerk/clerk-react
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
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { ClerkProvider } from '@clerk/clerk-react'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Publishable Key: VITE_CLERK_PUBLISHABLE_KEY is not defined.')
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/">
      <App />
    </ClerkProvider>
  </React.StrictMode>,
)
```

### Step 4: UI 컴포넌트 및 인증 상태 사용 예시
Clerk이 제공하는 기본 UI 컴포넌트를 사용하면 간편하게 로그인/로그아웃/프로필 버튼을 구현할 수 있습니다.

```jsx
// frontend/src/App.jsx 예시
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
  useAuth
} from '@clerk/clerk-react'

export default function App() {
  const { user, isLoaded } = useUser()
  const { getToken } = useAuth()

  // Backend API 호출 시 Clerk 인증 토큰 전달 예시
  const fetchProtectedData = async () => {
    const token = await getToken()
    const res = await fetch('http://localhost:5001/api/protected', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
    const data = await res.json()
    console.log(data)
  }

  if (!isLoaded) return <div>로딩 중...</div>

  return (
    <div className="p-4">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">내 채팅 앱</h1>
        <div>
          {/* 로그아웃 상태일 때 */}
          <SignedOut>
            <div className="space-x-2">
              <SignInButton mode="modal">
                <button className="px-4 py-2 bg-blue-500 text-white rounded">로그인</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="px-4 py-2 bg-green-500 text-white rounded">회원가입</button>
              </SignUpButton>
            </div>
          </SignedOut>

          {/* 로그인 상태일 때 */}
          <SignedIn>
            <div className="flex items-center gap-3">
              <span>환영합니다, {user?.fullName || user?.firstName}님!</span>
              <UserButton />
            </div>
          </SignedIn>
        </div>
      </header>

      <SignedIn>
        <button onClick={fetchProtectedData} className="px-3 py-1 bg-gray-700 text-white rounded">
          인증된 백엔드 데이터 요청
        </button>
      </SignedIn>
    </div>
  )
}
```

---

## 3. Backend (Express) 설정 및 API 보호

### Step 1: 라이브러리 설치
`backend` 폴더에서 Clerk SDK 및 Webhook 검증 라이브러리 `svix`를 설치합니다.

```bash
cd backend
npm install @clerk/express svix
```

### Step 2: 환경 변수 설정
`backend/.env` 파일에 Clerk Secret Key 및 Webhook Secret을 추가합니다.

```env
PORT=5001
MONGO_URI=mongodb+srv://...
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
CLERK_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
```

### Step 3: 미들웨어 적용 및 인증된 라우트 구성
`@clerk/express`의 `clerkMiddleware()`와 `requireAuth()`를 사용합니다.

```javascript
// backend/src/server.js
import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { clerkMiddleware, requireAuth } from '@clerk/express'
import { connectDB } from './lib/db.js'
import webhookRoutes from './routes/webhook.route.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001

// ⚠️ 주의: Webhook 라우트는 반드시 raw body(또는 express.raw) 처리가 필요할 수 있으므로 
// express.json() 미들웨어 이전에 등록하거나 webhook route 자체에서 raw body를 처리합니다.
app.use('/api/webhooks', webhookRoutes)

app.use(cors())
app.use(express.json()) // 일반 API용 JSON 파서
app.use(clerkMiddleware()) // Clerk 인증 상태를 req.auth에 주입

// 보호된 API 엔드포인트 예시
app.get('/api/protected', requireAuth(), (req, res) => {
  // req.auth 객체에서 userId(Clerk ID) 확인 가능
  const { userId } = req.auth
  res.json({ message: '인증된 사용자입니다.', userId })
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  connectDB()
})
```

---

## 4. Clerk Webhook과 MongoDB 동기화 (가입/수정/삭제)

사용자가 Clerk을 통해 가입, 정보 수정, 계정 삭제를 할 때 우리 MongoDB 데이터베이스의 `User` 컬렉션과 자동으로 동기화되도록 Webhook을 구축합니다.

### Step 1: MongoDB User 모델 확인
이미 정의된 `User` 모델(`backend/src/models/user.model.js`) 구조:

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

### Step 2: Webhook 핸들러 컨트롤러 작성
`svix`를 사용하여 Clerk에서 전송된 서명(Signature)을 검증하고, 이벤트에 따라 MongoDB CRUD를 수행합니다.

```javascript
// backend/src/controllers/webhook.controller.js
import { Webhook } from 'svix'
import User from '../models/user.model.js'

export const handleClerkWebhook = async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    console.error('CLERK_WEBHOOK_SECRET 환경 변수가 누락되었습니다.')
    return res.status(500).json({ error: 'Webhook secret is not configured' })
  }

  // 1. 헤더 추출
  const svix_id = req.headers['svix-id']
  const svix_timestamp = req.headers['svix-timestamp']
  const svix_signature = req.headers['svix-signature']

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).json({ error: 'Svix 헤더가 존재하지 않습니다.' })
  }

  // 2. 서명 검증 (body는 문자열 형태여야 함)
  const payload = req.body.toString()
  const wh = new Webhook(WEBHOOK_SECRET)

  let evt
  try {
    evt = wh.verify(payload, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    })
  } catch (err) {
    console.error('Webhook 검증 실패:', err.message)
    return res.status(400).json({ error: 'Webhook verification failed' })
  }

  // 3. 이벤트 타입에 따른 DB 동기화
  const eventType = evt.type
  const { id: clerkId, email_addresses, first_name, last_name, image_url } = evt.data

  try {
    // 🟢 1) 회원가입 (user.created)
    if (eventType === 'user.created') {
      const email = email_addresses?.[0]?.email_address
      const fullName = `${first_name || ''} ${last_name || ''}`.trim() || 'Anonymous'

      const newUser = await User.create({
        clerkId,
        email,
        fullName,
        profilePic: image_url || '',
      })

      console.log('✅ 신규 사용자 MongoDB 저장 완료:', newUser._id)
      return res.status(201).json({ success: true, user: newUser })
    }

    // 🟡 2) 회원 정보 수정 (user.updated)
    if (eventType === 'user.updated') {
      const email = email_addresses?.[0]?.email_address
      const fullName = `${first_name || ''} ${last_name || ''}`.trim() || 'Anonymous'

      const updatedUser = await User.findOneAndUpdate(
        { clerkId },
        {
          email,
          fullName,
          profilePic: image_url || '',
        },
        { new: true }
      )

      console.log('🔄 사용자 정보 수정 완료:', updatedUser?._id)
      return res.status(200).json({ success: true, user: updatedUser })
    }

    // 🔴 3) 회원 탈퇴/삭제 (user.deleted)
    if (eventType === 'user.deleted') {
      await User.findOneAndDelete({ clerkId })
      console.log(`🗑️ 사용자 삭제 완료 (ClerkId: ${clerkId})`)
      return res.status(200).json({ success: true, message: 'User deleted' })
    }

    return res.status(200).json({ received: true })
  } catch (error) {
    console.error('Webhook 처리 중 DB 에러:', error)
    return res.status(500).json({ error: 'Database sync error' })
  }
}
```

### Step 3: Webhook 라우트 생성
Webhook의 서명 검증을 위해 반드시 `bodyParser.raw({ type: 'application/json' })` 형태로 본문을 전달해야 합니다.

```javascript
// backend/src/routes/webhook.route.js
import express from 'express'
import bodyParser from 'body-parser'
import { handleClerkWebhook } from '../controllers/webhook.controller.js'

const router = express.Router()

// Webhook 엔드포인트: raw body 필요
router.post(
  '/',
  bodyParser.raw({ type: 'application/json' }),
  handleClerkWebhook
)

export default router
```

---

## 5. 로컬 환경 Webhook 테스트 방법

Clerk은 로컬(localhost)로 바로 요청을 보낼 수 없으므로, 로컬 개발 중에는 **ngrok** 또는 **localtunnel**을 사용하여 공용 URL을 열어주어야 합니다.

### Step 1: ngrok 터널 열기
```bash
npx ngrok http 5001
```
터널이 열리면 생성된 URL(예: `https://abcd-1234.ngrok-free.app`)을 복사합니다.

### Step 2: Clerk Dashboard에 Webhook 등록
1. Clerk Dashboard -> 좌측 메뉴의 **Webhooks** 클릭
2. **Add Endpoint** 클릭
3. **Endpoint URL**에 `https://abcd-1234.ngrok-free.app/api/webhooks` 입력
4. **Subscribe to events**에서 다음 이벤트들을 선택:
   - `user.created`
   - `user.updated`
   - `user.deleted`
5. **Create** 버튼 클릭 후 생성된 화면에서 **Signing Secret**(`whsec_...`) 값을 복사합니다.
6. 복사한 값을 `backend/.env`의 `CLERK_WEBHOOK_SECRET`에 붙여넣습니다.

### Step 3: 테스트 및 동기화 확인
1. Frontend에서 새 사용자로 회원가입하거나 Clerk Dashboard의 **Testing** 탭에서 가입 이벤트를 트리거합니다.
2. 백엔드 콘솔에 `✅ 신규 사용자 MongoDB 저장 완료` 메시지가 출력되는지 확인합니다.
3. MongoDB Compass 또는 Atlas에서 `users` 컬렉션에 데이터가 정상적으로 동기화되었는지 확인합니다.
