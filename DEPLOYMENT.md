# Hướng dẫn Triển khai: Hostinger VPS Docker Manager & Phân tích Rendering

Tài liệu này cung cấp hướng dẫn chi tiết về cơ chế rendering của dự án **Asian Health Hub** và cách triển khai dự án lên **Docker Manager của Hostinger (VPS)**.

---

## I. Phân tích Cơ chế Rendering (SSR, SSG, ISR)

Next.js App Router sử dụng mô hình Hybrid Rendering, kết hợp linh hoạt cả 3 cơ chế để tối ưu hóa hiệu năng, SEO và tính cập nhật dữ liệu. Dưới đây là phân bổ cơ chế thực tế của các route trong dự án sau khi chạy `npm run build`:

### 1. Static Site Generation (SSG) `○`
*   **Các trang áp dụng**: Trang chủ (`/`), Giới thiệu (`/about`), Đăng nhập/Đăng ký (`/auth/login`, `/auth/signup`), Trang yêu cầu Claim (`/claim`), trang Tin tức (`/pulse`), `/robots.txt`.
*   **Cơ chế**: Next.js biên dịch hoàn toàn các trang này thành file HTML/CSS tĩnh ngay tại thời điểm build (build-time). Khi người dùng truy cập, server chỉ việc trả về file tĩnh này trực tiếp thông qua CDN, đảm bảo thời gian tải trang gần như tức thời.

### 2. Incremental Static Regeneration (ISR) `●`
*   **Các trang áp dụng**: 
    *   Trang đích SEO theo thành phố: `/[state]/[city]` (Revalidate: `1d` - 1 ngày).
    *   Trang đích SEO theo chuyên khoa: `/[state]/[city]/[specialty]` (Revalidate: `1d` - 1 ngày).
    *   Trang bài viết: `/pulse/[slug]` (Revalidate: `3600` - 1 giờ).
*   **Cơ chế**: 
    *   Trang được sinh ra dưới dạng tĩnh khi build bằng cách gọi `generateStaticParams()` để Next.js biết trước các path cần dựng sẵn.
    *   Với từ khóa `revalidate` (được khai báo qua `export const revalidate = 86400;` hoặc `revalidate = 3600`), Next.js sẽ tự động tái tạo (regenerate) lại trang tĩnh đó một cách âm thầm ở background khi có request mới truy cập sau khoảng thời gian chỉ định.
    *   Bệnh nhân luôn thấy trang tĩnh tải nhanh mà dữ liệu từ database (do bot cào thêm) vẫn được tự động cập nhật sau mỗi 1 giờ hoặc 1 ngày.

### 3. Server-Side Rendering (SSR) `ƒ`
*   **Các trang áp dụng**: Trang tìm kiếm (`/search`), Trang quản trị (`/admin/*`), Trang chi tiết phòng khám (`/clinics/[slug]`), Dashboard bác sĩ (`/dashboard/*`), toàn bộ Route API (`/api/*`).
*   **Cơ chế**: Do các trang này chứa bộ lọc tìm kiếm thời gian thực (`searchParams`), hoặc phụ thuộc vào session/cookie người dùng (`headers()`, `cookies()`), Next.js sẽ chuyển trang sang render động tại Server (SSR). Mỗi khi có request, server Node.js trong Docker container sẽ truy vấn database Supabase theo thời gian thực để tạo ra HTML tương ứng trả về.

---

## II. Hướng dẫn Triển khai lên Hostinger Docker Manager

Hostinger cung cấp các VPS Linux tích hợp **Docker Manager** (cho phép bạn quản lý các container Docker trực tiếp qua giao diện hPanel hoặc SSH CLI). Để chạy ứng dụng này, cách tối ưu nhất là sử dụng **Docker Compose CLI** thông qua SSH để quản lý cả Web App và OpenClaw Bot.

