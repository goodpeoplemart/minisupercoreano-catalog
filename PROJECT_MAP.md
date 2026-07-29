# Minisuper Coreano Catalog Project Map

> 문서 생성 기준: 코드베이스 실측 분석 (추측 최소화)  
> 카탈로그 핵심 파일 경로:
> - `extensions/msc-catalog/blocks/catalog.liquid`
> - `extensions/msc-catalog/assets/msc-catalog.css`
> - `extensions/msc-catalog/assets/msc-catalog.js`

---

## 1. 프로젝트 개요

### 목적
**minisupercoreano-catalog**는 Shopify 앱 + Theme App Extension 조합으로, 스토어프론트에 WhatsApp 기반 카탈로그/주문 UX를 제공하는 프로젝트입니다. 고객은 테마에 삽입된 MSC Catalog 블록에서 상품을 보고, 장바구니(리스트)에 담고, 구매자 정보를 입력한 뒤 WhatsApp으로 주문을 전송합니다.

### Shopify 앱과 테마 확장의 역할

| 구성요소 | 경로 | 역할 |
|----------|------|------|
| **Shopify 앱 (React Router)** | `app/` | Admin 인증, App Proxy API, Shopify Admin GraphQL, Draft Order 생성, 클릭 메타필드 갱신 |
| **Theme App Extension** | `extensions/msc-catalog/` | 스토어프론트 UI (`catalog.liquid`, CSS, JS) |
| **Prisma / SQLite** | `prisma/` | 앱 OAuth 세션 저장 |

### Remix 앱, App Proxy, Theme App Extension의 관계

> **참고:** README 기준 이 프로젝트는 Shopify Remix 템플릿에서 **React Router v7** (`@react-router/*`, `@shopify/shopify-app-react-router`)로 전환된 구조입니다. 문서상 "Remix 앱"은 **Shopify 백엔드 앱 서버**를 의미하며, 실제 프레임워크는 React Router입니다.

```
[스토어프론트 테마]
  catalog.liquid + msc-catalog.js
        │ fetch (same-origin)
        ▼
[Shopify App Proxy]  prefix=apps, subpath=msc
  /apps/msc/products  → app/routes/apps.msc.products.jsx
  /apps/msc/request   → app/routes/apps.msc.request.jsx
  /apps/msc/click     → app/routes/apps.msc.click.jsx
        │ authenticate.public.appProxy
        ▼
[Shopify Admin GraphQL API]
  products, metafields, draftOrderCreate
```

- **Theme App Extension**: 정적 HTML 셸 + `data-msc-*` 훅 + 에셋 로드
- **App Proxy** (`shopify.app.toml` `[app_proxy]`): 스토어 도메인의 `/apps/msc/*`를 앱 서버로 프록시
- **React Router 앱**: 프록시 요청을 받아 Shopify Admin API 호출 및 JSON 응답

---

## 2. 핵심 폴더 구조

`node_modules`, `.react-router/types`(타입 생성물), 빌드 산출물은 제외합니다.

### `app/` — Shopify 백엔드 앱 (React Router)

| 경로 | 역할 |
|------|------|
| `app/routes.js` | `@react-router/fs-routes`의 `flatRoutes()` — 파일 기반 라우팅 |
| `app/routes/` | HTTP 라우트 (App Proxy, Admin UI, Auth, Webhooks) |
| `app/routes/apps.msc.products.jsx` | App Proxy: 상품 목록 GET |
| `app/routes/apps.msc.request.jsx` | App Proxy: 주문 POST (Draft Order) |
| `app/routes/apps.msc.click.jsx` | App Proxy: 클릭 추적 POST |
| `app/routes/app.jsx`, `app._index.jsx`, `app.additional.jsx` | 임베디드 Admin UI |
| `app/routes/auth.$.jsx`, `auth.login/` | OAuth 로그인 |
| `app/routes/webhooks.app.*.jsx` | 앱 웹훅 |
| `app/routes/_index/` | 공개 랜딩 페이지 |
| `app/lib/msc.server.js` | MSC 공통 유틸 (`jsonResponse`, `graphqlJson` 등) |
| `app/shopify.server.js` | Shopify 앱 초기화, `authenticate` export |
| `app/db.server.js` | Prisma 클라이언트 |
| `app/root.jsx` | React Router 루트 레이아웃 |
| `app/entry.server.jsx` | SSR 엔트리 |

### `extensions/` — Theme App Extension

| 경로 | 역할 |
|------|------|
| `extensions/msc-catalog/shopify.extension.toml` | 확장 메타 (`type = "theme"`, `name = "msc-catalog"`) |
| `extensions/msc-catalog/blocks/catalog.liquid` | MSC Catalog 메인 블록 |
| `extensions/msc-catalog/assets/msc-catalog.css` | 카탈로그 스타일 |
| `extensions/msc-catalog/assets/msc-catalog.js` | 카탈로그 클라이언트 로직 |
| `extensions/msc-catalog/blocks/star_rating.liquid` | 템플릿 예제 블록 (카탈로그와 별도) |
| `extensions/msc-catalog/snippets/stars.liquid` | 스니펫 예제 |
| `extensions/msc-catalog/locales/en.default.json` | 로케일 |

### `prisma/` — 데이터베이스

| 경로 | 역할 |
|------|------|
| `prisma/schema.prisma` | `Session` 모델 (Shopify OAuth 세션, SQLite) |
| `prisma/migrations/` | 마이그레이션 SQL |

