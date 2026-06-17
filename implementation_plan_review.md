# Implementation Plan Review

## Đúng Và Đã Sửa

### 1. Generic topic bị pass qua như topic thật

**Đánh giá:** Đúng. Intent Analyzer hoặc parser có thể biến request chung chung như `write an guide insight for me` thành topic thật.

**Đã sửa ở:**
- `generate_insights.py:81` thêm `GENERIC_TOPIC_FILLER_WORDS` và `GENERIC_TOPIC_PHRASES`.
- `generate_insights.py:176` thêm `looks_like_generic_content_request()`.
- `generate_insights.py:192` thêm `clean_requested_topic()`.
- `generate_insights.py:664` và `generate_insights.py:682` clean topic trong `create_article()` và `create_guide()`.
- `telegram_bot.py:546` thêm `looks_like_generic_content_topic()`.
- `telegram_bot.py:617` cập nhật `clean_content_topic()`.
- `telegram_bot.py:841` clean topic từ Intent Analyzer.

**Khuyến nghị:** Không cần sửa thêm ngay. Về lâu dài có thể tách logic generic-topic sang module nhẹ dùng chung.

### 2. Flow metadata/title trước, references sau, content sau cùng

**Đánh giá:** Đúng. Flow mới đã tạo metadata/outline trước, dùng metadata build reference query, rồi mới generate content sections dựa trên evidence.

**Đã sửa ở:**
- `generate_insights.py:1745` thêm `generate_article_metadata_outline()`.
- `generate_insights.py:1785` thêm `generate_article_sections_data()`.
- `generate_insights.py:1829` cập nhật `create_article_from_prompt()` theo flow metadata -> evidence label -> references -> sections.

**Khuyến nghị:** Có thể bổ sung unit test cho thứ tự flow.

### 3. Reference search label dùng title/keyword thay vì raw request

**Đánh giá:** Đúng. Search label hiện được build từ `title`, `primary_keyword`, `secondary_keywords`, và `tags`.

**Đã sửa ở:**
- `generate_insights.py:2008` thêm `build_reference_query_label_from_metadata()`.
- `generate_insights.py:1830-1836` dùng metadata để build `evidence_label` trước khi search.

**Khuyến nghị:** Không cần sửa thêm ngay.

### 4. Search query quá hẹp nên dễ chỉ ra CDC/NIH

**Đánh giá:** Đúng một phần. Đã thêm fallback query ngắn hơn, nhưng vẫn có thể search nhiều query không hiệu quả.

**Đã sửa ở:**
- `generate_insights.py:2026` thêm template `health information site:domain`.

**Khuyến nghị:** Thêm early-stop cho query failures và cải thiện query ordering.

## Đúng Và Chưa Sửa

### 1. Reference search vẫn có thể lãng phí nhiều query

**Đánh giá:** Đúng. `gather_reference_evidence()` vẫn loop tuần tự qua query list nếu chưa đủ evidence.

**Dẫn chứng:** `generate_insights.py:2144` loop qua `build_reference_search_queries(label, mode)`.

**Phương án:** Thêm `consecutive_empty_searches`; stop sau khoảng 6 query liên tiếp không scrape được source nào. Làm early-stop trước khi tính parallel search.

### 2. Guide có thể quá nhiều sections

**Đánh giá:** Đúng, nhưng không phải do duplicate bug. Cap hiện tại cho phép guide quá dài.

**Dẫn chứng:** `generate_insights.py:1557` trả về `Key Takeaways + regular_headings[:14] + FAQs + Next Steps + References`.

**Phương án:** Đổi `regular_headings[:14]` thành khoảng `regular_headings[:10]` hoặc `regular_headings[:11]`.

### 3. Section generation chưa có retry từng section

**Đánh giá:** Đúng. Nếu một section `call_text_model()` fail thì toàn bộ article fail.

**Dẫn chứng:** `generate_insights.py:1797-1806` gọi `call_text_model()` trực tiếp trong loop section.

**Phương án:** Thêm `generate_section_with_retries()` retry 2 lần với backoff. Nếu vẫn fail, nên fail job thay vì publish placeholder.

### 4. Image generation tuần tự

