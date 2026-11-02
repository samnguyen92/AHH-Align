# TỐI ƯU HOÁ & Ý TƯỞNG — Asian Health Hub

> Đề xuất cải tiến cho scraping, tạo bài, tạo ảnh, chỉnh sửa trang, workflow và sản phẩm.
> Mỗi mục ghi **vấn đề hiện tại → đề xuất → lợi ích → công sức** (S ≤ 1 ngày, M ≈ 2–5 ngày, L > 1 tuần).
> Lỗi cụ thể và mã (S-xx, D-xx, P-xx…) nằm trong `ISSUES_AUDIT.md`.

## 0. Nên làm trước (thứ tự)

1. **Vá bảo mật & niềm tin dữ liệu** (S-01…S-03, D-02, D-03, D-04) — chưa vá thì chưa nên tăng tốc scrape/đăng bài.
2. **Hàng đợi job + bảng `jobs`** (mục 5.1) — nền cho mọi tối ưu sau.
3. **Provenance + trạng thái duyệt** cho dữ liệu clinic và bài (mục 1.1, 2.2).
4. **Scrape song song, bỏ Playwright khi không cần** (mục 1.3).
5. **Tìm kiếm tốt hơn** (cột rating, RPC, semantic search) và tính năng thu hút (mục 6).

---

## 1. Scraping & dữ liệu clinic

### 1.1 Provenance, độ tin cậy, vòng đời dữ liệu (M)
- **Hiện tại:** mọi thứ đổ vào `metadata` JSONB; không biết trường nào từ đâu, lúc nào; scrape lại ghi đè (D-01, P-05).
- **Đề xuất:** mỗi trường quan trọng lưu `{value, source, source_url, extracted_at, confidence, verified_by}`. Thêm cột `data_status` (`needs_review | published | stale | hidden`), `last_scraped_at`, `content_hash`. Quy tắc merge: giá trị do chủ clinic xác nhận > scrape có confidence cao > scrape thấp.
- **Lợi ích:** hiển thị "Cập nhật ngày…/Nguồn…", re-scrape thông minh, không mất chỉnh sửa của chủ clinic.

### 1.2 Xác minh ngôn ngữ — giá trị cốt lõi (M)
- **Hiện tại:** ngôn ngữ do LLM suy ra hoặc gán theo truy vấn (D-02).
- **Đề xuất:** tách `languages_verified` / `languages_claimed` / `languages_unverified`. Tín hiệu xác minh, theo độ mạnh: (1) chủ clinic xác nhận qua dashboard, (2) trang web có phiên bản/đoạn tiếng đó, (3) bác sĩ/nhân viên nêu rõ ngôn ngữ, (4) tên + review bằng ngôn ngữ đó, (5) gọi điện/khảo sát nhanh (có thể thuê CTV). Hiển thị huy hiệu "Đã xác minh bởi …".
- **Lợi ích:** đúng lời hứa sản phẩm, khác biệt với Zocdoc/Google.

### 1.3 Hiệu năng scrape (M)
- **Hiện tại:** tuần tự; Playwright luôn chạy kèm Jina; `networkidle` chậm; spider ≤ 4 trang.
- **Đề xuất:**
  - Thử `httpx` + BeautifulSoup trước (JSON-LD, ảnh, link nằm trong HTML tĩnh); chỉ mở Playwright khi nội dung < ngưỡng hoặc cần JS.
  - Một browser dùng chung, nhiều context, `asyncio` + semaphore 3–5.
  - Rate limit theo domain; tôn trọng `robots.txt`; cache theo `content_hash` (bỏ qua LLM nếu không đổi).
  - Chọn trang con theo ưu tiên: `/providers`, `/insurance`, `/services`, `/contact` thay vì 4 trang bất kỳ.
- **Lợi ích:** ước tính giảm 3–5× thời gian/clinic và giảm chi phí LLM.

### 1.4 Dedupe và khớp thực thể (M)
- **Hiện tại:** slug theo tên; scout dedupe theo tên và website (P-04).
- **Đề xuất:** khoá chính "thực thể": `google_place_id` → `npi` → hash(tên chuẩn hoá + địa chỉ chuẩn hoá + SĐT). Slug = `tên-thành phố` (+ hậu tố nếu trùng). Bảng `clinic_sources` (nhiều nguồn cho một clinic) để hợp nhất.
- **Khớp Google Places:** chấm điểm tên/địa chỉ/SĐT, chỉ nhận khi ≥ ngưỡng, ngược lại đưa vào hàng đợi duyệt (D-05).