### `public/` — 정적 파일

현재 워크스페이스에 **파일이 없음** (빈 폴더이거나 미생성). React Router/Vite 앱은 `app/` 기반 SSR을 사용합니다.

### React Router 관련

| 경로 | 역할 |
|------|------|
| `app/routes.js` | 라우트 등록 |
| `app/routes/**` | 파일명 = URL 매핑 (`apps.msc.products.jsx` → `/apps/msc/products`) |
| `vite.config.js` | Vite + `@react-router/dev/vite` 플러그인 |
| `.react-router/types/` | `react-router typegen` 생성 타입 (분석 시 제외) |

### 프로젝트 루트 설정 파일

| 파일 | 역할 |
|------|------|
| `shopify.app.toml` | 앱 ID, scopes, webhooks, **App Proxy** 설정 |
| `shopify.web.toml` | 웹 앱 dev/build 명령 (`react-router dev`) |
| `package.json` | 의존성, `shopify app dev`, `react-router build` 스크립트 |
| `pnpm-workspace.yaml` | `extensions/*` 워크스페이스 |
| `vite.config.js` | 개발 서버, HMR, Shopify URL 연동 |
| `tsconfig.json` | TypeScript 설정 |
| `.graphqlrc.js` | GraphQL codegen 설정 |
| `Dockerfile` | 컨테이너 배포 |
| `AGENTS.md` | 에이전트 개발 규칙 |
| `.cursorignore` | Cursor 인덱싱 제외 목록 |

---

## 3. 핵심 카탈로그 파일

### 3.1 catalog.liquid

**경로:** `extensions/msc-catalog/blocks/catalog.liquid`

| 항목 | 내용 |
|------|------|
| **담당 역할** | CSS/JS 에셋 로드, API URL·설정 `data-*` 주입, 정적 UI 셸(헤더·모달·장바구니·체크아웃), `{% schema %}` 블록 설정 |
| **CSS 연결** | 1행 `{{ 'msc-catalog.css' \| asset_url \| stylesheet_tag }}` |
| **JS 연결** | 191행 `msc-catalog.js` defer 로드 |
| **App Proxy 연결** | `data-products-url`, `data-request-url`, `data-click-url` |

**주요 data-msc-* 훅 (Liquid 정적):**  
`data-msc-root`, `data-msc-open-cart`, `data-msc-cart-count`, `data-msc-status`, `data-msc-products-grid`, `data-msc-product-modal`, `data-msc-close-product`, `data-msc-modal-image`, `data-msc-modal-placeholder`, `data-msc-modal-title`, `data-msc-modal-price`, `data-msc-modal-description`, `data-msc-modal-minus`, `data-msc-modal-quantity`, `data-msc-modal-plus`, `data-msc-add-cart`, `data-msc-cart-drawer`, `data-msc-close-cart`, `data-msc-cart-items`, `data-msc-cart-empty`, `data-msc-cart-total`, `data-msc-open-checkout`, `data-msc-checkout-modal`, `data-msc-close-checkout`, `data-msc-checkout-form`, `data-msc-checkout-items`, `data-msc-checkout-total`, `data-msc-submit`, `data-msc-message`

**주요 CSS 클래스 그룹 (정적):** Layout(`msc-catalog`, `msc-container`), Header, Status/Grid, Product Modal, Cart Drawer, Checkout Form

---

### 3.2 msc-catalog.css

**경로:** `extensions/msc-catalog/assets/msc-catalog.css`

| 항목 | 내용 |
|------|------|
| **담당 역할** | 카탈로그 전체 스타일, CSS 변수(`--msc-*`), 반응형(990px/749px/420px), 모달 스크롤 잠금(`msc-lock`) |
| **Liquid 연결** | Liquid 정적 마크업 + JS 동적 생성 요소 모두 스타일링 |
| **JS 연결** | `className` 부여, `classList`로 `is-error`/`msc-lock` 토글 |

**주요 CSS 클래스 그룹:** §7 참조 (고유 선택자 67개, AGENTS.md는 58개 핵심 인터페이스로 명시)

---

### 3.3 msc-catalog.js

**경로:** `extensions/msc-catalog/assets/msc-catalog.js`

| 항목 | 내용 |
|------|------|
| **담당 역할** | `[data-msc-root]` 초기화, App Proxy fetch, 상품 렌더링, 장바구니/체크아웃 UI, WhatsApp URL 생성 |
| **Liquid 연결** | `root.dataset`에서 URL·currency·whatsapp 읽기, `data-msc-*` querySelector |
| **CSS 연결** | 동적 요소에 `msc-*` class 부여, `is-error`/`msc-lock` classList |

**주요 JavaScript 기능 그룹:** §8 참조

---

## 4. App Proxy 구조

`shopify.app.toml` 설정:

```toml
[app_proxy]
url = "/apps/msc"
subpath = "msc"
prefix = "apps"
```

스토어프론트 URL: `https://{shop}/apps/msc/{path}` → 앱 서버 `/apps/msc/{path}`

### 4.1 GET /apps/msc/products