**Đánh giá:** Đúng. `generate_article_images()` tạo từng image tuần tự nên chậm với 3-5 images.

**Dẫn chứng:** `generate_insights.py:940` loop qua `image_prompts` tuần tự.

**Phương án:** Có thể dùng `ThreadPoolExecutor(max_workers=2 hoặc 3)`, giữ rate limit an toàn.

### 5. pending_actions và telegram_memory.json chưa thread-safe

**Đánh giá:** Đúng nếu bot chạy job threads song song.

**Dẫn chứng:** `telegram_bot.py` dùng `pending_actions` và memory file; cần rà soát quanh `load_memory()`, `save_memory()`, `run_job()`.

**Phương án:** Thêm `threading.Lock` cho `pending_actions` và memory read/write.

### 6. openclaw.log chưa rotate

**Đánh giá:** Đúng. `_write_log()` append mãi vào `openclaw.log`.

**Dẫn chứng:** `jobs.py` `_write_log()` ghi append trực tiếp vào `LOG_PATH`.

**Phương án:** Dùng `RotatingFileHandler` hoặc manual rotate 5MB, `backupCount=3`.

### 7. Thiếu progress feedback cho job dài

**Đánh giá:** Đúng về UX. Guide/research có thể chạy lâu nhưng user chỉ thấy started/finished.

**Dẫn chứng:** `telegram_bot.py` `run_job()` hiện gửi started và summary cuối; `generate_insights.py` section loop chưa có progress callback.

**Phương án:** Thêm optional `progress_fn`; báo sau mỗi 3 sections hoặc mỗi phase lớn.

## Sai Vì Chưa Hiểu Flow

### 1. Duplicate outline do normalize_outline luôn prepend/append bất kể LLM đã include

**Đánh giá:** Sai với code hiện tại.

**Nguyên nhân:** Code đã remove `Key Takeaways` và filter `FAQs`, `Next Steps`, `References` trước khi append canonical.

**Dẫn chứng:**
- `generate_insights.py:1542` remove heading match `is_key_takeaways_heading()`.
- `generate_insights.py:1553-1557` filter `regular_headings` rồi append canonical.

**Kết luận:** Không fix theo hướng append-if-missing. Chỉ chỉnh section cap nếu muốn guide ngắn hơn.

### 2. Nếu metadata generation fail thì reference search dùng label rác

**Đánh giá:** Sai với flow hiện tại.

**Nguyên nhân:** Reference search chỉ chạy sau khi `generate_article_metadata_outline()` thành công.

**Dẫn chứng:**
- `generate_insights.py:1830` gọi `generate_article_metadata_outline()`.
- `generate_insights.py:1836` mới gọi `gather_reference_evidence()`.

**Kết luận:** Không cần sửa cho case này. Có thể thêm log rõ hơn khi metadata fail.

### 3. Nên import generic topic logic từ generate_insights.py vào telegram_bot.py

**Đánh giá:** Không nên.

**Nguyên nhân:** `generate_insights.py` là module nặng, import OpenAI, Supabase, storage và load env ở top-level. Kéo nó vào bot parser làm coupling xấu.

**Phương án tốt hơn:** Tạo module nhẹ như `openclaw/content_intent.py`, rồi cả `telegram_bot.py` và `generate_insights.py` cùng import.

### 4. Parallel search là fix chính cho reference waste

**Đánh giá:** Cần cân nhắc. Parallel có thể nhanh hơn nhưng dễ bị block/rate-limit với DuckDuckGo/Bing HTML scraping.

**Dẫn chứng:** `research_agents.py` `search_web()` dùng HTML providers; `generate_insights.py` `gather_reference_evidence()` gọi `search_web`.

**Phương án tốt hơn:** Ưu tiên early-stop và query ordering trước. Chỉ cân nhắc parallel nhỏ `max_workers=2-3` sau đó.

## Checklist Ưu Tiên

1. Fix guide section cap.
2. Thêm early-stop cho reference search.
3. Thêm retry từng section.
4. Thêm lock cho Telegram memory/pending actions.
5. Log rotation.
6. Progress updates.
7. Refactor module nhỏ nếu muốn giảm duplicate topic-cleaning logic.
