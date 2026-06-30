# Asian Health Hub (AHH)

> AI-powered Healthcare Directory for Asian Americans — Tìm bác sĩ nói tiếng mẹ đẻ của bạn.

---

## 🎯 Mục tiêu Dự án

Giúp bệnh nhân người Mỹ gốc Á (Việt Nam, Hàn Quốc, Trung Quốc...) dễ dàng tìm kiếm **phòng khám có bác sĩ nói tiếng mẹ đẻ** và am hiểu văn hóa của họ. Thông tin này hiện nằm rải rác, truyền miệng, không có trên các nền tảng lớn như Zocdoc.

---

## 🌟 3 Trụ cột Sản phẩm

1. **Smart Directory**: Tìm kiếm phòng khám theo **Chuyên khoa + Thành phố + Ngôn ngữ**. Hiển thị reviews, bản đồ, giờ mở cửa, liên hệ.
2. **Insights & Guides**: Bài viết y tế AI-generated (VD: "Hướng dẫn khám I-693 cho thẻ xanh"). Mục đích: kéo SEO traffic từ Google.
3. **Claim Profile**: Chủ phòng khám tự xác thực (verify) hồ sơ, cập nhật thông tin, tiếp cận bệnh nhân.

---

## ⚡ Cơ chế Rendering của Hệ thống (Hybrid Architecture)

Asian Health Hub được thiết kế tối ưu hóa cho SEO và tốc độ tải trang bằng cách kết hợp linh hoạt cả 3 cơ chế rendering của Next.js App Router:

### 1. Static Site Generation (SSG)
*   **Trang áp dụng**: Trang chủ (`/`), Giới thiệu (`/about`), Đăng nhập/Đăng ký (`/auth/login`, `/auth/signup`), Trang yêu cầu Claim (`/claim`), trang Tin tức (`/pulse`).
*   **Chi tiết**: Các trang tĩnh này được dựng sẵn 100% tại thời điểm build (build-time), tải trang tức thời và thân thiện tối đa với các bot tìm kiếm của Google/Bing.

### 2. Incremental Static Regeneration (ISR)
*   **Trang áp dụng**: 
    *   Trang đích SEO theo thành phố: `/[state]/[city]` (Revalidate: 1 ngày)
    *   Trang đích SEO theo chuyên khoa: `/[state]/[city]/[specialty]` (Revalidate: 1 ngày)
    *   Trang chi tiết bài viết: `/pulse/[slug]` (Revalidate: 1 giờ)
*   **Chi tiết**: Các trang động được dựng tĩnh trước khi build thông qua `generateStaticParams()`. Next.js sẽ tự động tái tạo (regenerate) lại trang tĩnh đó ngầm ở background khi có request mới truy cập sau khoảng thời gian chỉ định (1 giờ hoặc 1 ngày), giúp dữ liệu phòng khám mới cào về tự động hiển thị mà không cần build lại dự án.

### 3. Server-Side Rendering (SSR)
*   **Trang áp dụng**: Trang tìm kiếm (`/search`), Trang quản trị (`/admin/*`), Trang chi tiết phòng khám (`/clinics/[slug]`), Dashboard bác sĩ (`/dashboard/*`), các API route (`/api/*`).
*   **Chi tiết**: Dữ liệu được truy vấn trực tiếp từ database Supabase theo thời gian thực (real-time) tại thời điểm người dùng gửi request, đáp ứng nhu cầu lọc kết quả động và xác thực session/cookie.

---

## 🛠️ Hướng dẫn Cài đặt & Chạy cục bộ (Local Setup)

### Yêu cầu hệ thống
*   Node.js 18+ & npm
*   Python 3.12+ (cho AI Engine/OpenClaw)
*   Docker & Docker Compose (tùy chọn chạy container)

### Cách 1: Chạy trực tiếp (Không dùng Docker)

1.  **Clone & Cài đặt Node modules**:
    ```bash
    git clone https://github.com/your-username/asian-health-hub.git
    cd asian-health-hub
    npm install
    ```
2.  **Cấu hình Environment**:
    ```bash
    cp .env.local.example .env.local
    # Mở .env.local và điền thông tin Supabase của bạn
    ```
3.  **Khởi tạo Database**:
    *   Truy cập Supabase Dashboard → SQL Editor.
    *   Chạy nội dung trong file [supabase/schema.sql](file:///Users/sam92/Desktop/Projects/asian-health-hub/supabase/schema.sql) để tạo bảng và cấu hình chính sách bảo mật RLS.
4.  **Chạy ứng dụng Web**:
    ```bash
    npm run dev
    # Truy cập http://localhost:3000
    ```
5.  **Cài đặt và Chạy OpenClaw Telegram Bot (Python)**:
    ```bash
    cd openclaw
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    cp .env.example .env
    # Điền API Keys của Supabase, Google Places, Telegram, OpenRouter
    python telegram_bot.py
    ```

---

### Cách 2: Chạy toàn bộ ứng dụng bằng Docker Compose (Khuyên dùng)

Next.js đã được cấu hình build dưới dạng **`standalone`** tối ưu hóa dung lượng (chỉ khoảng ~150MB). Bạn có thể khởi động cả Web App Next.js và OpenClaw Bot chỉ với một lệnh duy nhất:

1.  Đảm bảo bạn đã điền đầy đủ `.env.local` và `openclaw/.env`.
2.  Khởi động các container:
    ```bash
    docker compose up --build -d
    ```
3.  Kiểm tra trạng thái:
    ```bash
    docker compose ps
    ```
    *   Web App Next.js sẽ chạy tại: `http://localhost:3000`
    *   OpenClaw Telegram bot sẽ tự động lắng nghe tin nhắn điều phối cào.

---

## 🚀 Hướng dẫn Triển khai lên VPS Hostinger (Production)

Để triển khai dự án lên **VPS Hostinger** sử dụng **Docker Manager**, cấu hình Nginx Reverse Proxy, và Let's Encrypt SSL tự động, vui lòng đọc chi tiết tại hướng dẫn:

👉 **[HƯỚNG DẪN TRIỂN KHAI VPS HOSTINGER (DEPLOYMENT.md)](file:///Users/sam92/Desktop/Projects/asian-health-hub/DEPLOYMENT.md)**

---

## 📁 Cấu trúc Thư mục Chính

```
asian-health-hub/
├── src/
│   ├── app/                    # Next.js App Router (pages, layouts, API routes)
│   ├── components/             # UI Components (ui/ primitives & feature components)
│   ├── lib/                    # Supabase Client & Server helpers
│   ├── services/               # Data Access Layer (clinic & article services)
│   └── types/                  # TypeScript Database types
├── openclaw/                   # AI Data Engine (Python Scraper & Telegram Bot)
├── supabase/                   # Database schema & Seed SQL scripts
├── Dockerfile                  # Next.js production Dockerfile
├── docker-compose.yml          # Docker Compose orchestration
└── DEPLOYMENT.md               # Hướng dẫn deploy production Hostinger
```

---

## 📜 Coding Conventions

*   **TypeScript**: `strict: true`, bắt buộc định kiểu rõ ràng, không sử dụng `any` bừa bãi.
*   **Server Components**: Ưu tiên Server Components mặc định cho SEO và hiệu năng, chỉ dùng `'use client'` cho các tương tác client.
*   **Error Handling**: Toàn bộ các API, Server Actions và Database queries phải bọc trong `try/catch` có ghi log.