| 항목 | 내용 |
|------|------|
| **파일** | `app/routes/apps.msc.products.jsx` |
| **HTTP** | GET (`loader`만 export, `action` 없음) |
| **인증** | `authenticate.public.appProxy(request)` → `{ admin }` |
| **입력** | 쿼리/바디 없음 (프록시 서명 파라미터는 Shopify가 추가) |
| **Shopify 호출** | Admin GraphQL `MscCatalogProducts` — `products(first:100, query:"status:active")`, `promotion`/`clicks` 메타필드, `variants(first:1)`, `shop.currencyCode` |
| **응답 (200)** | `{ ok: true, products: [...] }` — 각 product: `id`, `variantId`, `title`, `descriptionHtml`, `image`, `imageAlt`, `price`, `compareAtPrice`, `currency`, `promotion`, `clicks`, `availableForSale` |
| **응답 (오류)** | 401 `{ ok:false, error }`, 502 `{ ok:false, error, errors? }`, 500 `{ ok:false, error }` |
| **프론트 함수** | `loadProducts()` → `extractProducts()` → `normalizeProduct()` → `renderProducts()` |
| **오류 처리** | `response.ok` 검사, JSON 파싱 실패 시 throw, `setStatus(message, true)` + `console.error` |

---

### 4.2 POST /apps/msc/request

| 항목 | 내용 |
|------|------|
| **파일** | `app/routes/apps.msc.request.jsx` |
| **HTTP** | POST (`action`), GET loader는 405 |
| **인증** | `authenticate.public.appProxy(request)` → `{ admin }` |
| **입력 (JSON body)** | `{ customer: {...}, items: [...], currency, total }` — customer 필드: `name`, `phone`, `email`, `address`, `exteriorNumber`, `interiorNumber`, `colonia`, `municipality`, `state`, `postalCode`, `deliveryTime`, `reference`, `comments` |
| **Shopify 호출** | GraphQL `draftOrderCreate` mutation |
| **응답 (201)** | `{ ok:true, draftOrderId, draftOrderName, invoiceUrl, whatsappUrl, notification }` |
| **응답 (오류)** | 405, 401, 400 `{ ok:false, error, errors? }`, 422, 502 |
| **프론트 함수** | `submitOrder()` |
| **WhatsApp URL** | 서버 `createWhatsAppUrl()` 또는 클라이언트 fallback `buildWhatsappUrl()` |
| **환경변수 (서버)** | `MSC_WHATSAPP_NUMBER`, `MSC_ORDER_WEBHOOK_URL`, `MSC_ORDER_WEBHOOK_SECRET` (값 문서화 안 함) |
| **오류 처리** | fetch 실패 시 catch 후 클라이언트 WhatsApp fallback; `setMessage()` 표시 |

---

### 4.3 POST /apps/msc/click

| 항목 | 내용 |
|------|------|
| **파일** | `app/routes/apps.msc.click.jsx` |
| **HTTP** | POST (`action`만, loader 없음) |
| **인증** | `authenticate.public.appProxy(request)` → `{ admin }` |
| **입력 (JSON body)** | `{ productId, variantId?, handle? }` — `productId`는 `gid://shopify/Product/` 로 시작해야 함 |
| **Shopify 호출** | Query `MscProductClicks` + Mutation `MscSetProductClicks` (`custom.catalog_clicks` 메타필드 +1) |
| **응답 (200)** | `{ ok: true, clicks: number }` (`jsonResponse` via `app/lib/msc.server.js`) |
| **응답 (오류)** | 405, 401, 400, 404, 500 `{ error: "..." }` |
| **프론트 함수** | `sendClick(product)` — 상품 카드 클릭 시 fire-and-forget, `.catch(() => {})` |
| **오류 처리** | 프론트에서 실패 무시 (카탈로그 UX 차단 없음) |

---

## 5. 상품 데이터 흐름

```
1. Liquid 설정 제공
   catalog.liquid
   ├─ data-products-url="/apps/msc/products"
   ├─ data-currency="{{ shop.currency }}"
   └─ data-whatsapp="{{ block.settings.whatsapp_number }}"

2. JavaScript API 호출
   initCatalog(root) → loadProducts()
   fetch(productsUrl, { credentials:"same-origin", Accept:"application/json" })

3. 서버 GraphQL
   apps.msc.products.jsx loader
   authenticate.public.appProxy → admin.graphql(MscCatalogProducts)
   promotion/clicks 메타필드, availableForSale 필터, promotion·clicks 정렬

4. JSON 응답
   { ok: true, products: [{ id, variantId, title, descriptionHtml, image, ... }] }

5. JavaScript 정규화·렌더링
   extractProducts(payload) → normalizeProduct() → state.products
   renderProducts() → article.msc-product-card DOM 생성 → el.grid.appendChild

6. CSS 적용
   msc-catalog.css: .msc-products-grid, .msc-product-card, .msc-product-image 등
```

**관련 함수·파일:**

| 단계 | 함수/코드 | 파일 |
|------|-----------|------|
| 초기화 | `initCatalog`, `loadProducts` | `msc-catalog.js` |
| 파싱 | `extractProducts`, `getNodes`, `normalizeProduct`, `parseMoney`, `normalizeImageUrl` | `msc-catalog.js` |
| 렌더 | `renderProducts` | `msc-catalog.js` |
| API | `loader` | `apps.msc.products.jsx` |

---

## 6. DOM 연결 구조

### 6.1 data-msc-* 전체 표

