@AGENTS.md

# Claude Code — ghi chú riêng

- Trả lời người dùng bằng **tiếng Việt** trừ khi họ viết tiếng Anh. Giữ nguyên thuật ngữ kỹ thuật tiếng Anh.
- Trước khi sửa auth / RLS / claim / pipeline: đọc `docs/ISSUES_AUDIT.md` và kiểm tra lỗi đó đã được sửa chưa.
- Khi phát hiện lỗi mới: thêm vào `docs/ISSUES_AUDIT.md` (mã lỗi, mức độ, file:dòng, cách tái hiện, cách sửa) thay vì chỉ nhắc trong chat.
- Không chạy scraper, job sinh bài/ảnh, hoặc script ghi vào Supabase thật nếu chưa được xác nhận — chúng tốn tiền API và ghi dữ liệu production.
- Báo cáo trung thực: nêu rõ lệnh nào đã chạy (`tsc`, `lint`, `build`, `pytest`), lệnh nào chưa.
- Khi dùng subagent để tìm kiếm rộng, vẫn phải tự đọc lại file trước khi sửa.