### 1.5 Nguồn dữ liệu chính thống (M)
- **NPI Registry (NPPES):** `PIPELINE.md` có kế hoạch nhưng chưa có code. Dùng để xác minh bác sĩ/chuyên khoa/địa chỉ và seed dữ liệu theo họ.
- **State medical boards / CMS Care Compare:** giấy phép, bảo hiểm Medicare.
- **Medi-Cal / Covered California provider lists:** bộ lọc bảo hiểm cực kỳ giá trị cho cộng đồng.

### 1.6 Trích xuất (S–M)
- Bật **caching prompt**/dùng model rẻ cho trang ngắn; chia nhỏ trang dài (Markdown theo mục) rồi gộp để giảm lỗi "bịa".
- Schema Pydantic: thêm `evidence_quote` (trích nguyên văn ≤ 200 ký tự) cho trường nhạy cảm (ngôn ngữ, bảo hiểm, nhận bệnh nhân mới) và kiểm tra quote có nằm trong nguồn.
- Bảng chi phí/chất lượng theo model (hiện hardcode, L-10): đặt trong `config.py`/env.

### 1.7 Ảnh clinic (S)
- Ưu tiên ảnh từ website (re-host về Storage) → ảnh Google (theo điều khoản) → **placeholder trung tính** (không dùng ảnh AI làm ảnh đại diện của một nơi có thật). Xem D-06.

---

## 2. Tạo bài viết

### 2.1 Tách pipeline thành các bước (M)
`generate_insights.py` (2.5k dòng) nên thành: `topic → research → outline → draft → fact-check → edit → image → review → publish`. Mỗi bước là hàm nhỏ có input/output Pydantic, test được, chạy lại từng bước được (hiện lỗi giữa chừng phải chạy lại từ đầu và tốn tiền ảnh).

### 2.2 Kiểm soát chất lượng y khoa (M)
- Mặc định `draft` (D-04); trường `reviewed_by`, `reviewed_at`, `medical_disclaimer`.
- **Fact-check tự động:** mỗi câu chứa số liệu/khuyến cáo phải map tới một nguồn trong `article_facts`; bước LLM "verifier" so sánh nội dung với đoạn trích nguồn; câu không có nguồn bị gắn cờ.
- Danh sách nguồn tin cậy (CDC, NIH, CMS, USCIS cho I-693…) đã có trong code → chuyển thành cấu hình, thêm nguồn tiếng Việt/Hàn/Hoa uy tín.
- Tránh nội dung "hướng dẫn điều trị" cụ thể; ưu tiên hướng dẫn thủ tục, bảo hiểm, chuẩn bị khám.

### 2.3 Đa ngôn ngữ thật sự (M)
- Hiện chủ yếu tiếng Việt/Anh. Đề xuất: bản gốc tiếng Anh có nguồn → bản dịch Việt/Hàn/Hoa có người bản ngữ rà soát; bảng `article_translations`; `hreflang`; URL `/vi/insights/...`.
- Glossary thuật ngữ y khoa (Anh–Việt–Hàn–Hoa) để dịch nhất quán.

### 2.4 SEO & chống trùng (S–M)
- Chống trùng chủ đề bằng embedding (pgvector đã có) thay vì so tiêu đề.
- Internal link tự động: bài → clinic/thành phố liên quan; schema `Article`, `FAQPage`, `MedicalWebPage`.
- Cụm chủ đề (pillar + cluster): "I-693", "Medi-Cal cho người lớn tuổi", "khám sức khoẻ thẻ xanh"…
- Theo dõi hiệu quả: Search Console API → bài nào lên top → sinh thêm bài cùng cụm.

### 2.5 Chi phí và độ ổn định (S)
- Theo dõi token/chi phí mỗi bài; ngân sách ngày; ngắt khi vượt.
- Lưu bản nháp từng bước vào DB để tiếp tục khi lỗi.

---

## 3. Tạo ảnh