| data-msc-* | Liquid | JS querySelector | 정적/동적 | 역할 | 관련 함수 |
|------------|--------|------------------|-----------|------|-----------|
| `data-msc-root` | ✅ | ✅ document | 정적 | 인스턴스 루트, 초기화 가드 | `ready()`, `initCatalog()` |
| `data-msc-status` | ✅ | ✅ | 정적 | 로딩/오류 메시지 | `setStatus()`, `hideStatus()`, `loadProducts()` |
| `data-msc-products-grid` | ✅ | ✅ | 정적 (내용 동적) | 상품 카드 컨테이너 | `renderProducts()` |
| `data-msc-open-cart` | ✅ | ✅ | 정적 | 장바구니 열기 버튼 | `openCart()`, `bindEvents()` |
| `data-msc-cart-count` | ✅ | ✅ | 정적 (텍스트 동적) | 장바구니 수량 뱃지 | `renderCart()` |
| `data-msc-product-modal` | ✅ | ✅ | 정적 | 상품 상세 오버레이 | `openProduct()`, `closeProduct()`, `showLayer()` |
| `data-msc-close-product` | ✅ | ✅ (All) | 정적 | 상품 모달 닫기 | `closeProduct()` |
| `data-msc-modal-image` | ✅ | ✅ | 정적 | 상품 이미지 | `openProduct()` |
| `data-msc-modal-placeholder` | ✅ | ✅ | 정적 | 이미지 없음 placeholder | `openProduct()` |
| `data-msc-modal-title` | ✅ | ✅ | 정적 | 상품명 | `openProduct()` |
| `data-msc-modal-price` | ✅ | ✅ | 정적 | 가격 | `openProduct()` |
| `data-msc-modal-description` | ✅ | ✅ | 정적 | 설명 | `openProduct()` |
| `data-msc-modal-quantity` | ✅ | ✅ | 정적 | 모달 수량 표시 | `updateModalQuantity()` |
| `data-msc-modal-minus` | ✅ | ✅ | 정적 | 수량 감소 | `bindEvents()` |
| `data-msc-modal-plus` | ✅ | ✅ | 정적 | 수량 증가 | `bindEvents()` |
| `data-msc-add-cart` | ✅ | ✅ | 정적 | 장바구니 추가 | `addToCart()`, `bindEvents()` |
| `data-msc-cart-drawer` | ✅ | ✅ | 정적 | 장바구니 드로어 | `openCart()`, `closeCart()` |
| `data-msc-close-cart` | ✅ | ✅ (All) | 정적 | 장바구니 닫기 | `closeCart()` |
| `data-msc-cart-items` | ✅ | ✅ | 정적 (내용 동적) | 장바구니 아이템 목록 | `renderCart()` |
| `data-msc-cart-empty` | ✅ | ✅ | 정적 | 빈 장바구니 메시지 | `renderCart()` |
| `data-msc-cart-total` | ✅ | ✅ | 정적 | 장바구니 합계 | `renderCart()` |
| `data-msc-open-checkout` | ✅ | ✅ | 정적 | 체크아웃 모달 열기 | `bindEvents()` |
| `data-msc-checkout-modal` | ✅ | ✅ | 정적 | 체크아웃 오버레이 | `showLayer()`, `closeCheckout()` |
| `data-msc-close-checkout` | ✅ | ✅ (All) | 정적 | 체크아웃 닫기 | `closeCheckout()` |
| `data-msc-checkout-form` | ✅ | ✅ | 정적 | 구매자 폼 | `submitOrder()`, `bindEvents()` |
| `data-msc-checkout-items` | ✅ | ✅ | 정적 (내용 동적) | 주문 요약 행 | `renderCheckout()` |
| `data-msc-checkout-total` | ✅ | ✅ | 정적 | 체크아웃 합계 | `renderCheckout()` |
| `data-msc-submit` | ✅ | ✅ | 정적 | WhatsApp 제출 버튼 | `submitOrder()`, `setSubmitting()` |
| `data-msc-message` | ✅ | ✅ | 정적 | 폼 결과 메시지 | `setMessage()` |

### 6.2 Liquid 전용 data-* (JS dataset, data-msc-* 아님)

| 속성 | JS 읽기 | 역할 |
|------|---------|------|
| `data-products-url` | `root.dataset.productsUrl` | 상품 API URL |
| `data-request-url` | `root.dataset.requestUrl` | 주문 API URL |
| `data-click-url` | `root.dataset.clickUrl` | 클릭 API URL |
| `data-currency` | `root.dataset.currency` | 통화 코드 |
| `data-whatsapp` | `root.dataset.whatsapp` | WhatsApp 번호 (블록 설정) |

### 6.3 JS class 선택자 (data-msc-* 외)

| 선택자 | Liquid | 함수 |
|--------|--------|------|
| `.msc-checkout-inner` | ✅ | `openCheckout` 핸들러 (scrollTop) |
| `input[name="name"]` | ✅ | 체크아웃 포커스 |

---

## 7. CSS 클래스 구조

**집계:** CSS 파일 실측 고유 클래스 **67개** (`msc-*` 65개 + `is-error` + `msc-lock`). AGENTS.md는 **58개**를 고정 인터페이스로 명시 — 집계 기준 차이 **확인 필요**.

### 7.1 Layout

| 클래스 | Liquid 정적 | JS 동적/classList | 화면 요소 |
|--------|-------------|-------------------|-----------|
| `msc-catalog` | ✅ | — | 루트 래퍼 |
| `msc-container` | ✅ | — | 메인 컨테이너 |
| `msc-lock` | — | `classList.add/remove` on html/body | 모달 열릴 때 스크롤 잠금 |