### 1. Chuẩn bị VPS trên Hostinger
1.  Đăng nhập vào Hostinger Members Area → **VPS**.
2.  Nếu bạn chưa cài hệ điều hành, hãy chọn OS Template là **Ubuntu 22.04 with Docker** (đây là template cài sẵn Docker và Docker Compose).
3.  Lưu lại địa chỉ **IP VPS** và thông tin tài khoản **root**.

### 2. Cài đặt Project lên VPS
Kết nối tới VPS bằng terminal thông qua SSH:
```bash
ssh root@<IP_VPS_CUA_BAN>
```

Di chuyển tới thư mục làm việc và clone repository của bạn từ GitHub (hoặc upload mã nguồn lên):
```bash
cd /opt
git clone <URL_REPOSITOY_CUA_BAN> asian-health-hub
cd asian-health-hub
```

### 3. Cấu hình biến môi trường (.env)
Tạo file `.env.local` ở thư mục gốc cho Web App Next.js:
```bash
nano .env.local
```
Điền đầy đủ cấu hình kết nối database Supabase:
```env
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=generated-images
```
*(Nhấn `Ctrl + O` -> `Enter` để lưu, `Ctrl + X` để thoát).*

Tạo file `.env` cho OpenClaw Bot trong thư mục `openclaw/`:
```bash
nano openclaw/.env
```
Điền cấu hình bot Telegram và API Keys:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=generated-images
OPENROUTER_API_KEY=sk-or-...
GOOGLE_PLACES_API_KEY=AIzaSy...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_ALLOWED_USER_IDS=123456789
```

### 4. Build và Chạy Container bằng Docker Compose
Next.js 15+ yêu cầu các biến môi trường Supabase có sẵn tại thời điểm build (build-time) để sinh các trang tĩnh (SSG/ISR). Docker Compose sẽ tự động lấy các biến môi trường trong file `.env.local` truyền vào tham số build args của `Dockerfile` thông qua khai báo trong `docker-compose.yml`.

Chạy lệnh để build và khởi động các container ở chế độ chạy ngầm (detached mode):
```bash
docker compose up --build -d
```

Lệnh trên sẽ khởi chạy 2 container:
1.  **`asian-health-hub-web`**: Server Next.js lắng nghe ở cổng `3000`.
2.  **`asian-health-hub-openclaw`**: Bot Python Telegram chạy ngầm thực thi các pipeline cào dữ liệu.

Kiểm tra trạng thái các container:
```bash
docker compose ps
```

Xem log hoạt động của các service:
```bash
# Xem log Next.js Web
docker compose logs -f web

# Xem log Telegram Scraper Bot
docker compose logs -f openclaw-bot
```

### 5. Cấu hình Reverse Proxy Nginx & SSL (Let's Encrypt)
Để trỏ domain của bạn vào container Next.js (cổng 3000) và cài đặt HTTPS, hãy cài đặt Nginx trên VPS:

```bash
# Cài đặt Nginx
apt update
apt install nginx -y

# Cài đặt Certbot cho SSL
apt install certbot python3-certbot-nginx -y
```

Tạo cấu hình Nginx cho domain của bạn:
```bash
nano /etc/nginx/sites-available/asian-health-hub
```
Điền cấu hình reverse proxy:
```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Kích hoạt cấu hình và reload Nginx:
```bash
ln -s /etc/nginx/sites-available/asian-health-hub /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

Cài đặt chứng chỉ SSL tự động gia hạn:
```bash
certbot --nginx -d your-domain.com -d www.your-domain.com
```

### 6. Quản lý cập nhật mã nguồn (CI/CD thủ công)
Mỗi khi có thay đổi code trên nhánh chính (main), bạn chỉ cần kết nối SSH vào VPS và chạy chuỗi lệnh sau để cập nhật ứng dụng:
```bash
git pull origin main
docker compose up --build -d
```
Docker Compose sẽ chỉ build lại các layer chứa code thay đổi, giảm thiểu tối đa downtime của website.