| Vấn đề | Đề xuất |
|---|---|
| Prompt hiện yêu cầu "trông như ảnh thật, không phải AI" cho ảnh clinic (`image_generator.py`) | Chỉ dùng ảnh AI cho **bài viết**, có nhãn "AI-generated"; clinic dùng ảnh thật hoặc placeholder (D-06) |
| Model/prompt hardcode rải rác | `config/images.py`: model, style, negative prompt, kích thước, 1 nơi |
| Sinh ảnh tốn tiền, không kiểm tra | Bước QA: không có chữ/logo, đúng tỉ lệ, không biến dạng tay/mặt (có thể dùng vision model chấm điểm 1–5, retry tối đa 2 lần) |
| Ảnh lưu `public/` trong git | Chỉ Storage; commit không chứa ảnh sinh ra (L-04) |
| Một kích thước | Sinh một ảnh gốc → tạo `hero 1600w`, `card 600w`, `og 1200×630` (WebP/AVIF) |
| Tên file tiếng Việt dài | `{slug-ascii}-{hash8}.webp` |
| Không dedupe | Hash nội dung; cache theo `(prompt_hash, model)` |
| Tạo lại ảnh bài rất thủ công (`repair_article_images`) | Nút "Tạo lại ảnh" trong admin + chọn ảnh từ thư viện (`/api/admin/media` đã có) |

Đa dạng và tôn trọng văn hoá: bộ hướng dẫn hình ảnh (tránh khuôn mẫu, thể hiện đa dạng độ tuổi/giới tính/bối cảnh, bối cảnh gia đình nhiều thế hệ) trong `docs/agent-guides/content-and-data-quality.md`.

---

## 4. Chỉnh sửa trang & CMS

- **Admin chỉnh trực tiếp** (đã có `article-editor.tsx`, `clinics-management.tsx`): thêm **lịch sử chỉnh sửa/diff** (bảng `revisions`), nút "khôi phục", xem trước, lịch xuất bản.
- **Khoá trường theo nguồn sở hữu:** trường chủ clinic đã sửa không bị scraper ghi đè (D-01).
- **Dashboard chủ clinic:** biểu mẫu có cấu trúc (giờ, ngôn ngữ từng bác sĩ, bảo hiểm, nhận bệnh nhân mới) thay vì sửa JSON; xem trước hồ sơ; chỉ số "bao nhiêu lượt xem/gọi/đặt lịch".
- **Hàng đợi duyệt trong admin:** clinic mới scrape (`needs_review`), claim, bài nháp, ảnh chờ duyệt — một màn hình duy nhất.
- **Tách `clinics-management.tsx`** (19 lỗi `any`) thành form + bảng + hook; Zod schema dùng chung client/server.
- **Dọn CSS/giao diện:** `longevity.css`, `globals.css` và hệ `lg/` song song với `ui/` → chọn một hệ thiết kế.

---

## 5. Workflow & vận hành

### 5.1 Hàng đợi job và bảng `jobs` (M) ← nền tảng
```
jobs(id, type, params jsonb, status, progress, result jsonb, error,
     cost_usd, created_by, created_at, started_at, finished_at)
```
- Worker Python lấy job bằng `SELECT … FOR UPDATE SKIP LOCKED` (không cần Redis ban đầu).
- Bot Telegram **và** trang `/admin/pipeline` cùng tạo/đọc job → hết dry-run giả (B-10), hết `redirect_stdout` (P-02), có retry/huỷ/lịch sử/chi phí.
- Job con theo clinic (idempotent, có `attempts`).

### 5.2 Telegram dễ dùng hơn (S–M)
- Nút inline `✅ Duyệt / ✏️ Sửa / ❌ Huỷ` gắn `action_id`, TTL 10 phút (P-11).
- Menu theo nhóm (Clinic / Nội dung / Claim / Hệ thống) thay vì ~30 lệnh.
- Tóm tắt hằng ngày: clinic mới, bài nháp chờ duyệt, claim chờ, lỗi job, chi phí hôm nay.
- Chỉ gửi thông báo từ web qua hàng đợi (có retry); escape HTML (S-08).

### 5.3 Chất lượng & CI (M)
- GitHub Actions: `tsc`, `eslint`, `next build` (env giả), `python -m compileall`, `pytest`.
- Test ưu tiên: auth/role (S-01), `insert_clinic` merge (D-01), `searchClinics` filter, parser `extractor` với fixture HTML đã lưu (không gọi mạng).
- Pre-commit: chặn `.env`, `*.log`, ảnh > 500KB trong `public/`.
- Quan sát: Sentry (web + Python), log có `job_id`, dashboard lỗi pipeline.