### 7.2 Header

| 클래스 | Liquid | JS | 요소 |
|--------|--------|-----|------|
| `msc-header` | ✅ | — | 헤더 영역 |
| `msc-title` | ✅ | — | 제목 |
| `msc-subtitle` | ✅ | — | 부제 |
| `msc-list-button` | ✅ | — | 장바구니 열기 |
| `msc-list-count` | ✅ | — | 장바구니 수량 뱃지 |

### 7.3 Search / Category

**해당 없음** — 검색·카테고리 UI/CSS 클래스 미구현 (§10 참조).

### 7.4 Product Grid / Status

| 클래스 | Liquid | JS | 요소 |
|--------|--------|-----|------|
| `msc-status` | ✅ | — | 로딩/상태 텍스트 |
| `is-error` | — | `classList.toggle` | 오류 상태 색상 |
| `msc-products-grid` | ✅ | — | 상품 그리드 |

### 7.5 Product Card (JS 동적 생성)

| 클래스 | Liquid | JS | 요소 |
|--------|--------|-----|------|
| `msc-product-card` | — | `className` | 카드 article |
| `msc-product-button` | — | `className` | 카드 클릭 버튼 |
| `msc-product-media` | — | `className` | 이미지 영역 |
| `msc-product-image` | — | `className` | 상품 이미지 |
| `msc-product-placeholder` | — | `className` | 이미지 없음 |
| `msc-product-info` | — | `className` | 카드 텍스트 영역 |
| `msc-product-name` | — | `className` | 상품명 |
| `msc-product-price` | — | `className` | 가격 |

### 7.6 Promotion

**해당 없음** — 프로모션 배지용 CSS 클래스 없음. 서버는 `promotion` 메타필드로 정렬만 수행.

### 7.7 Product Modal / Quantity

| 클래스 | Liquid | JS | 요소 |
|--------|--------|-----|------|
| `msc-overlay` | ✅ | — | 오버레이 공통 |
| `msc-overlay-background` | ✅ | — | 배경 클릭 닫기 |
| `msc-close-button` | ✅ | — | 닫기 버튼 |
| `msc-product-dialog` | ✅ | — | 상품 다이얼로그 |
| `msc-product-detail` | ✅ | — | 2열 상세 레이아웃 |
| `msc-product-detail-media` | ✅ | — | 이미지 영역 |
| `msc-product-detail-image` | ✅ | — | 상세 이미지 |
| `msc-product-detail-placeholder` | ✅ | — | 상세 placeholder |
| `msc-product-detail-content` | ✅ | — | 텍스트/버튼 영역 |
| `msc-product-detail-title` | ✅ | — | 상품명 |
| `msc-product-detail-price` | ✅ | — | 가격 |
| `msc-product-detail-description` | ✅ | — | 설명 |
| `msc-quantity-section` | ✅ | — | 수량 섹션 |
| `msc-quantity-label` | ✅ | — | "Cantidad" 라벨 |
| `msc-quantity-control` | ✅ | — | +/- 컨트롤 |
| `msc-primary-button` | ✅ | — | 주요 CTA (모달·장바구니) |

### 7.8 Cart Drawer

| 클래스 | Liquid | JS | 요소 |
|--------|--------|-----|------|
| `msc-cart-drawer` | ✅ | — | 드로어 래퍼 |
| `msc-cart-backdrop` | ✅ | — | 배경 |
| `msc-cart-panel` | ✅ | — | 패널 |
| `msc-cart-header` | ✅ | — | 헤더 |
| `msc-cart-close` | ✅ | — | 닫기 |
| `msc-cart-body` | ✅ | — | 스크롤 본문 |
| `msc-cart-items` | ✅ | — | 아이템 컨테이너 |
| `msc-cart-empty` | ✅ | — | 빈 목록 메시지 |
| `msc-cart-footer` | ✅ | — | 푸터 |
| `msc-cart-total-row` | ✅ | — | 합계 행 |
| `msc-cart-item` | — | `className` | 장바구니 행 |
| `msc-cart-item-image` | — | `className` | 썸네일 |
| `msc-cart-item-content` | — | `className` | 행 내용 |
| `msc-cart-item-name` | — | `className` | 상품명 |
| `msc-cart-item-price` | — | `className` | 단가×수량 |
| `msc-cart-item-actions` | — | `className` | 수량/삭제 |
| `msc-cart-quantity` | — | `className` | 수량 컨트롤 |
| `msc-cart-remove` | — | `className` | Eliminar 버튼 |

### 7.9 Checkout Modal

| 클래스 | Liquid | JS | 요소 |
|--------|--------|-----|------|
| `msc-checkout-overlay` | ✅ | — | 체크아웃 오버레이 |
| `msc-checkout-dialog` | ✅ | — | 다이얼로그 |
| `msc-checkout-inner` | ✅ | querySelector | 스크롤 내부 |
| `msc-checkout-close` | ✅ | — | 닫기 |
| `msc-checkout-title` | ✅ | — | 제목 |
| `msc-checkout-form` | ✅ | — | 폼 |
| `msc-form-grid` | ✅ | — | 2열 그리드 |
| `msc-field` | ✅ | — | 입력 필드 |
| `msc-field-full` | ✅ | — | 전체 너비 필드 |
| `msc-order-summary` | ✅ | — | 주문 요약 |
| `msc-order-item` | — | `className` | 요약 행 |
| `msc-order-total` | ✅ (정적) + JS 동적 행 | `renderCheckout()` | 합계 |
| `msc-whatsapp-button` | ✅ | — | WhatsApp 제출 |
| `msc-form-message` | ✅ | — | 결과 메시지 |

