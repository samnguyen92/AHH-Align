# Guide: Nội dung AI, ảnh và chất lượng dữ liệu

> Bổ sung cho `AGENTS.md`. Đọc khi sinh/sửa bài, ảnh, hoặc dữ liệu clinic.
> AHH là sản phẩm y tế (YMYL). Sai thông tin = hại cho bệnh nhân + rủi ro pháp lý + mất thứ hạng.

## 1. Bốn bất biến

1. **Không bịa.** Không tạo review, bác sĩ, NPI, chứng chỉ, testimonial, số liệu. Thiếu dữ liệu → để trống hoặc ghi "Chưa có thông tin".
2. **Có nguồn.** Mọi dữ kiện nhạy cảm có `source_url` + `extracted_at`; tuyên bố y khoa có nguồn đáng tin.
3. **Có người duyệt.** Nội dung AI mới → `draft`. Chỉ publish sau khi có người rà soát và ghi tên.
4. **Trung thực về AI.** Ảnh AI có nhãn; không đưa ảnh AI làm ảnh thật của một cơ sở có thật; không gán tác giả là "đội ngũ y khoa" khi không có.

## 2. Dữ liệu clinic

| Trường | Quy tắc |
|---|---|
| `languages` | Chỉ ngôn ngữ **có bằng chứng** (trang web nêu rõ / chủ clinic xác nhận). Suy đoán từ họ tên hoặc từ truy vấn tìm kiếm → `languages_unverified`. Chuẩn hoá tên: `Vietnamese`, `Korean`, `Chinese (Mandarin)`, `Chinese (Cantonese)`, `Spanish`… |
| `insurance` | Chỉ ghi "chấp nhận" khi trang nói rõ; `null` nếu không rõ. Luôn kèm lời nhắc "gọi xác nhận" |
| `accepting_new_patients` | `null` nếu không rõ; hiển thị ngày kiểm tra |
| `working_hours` | Ưu tiên website; Google Places là nguồn thứ hai; ghi nguồn |
| `rating`/`reviews` | Chỉ từ nguồn thật, ghi nguồn và ngày; không cho người dùng sửa; tuân thủ điều khoản nguồn |
| `team_members` | Tên + vai trò đúng như nguồn; không thêm bio do suy đoán |
| `specialty` | Dùng danh sách chuẩn (taxonomy) để landing page SEO không bị phân mảnh |
| Ảnh | Ảnh từ website → re-host Supabase Storage; nếu không có → placeholder trung tính |

Mỗi bản ghi nên có `data_status`: `needs_review` → `published` → `stale` (quá 180 ngày chưa kiểm tra) → `hidden`.

## 3. Bài viết (Insight / Guide / Pulse)

**Quy trình:** topic → research (nguồn tin cậy) → outline → viết → **kiểm chứng** → biên tập → ảnh → **người duyệt** → publish.

- Nguồn ưu tiên: CDC, NIH/NLM, CMS/Medicare/Medicaid, USCIS (I-693), cơ quan y tế bang/quận, hiệp hội chuyên khoa. Không dùng blog ẩn danh làm nguồn dữ kiện.
- Mỗi con số, khuyến cáo, tên thuốc, liều lượng: có dòng trong `article_facts` với URL nguồn. Không có → bỏ câu.
- **Không** đưa lời khuyên chẩn đoán/điều trị cá nhân hoá. Thêm cảnh báo: "Thông tin chỉ mang tính tham khảo, không thay thế tư vấn y tế."
- Bài dựa trên URL tham khảo: viết lại **nguyên bản**, không sao chép câu/cấu trúc; ghi nguồn.
- Độ dài mục tiêu: insight 1200–1500 từ, guide ≈ 2000–3000 từ (xem `CONTENT_WORD_TARGETS`), nhưng **chất lượng > số từ**.
- SEO: một từ khoá chính, tiêu đề ≤ 60 ký tự, mô tả ≤ 155 ký tự, heading phân cấp, FAQ thật sự là câu hỏi người dùng, liên kết nội bộ tới clinic/thành phố liên quan.
- Ngôn ngữ: viết tự nhiên cho cộng đồng; thuật ngữ y khoa kèm tiếng Anh ở lần đầu (vd. "huyết áp cao (hypertension)").
- Slug ASCII, duy nhất; giữ `legacy_slugs` khi đổi.
- Rewrite: lưu bản cũ vào `seo_meta.versions`, tăng `current_version`.

## 4. Ảnh AI

- Dùng cho **bài viết**, không cho hồ sơ clinic thật.
- Prompt: bối cảnh đời thường, ánh sáng tự nhiên, đa dạng độ tuổi/giới, gia đình nhiều thế hệ; **không** chữ, logo, biển hiệu đọc được; không rập khuôn; không hình ảnh gây sợ hãi.
- Tránh: khuôn mặt giống người nổi tiếng, trẻ em trong bối cảnh y tế nhạy cảm, hình bộ phận cơ thể thật chi tiết.
- Có `alt` mô tả (không nhồi từ khoá) và nhãn "Ảnh minh hoạ do AI tạo".
- Kích thước: hero 1600×900, thẻ 800×450, OG 1200×630; định dạng WebP; tên file `{slug}-{hash8}.webp`.
- QA tự động: kiểm tra không có chữ/logo, tay/mặt bình thường; retry tối đa 2 lần; lưu `prompt`, `model`, `cost` để truy vết.

## 5. Nội dung tiếng Việt / Hàn / Hoa

- Người bản ngữ rà soát trước khi publish bản dịch; dùng glossary thống nhất.
- Giữ ký tự Unicode trong nội dung, **chỉ slug/tên file** mới ASCII.
- Không dịch máy rồi publish thẳng.

## 6. Checklist trước khi publish

- [ ] Tất cả dữ kiện có nguồn, nguồn còn truy cập được
- [ ] Không có dữ liệu bịa / mẫu
- [ ] Ngôn ngữ clinic đã xác minh hoặc có nhãn "chưa xác minh"
- [ ] Có người duyệt (tên + ngày)
- [ ] Cảnh báo y tế + nhãn AI
- [ ] Ảnh có alt, đúng kích thước, đã lên Storage
- [ ] Metadata SEO + canonical + schema phù hợp