### 5.4 Hạ tầng (S–M)
- Quyết định rõ: bot chạy ở đâu (VPS/Fly/Railway) với `restart`, healthcheck, secrets quản lý (không file `.env` trên máy cá nhân).
- Ghim phiên bản `requirements.txt` (L-07), cập nhật Playwright image chính thức.
- Sao lưu Supabase (PITR) trước khi chạy job hàng loạt; đặt `statement_timeout`.

---

## 6. Ý tưởng sản phẩm

**Độ tin cậy & khác biệt**
1. **Huy hiệu "Language verified"** theo từng bác sĩ + ngày xác minh; nút "Báo thông tin sai" (người dùng góp phần làm sạch dữ liệu).
2. **Tìm kiếm tự nhiên đa ngôn ngữ:** "bác sĩ nhi nói tiếng Việt gần Garden Grove nhận Medi-Cal" → embedding + bộ lọc có cấu trúc (hạ tầng pgvector có sẵn, cần pipeline nạp embedding — hiện `clinic_embeddings` chưa được ghi ở đâu cả).
3. **Bộ lọc bảo hiểm** (Medi-Cal, Medicare, Covered California, tự thanh toán) và "nhận bệnh nhân mới".
4. **Phiên dịch & hỗ trợ:** hiển thị clinic có thông dịch viên, có dịch vụ điện thoại tiếng mẹ đẻ, tư vấn từ xa.

**Tăng trưởng**
5. **Landing page SEO** theo `thành phố × chuyên khoa × ngôn ngữ` (đã có cấu trúc) + nội dung địa phương (khu Little Saigon, Koreatown, Flushing, Chinatown…).
6. **Hướng dẫn thủ tục** (I-693, bảo hiểm cho người mới đến, đặt lịch lần đầu, chuẩn bị giấy tờ) — nội dung hút traffic bền vững.
7. **Kênh cộng đồng:** Zalo OA, KakaoTalk, WeChat, Facebook group; newsletter theo ngôn ngữ (Pulse).
8. **Đối tác:** hội đồng hương, nhà thờ/chùa, ESL schools, trung tâm người cao tuổi, công ty bảo hiểm.

**Doanh thu**
9. **Gói cho clinic:** hồ sơ nổi bật, nút gọi/đặt lịch có theo dõi, báo cáo hàng tháng (lượt xem, cuộc gọi), quản lý review. Cần claim flow an toàn (S-05…S-07).
10. **Lead có đồng ý của bệnh nhân** (form "nhờ clinic gọi lại bằng tiếng Việt") — tuân thủ HIPAA/quy định quảng cáo y tế; tránh thu thập thông tin sức khoẻ nhạy cảm nếu chưa có pháp lý rõ.

**Tuân thủ & đạo đức (nên làm sớm)**
- Trang "Cách chúng tôi xác minh dữ liệu"; chính sách nội dung AI; điều khoản/quyền riêng tư cho form liên hệ; nhãn quảng cáo/được tài trợ khi có gói trả phí.
- Rà điều khoản của Google Places, Zocdoc, Healthgrades, Jina, Brave trước khi lưu/hiển thị lại dữ liệu của họ (D-05, `third_party_profiles.py`).

---

## 7. Mốc đề xuất

| Giai đoạn | Nội dung | Kết quả đo được |
|---|---|---|
| **Tuần 1–2: Ổn định** | PR 1–5 trong `ISSUES_AUDIT.md` §7 + CI | 0 lỗ hổng Critical, `tsc/lint/build` xanh |
| **Tuần 3–4: Dữ liệu sạch** | provenance, dedupe theo place_id, languages tách bạch, xoá dữ liệu mẫu | % clinic có nguồn & ngày; 0 clinic ngôn ngữ chưa xác minh hiển thị như đã xác minh |
| **Tuần 5–6: Tốc độ** | bảng `jobs`, worker, scrape song song, cache hash | thời gian/clinic, chi phí/clinic giảm ≥ 50% |
| **Tuần 7–8: Nội dung** | pipeline bài nhiều bước + duyệt + fact-check; ảnh QA | % bài có nguồn đủ; thời gian duyệt/bài |
| **Sau đó** | tìm kiếm tự nhiên, dashboard clinic, gói trả phí | lượt tìm kiếm có kết quả, claim hoàn tất, lead |