### 7.10 Responsive

미디어 쿼리는 기존 클래스에 중첩 적용 (`@media max-width: 990px/749px/420px`). 별도 클래스 없음.

### 7.11 Liquid에 없는 동적/런타임 클래스 (19개 + 상태 2개)

**삭제 금지** — JS 렌더링·상태에 필수.

| # | 클래스 | 생성/토글 방식 |
|---|--------|----------------|
| 1 | `msc-product-card` | `renderProducts()` |
| 2 | `msc-product-button` | `renderProducts()` |
| 3 | `msc-product-media` | `renderProducts()` |
| 4 | `msc-product-image` | `renderProducts()` |
| 5 | `msc-product-placeholder` | `renderProducts()` |
| 6 | `msc-product-info` | `renderProducts()` |
| 7 | `msc-product-name` | `renderProducts()` |
| 8 | `msc-product-price` | `renderProducts()` |
| 9 | `msc-cart-item` | `renderCart()` |
| 10 | `msc-cart-item-image` | `renderCart()` |
| 11 | `msc-cart-item-content` | `renderCart()` |
| 12 | `msc-cart-item-name` | `renderCart()` |
| 13 | `msc-cart-item-price` | `renderCart()` |
| 14 | `msc-cart-item-actions` | `renderCart()` |
| 15 | `msc-cart-quantity` | `renderCart()` |
| 16 | `msc-cart-remove` | `renderCart()` |
| 17 | `msc-order-item` | `renderCheckout()` |
| 18 | `is-error` | `setStatus()` classList |
| 19 | `msc-lock` | `showLayer()` / `hideLayer()` classList |

> **참고:** `msc-order-item` 포함 17개는 JS `className` 부여, 2개는 classList.

---

## 8. JavaScript 기능 지도

**파일:** `extensions/msc-catalog/assets/msc-catalog.js`

### 실행 흐름 (페이지 로드 → 주문)

| 순서 | 기능 | 함수 | 입력 | 출력/부작용 | DOM | API | 연결 |
|------|------|------|------|-------------|-----|-----|------|
| 1 | 초기화 | `ready()` | callback | DOMContentLoaded 후 실행 | — | — | `initCatalog` 호출 |
| 2 | 인스턴스 초기화 | `initCatalog(root)` | root element | `bindEvents`, `loadProducts` | `[data-msc-root]` | — | `el`, `state` 설정 |
| 3 | 설정 읽기 | `initCatalog` 내부 | `root.dataset` | `productsUrl`, `requestUrl`, `clickUrl`, `currency`, `whatsappNumber` | data-* attrs | — | fetch URL |
| 4 | 이벤트 등록 | `bindEvents()` | — | click/submit/keydown 리스너 | el.* | — | 모든 UI 핸들러 |
| 5 | 상품 API | `loadProducts()` | — | `state.products` 갱신 | `el.status`, `el.grid` | GET `/apps/msc/products` | → `renderProducts` |
| 6 | payload 파싱 | `extractProducts(payload)` | API JSON | product 배열 | — | — | `normalizeProduct` |
| 7 | GraphQL nodes | `getNodes(value)` | nested object | array | — | — | `normalizeProduct` |
| 8 | 상품 정규화 | `normalizeProduct(raw, index)` | raw product | `{ id, variantId, title, description, image, price, ... }` | — | — | `stripHtml`, `parseMoney` |
| 9 | HTML 제거 | `stripHtml(value)` | HTML string | plain text | — | — | `normalizeProduct` |
| 10 | 상품 렌더링 | `renderProducts()` | `state.products` | grid DOM | `el.grid` | — | 카드 click → `openProduct`, `sendClick` |
| 11 | 검색 | — | — | **미구현** | — | — | — |
| 12 | 카테고리 필터 | — | — | **미구현** | — | — | — |
| 13 | 상품 모달 열기 | `openProduct(product)` | product | 모달 표시 | modal el.* | — | `showLayer`, `updateModalQuantity` |
| 14 | 상품 모달 닫기 | `closeProduct()` | — | 모달 숨김 | `el.productModal` | — | `hideLayer` |
| 15 | 모달 수량 변경 | `updateModalQuantity()` | `state.selectedQuantity` | 텍스트 갱신 | `el.modalQuantity` | — | +/- handlers |
| 16 | 장바구니 추가 | `addToCart(product, quantity)` | product, qty | `state.cart` push/merge | — | — | `renderCart` |
| 17 | 장바구니 렌더 | `renderCart()` | `state.cart` | items DOM | `el.cartItems`, count, total | — | +/- remove handlers |
| 18 | 장바구니 수량 변경 | `renderCart` 내 click | item | `item.quantity` ±1 | cart row | — | `renderCart` 재귀 |
| 19 | 장바구니 삭제 | `renderCart` 내 remove | item | filter from cart | — | — | `renderCart` |
| 20 | 장바구니 열기/닫기 | `openCart()`, `closeCart()` | — | drawer show/hide | `el.cartDrawer` | — | `showLayer`/`hideLayer` |
| 21 | 합계 계산 | `getCartTotal()` | `state.cart` | number | — | — | `renderCheckout`, `submitOrder` |
| 22 | 금액 포맷 | `formatMoney(amount)` | number | locale string | — | — | UI 전반 |
| 23 | 체크아웃 렌더 | `renderCheckout()` | `state.cart` | summary rows | `el.checkoutItems`, total | — | `openCheckout` |
| 24 | 체크아웃 닫기 | `closeCheckout()` | — | modal hide | `el.checkoutModal` | — | `hideLayer`, `setMessage("")` |
| 25 | 클릭 기록 | `sendClick(product)` | product | — | — | POST `/apps/msc/click` | `openProduct` 경로 |
| 26 | WhatsApp URL (클라) | `buildWhatsappUrl(order, phone)` | order, phone | URL string | — | — | `submitOrder` fallback |
| 27 | 주문 전송 | `submitOrder(event)` | form submit | window.open WhatsApp | form, message | POST `/apps/msc/request` | `buildWhatsappUrl` fallback |
| 28 | 로딩 상태 | `setStatus()`, `hideStatus()` | message, isError | status text/class | `el.status` | — | `loadProducts` |
| 29 | 폼 메시지 | `setMessage()`, `setSubmitting()` | message | text/disabled | `el.message`, `el.submit` | — | `submitOrder` |
| 30 | 레이어 UI | `showLayer()`, `hideLayer()` | element | hidden/aria/msc-lock | overlays | — | 모달 공통 |

### state 구조 (`initCatalog` 내부)

```javascript
const state = {
  products: [],      // normalizeProduct 결과 배열
  cart: [],          // { product, quantity }[]
  selectedProduct: null,
  selectedQuantity: 1
};
```

---

## 9. 장바구니 흐름

```
[상품 카드 클릭]
  renderProducts() button click
    → openProduct(product)
    → sendClick(product)  // POST /apps/msc/click (비동기, 실패 무시)

[모달에서 수량 조절]
  state.selectedQuantity
    ← modalMinus/modalPlus (bindEvents)
    → updateModalQuantity()

[장바구니 추가]
  data-msc-add-cart click
    → addToCart(state.selectedProduct, state.selectedQuantity)
    → state.cart 에 merge 또는 push
    → closeProduct()
    → renderCart() (카운트는 아직 UI 미갱신 — openCart 시 갱신)

[장바구니 열기]
  data-msc-open-cart click
    → openCart()
    → renderCart()
    → showLayer(el.cartDrawer)
    → el.cartCount, el.cartTotal, el.cartItems 갱신

[장바구니 내 수량/삭제]
  renderCart() 내 minus/plus/remove handlers
    → state.cart 수정
    → renderCart() 재호출

[체크아웃 진입]
  data-msc-open-checkout click
    → closeCart()
    → renderCheckout()
    → showLayer(el.checkoutModal)
    → el.checkoutInner.scrollTop = 0
    → input[name="name"] focus

[주문 제출]
  data-msc-checkout-form submit
    → submitOrder(event)
    → FormData → customer 객체
    → order = { customer, items, currency, total }
    → POST /apps/msc/request
    → whatsappUrl = response.whatsappUrl || buildWhatsappUrl(...)
    → window.open(whatsappUrl)
    → setMessage("El pedido está listo...")
```

**상태 변수:** `state.cart`, `state.selectedProduct`, `state.selectedQuantity`  
**합계:** `getCartTotal()`, `renderCart()` 내 `totalPrice`/`totalQuantity`

---

## 10. 검색 및 카테고리 필터 흐름

**현재 코드베이스에 검색·카테고리 필터 기능은 구현되어 있지 않습니다.**

| 항목 | 실제 상태 |
|------|-----------|
| 원본 상품 배열 | `state.products` — `loadProducts()` → `normalizeProduct()` 후 저장 |
| 검색어 처리 | **없음** — UI, state 변수, 필터 함수 없음 |
| 카테고리 필터 | **없음** — API/JS 모두 카테고리 필드 미사용 |
| 필터링된 결과 | **없음** — `renderProducts()`는 `state.products` 전체 렌더 |
| 재렌더링 | 상품 목록은 `loadProducts()` 성공 시 1회 `renderProducts()` |

**서버 측 정렬 (프론트 필터 아님):**  
`apps.msc.products.jsx`에서 `promotion` DESC → `clicks` DESC 정렬 후 JSON 반환. 프론트는 이 순서 그대로 표시.

---

## 11. 수정 영향도 표

| 수정 대상 | 영향 파일 | 영향 함수/영역 |
|-----------|-----------|----------------|
| 상품 카드 디자인 | `msc-catalog.css`, `msc-catalog.js` | `renderProducts()`, `.msc-product-*` |
| 상품 이미지 | `msc-catalog.js`, `msc-catalog.css`, `apps.msc.products.jsx` | `normalizeProduct()`, `normalizeImageUrl()`, GraphQL `featuredImage` |
| 가격 표시 | `msc-catalog.js`, `apps.msc.products.jsx` | `parseMoney()`, `formatMoney()`, `variant.price` |
| 프로모션 배지 | `apps.msc.products.jsx` (+ 신규 CSS/JS 필요) | GraphQL `promotion` alias, 정렬 로직 — **프론트 미구현** |
| 검색 | **신규 구현 필요** | Liquid UI, `state`, `renderProducts()` 필터 — **현재 없음** |
| 카테고리 | **신규 구현 필요** | API GraphQL, `normalizeProduct`, UI — **현재 없음** |
| 수량 버튼 (모달) | `catalog.liquid`, `msc-catalog.js`, `msc-catalog.css` | `bindEvents`, `updateModalQuantity`, `.msc-quantity-control` |
| 수량 버튼 (장바구니) | `msc-catalog.js`, `msc-catalog.css` | `renderCart()` 내 handlers, `.msc-cart-quantity` |
| 장바구니 | `catalog.liquid`, `msc-catalog.js`, `msc-catalog.css` | `addToCart`, `renderCart`, `openCart`, `closeCart`, cart data-msc-* |
| WhatsApp 주문 | `catalog.liquid`, `msc-catalog.js`, `apps.msc.request.jsx` | `submitOrder`, `buildWhatsappUrl`, `createWhatsAppUrl`, form fields |
| 클릭 수 | `msc-catalog.js`, `apps.msc.click.jsx`, `apps.msc.products.jsx` | `sendClick`, metafield `catalog_clicks`, 정렬 |
| API 응답 구조 | `apps.msc.*.jsx`, `msc-catalog.js` | `extractProducts`, `normalizeProduct`, `submitOrder` response parsing |
| 모바일 반응형 | `msc-catalog.css` | `@media` 990/749/420px 블록 |

---

## 12. 변경 금지 인터페이스

### CSS 클래스 (전체 — §7 참조)
특히 JS 동적 생성 17개 + `is-error` + `msc-lock` 및 Liquid 정적 47개.

### data-msc-* 속성 (28개)
`data-msc-root`, `data-msc-status`, `data-msc-products-grid`, `data-msc-open-cart`, `data-msc-cart-count`, `data-msc-product-modal`, `data-msc-close-product`, `data-msc-modal-image`, `data-msc-modal-placeholder`, `data-msc-modal-title`, `data-msc-modal-price`, `data-msc-modal-description`, `data-msc-modal-quantity`, `data-msc-modal-minus`, `data-msc-modal-plus`, `data-msc-add-cart`, `data-msc-cart-drawer`, `data-msc-close-cart`, `data-msc-cart-items`, `data-msc-cart-empty`, `data-msc-cart-total`, `data-msc-open-checkout`, `data-msc-checkout-modal`, `data-msc-close-checkout`, `data-msc-checkout-form`, `data-msc-checkout-items`, `data-msc-checkout-total`, `data-msc-submit`, `data-msc-message`

### Liquid data-* URL/설정
`data-products-url="/apps/msc/products"`, `data-request-url="/apps/msc/request"`, `data-click-url="/apps/msc/click"`, `data-currency`, `data-whatsapp`

### App Proxy 경로
`/apps/msc/products`, `/apps/msc/request`, `/apps/msc/click`

### API 응답 필드 (프론트가 파싱)

**products:** `products[]` 또는 nested variants; 필드 `id`, `title`, `descriptionHtml`, `featuredImage`, `variants`, `price`, `availableForSale`  
**request:** `whatsappUrl`, `whatsapp_url`, `url`  
**click:** `{ ok, clicks }` (실패 시 무시)

### Shopify GraphQL 별칭
`promotion: metafield(namespace:"custom", key:"promotion")`  
`clicks: metafield(namespace:"custom", key:"catalog_clicks")`

### JavaScript state 구조
```javascript
state.products, state.cart, state.selectedProduct, state.selectedQuantity
```
`cart` 항목: `{ product, quantity }`

### Liquid schema 설정 id
`heading`, `subheading`, `cart_label`, `whatsapp_number`

### Form input name (submitOrder / validateOrder 연동)
`name`, `phone`, `email`, `address`, `exteriorNumber`, `interiorNumber`, `colonia`, `municipality`, `state`, `postalCode`, `deliveryTime`, `reference`, `comments`

---

## 13. 안전한 작업 절차

1. **관련 파일 검색** — 클래스명, `data-msc-*`, 함수명을 프로젝트 전체 grep
2. **DOM/CSS/JS 연결 확인** — Liquid ↔ CSS ↔ JS 삼각 관계 (PROJECT_MAP §6–7)
3. **수정 파일 범위 확정** — AGENTS.md: 승인 전 범위 보고
4. **최소 수정** — 함수/블록 단위, 전체 파일 덮어쓰기 금지
5. **git diff 확인** — 의도하지 않은 파일 변경 없는지
6. **브라우저 테스트** — 상품 로드, 모달, 장바구니, 체크아웃, WhatsApp
7. **Shopify 개발 환경 테스트** — `shopify app dev`, App Proxy 인증, Draft Order scope
8. **커밋** — 사용자 요청 시에만

---

## 14. 현재 확인된 상태

| 항목 | 상태 |
|------|------|
| Liquid, CSS, JS 역할 분리 | ✅ 명확 (셸 / 스타일 / 동작) |
| 선택자 불일치 | ✅ 없음 (data-msc-*, `.msc-checkout-inner` 포함) |
| Liquid에 없는 JavaScript 참조 | ✅ 없음 |
| CSS 미정의 Liquid 클래스 | ✅ 없음 |
| Liquid 정적 HTML에 없는 CSS 클래스 | 19개 — JS `className`/`classList` 동적·런타임용, 삭제 불가 |
| 검색/카테고리/프로모션 배지 | ❌ 프론트 미구현 (서버 promotion 정렬만 존재) |
| App Proxy 라우트 | 3개 (`products`, `request`, `click`) — 추가 라우트 없음 |

---

*문서 끝*
