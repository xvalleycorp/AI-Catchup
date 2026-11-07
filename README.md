# AI Catchup

Toàn cảnh AI trên một trang: tin từ các lab, repo đang lên, model mới, paper và thảo luận cộng đồng. Chọn lọc hoàn toàn bằng rule, không dùng AI.

**Xem tại: [catchup.xai.io.vn](https://catchup.xai.io.vn)**

## Trang hiển thị gì

| Khu vực | Nội dung |
| --- | --- |
| Không nên bỏ lỡ | Tối đa 10 mục đạt ngưỡng quan trọng, kèm lý do chọn |
| Xu hướng | Số mục theo chủ đề trong 7 ngày, các model được nhiều nguồn nhắc đến. Bấm chủ đề để lọc cả trang |
| 6 cột theo kênh | Lab, GitHub, Model, Paper, Cộng đồng, Báo chí và phân tích |
| AI trong các ngành | So sánh 9 ngành, đào sâu ngân hàng theo hướng ứng dụng và tên ngân hàng |
| Bảo mật & vòng đời | Lỗ hổng (GitHub Advisory) của khoảng 40 thư viện AI phổ biến, và lịch ngừng hỗ trợ model của OpenAI, Anthropic, Google Gemini |
| Bản phát hành công cụ | Bản ổn định mới nhất của Claude Code, Codex CLI, Ollama, llama.cpp… |
| Dòng thời gian | Xu hướng theo chủ đề và công ty, tích lũy từ ngày đầu thu thập |

Trình duyệt nhớ lần ghé trước và chấm đỏ các mục mới kể từ đó.

Có hai giao diện, chuyển bằng nút trên thanh đầu trang (trình duyệt ghi nhớ lựa chọn):

- **Terminal** (mặc định): toàn màn hình, không cuộn trang, gồm các khung [1] Không nên bỏ lỡ, [2] Tổng quan, [3] Ngân hàng & các ngành, [4] Tất cả tin, [5] Bảo mật & vòng đời. Phím 1–5 chọn khung, `/` mở dòng lệnh: `tìm <từ khóa>`, `ngành <tên>`, `chủ đề <tên>`, `công ty <tên>`, `khoảng 1|3|7|14`, `xóa`, `giao diện pro|terminal`, `help`.
- **Professional**: trang cuộn, phong cách báo cáo phân tích, có chế độ sáng và tối.

Bấm vào bất kỳ cột, thanh hoặc ô nào trên biểu đồ để mở danh sách tin tạo nên con số đó.

## Nguồn dữ liệu

52 nguồn, khai báo trong [`src/sources.ts`](src/sources.ts):

- **Lab:** OpenAI, Anthropic (News, Engineering), Google DeepMind, Google AI, Meta AI, Mistral, Hugging Face, NVIDIA, Microsoft Research
- **GitHub:** Trending (tất cả, Python, TypeScript, theo tuần), repo mới nổi qua Search API
- **Model:** Hugging Face Trending, model mới trên OpenRouter
- **Paper:** Hugging Face Daily Papers
- **Cộng đồng:** Hacker News, r/LocalLLaMA, r/MachineLearning, Lobsters
- **Phân tích:** Latent Space / AINews, Simon Willison, Interconnects, Import AI, Ahead of AI
- **Báo chí:** TechCrunch, The Verge, The Decoder, MIT Technology Review
- **Ngân hàng và tài chính:** Finextra, Banking Dive, PYMNTS, BIS, FSB
- **Các ngành khác:** Healthcare Dive, Higher Ed Dive, EdSurge, Retail Dive, Manufacturing Dive, Utility Dive, Supply Chain Dive, Artificial Lawyer
- **Bản phát hành:** 8 dự án theo dõi qua GitHub Releases

## Cách hoạt động

```
Cron 08:00 và 16:00 (giờ Việt Nam)
  └─ Workflow CatchupRun
       ├─ mỗi nguồn một step: tải → phân tích → áp rule → ghi D1
       └─ step cuối: dựng snapshot của trang
Người xem → Worker → snapshot → HTML (cache 10 phút ở edge)
```

Mỗi nguồn chạy trong một step riêng của [Cloudflare Workflows](https://developers.cloudflare.com/workflows/), nên có ngân sách CPU riêng, tự retry, và một nguồn lỗi không ảnh hưởng các nguồn khác. Toàn bộ chạy được trên gói Workers Free.

## Rule

Mọi rule nằm trong [`src/rules.ts`](src/rules.ts):

1. **Liên quan:** nguồn tổng hợp (HN, GitHub Trending…) phải khớp từ khóa AI mới được giữ.
2. **Chủ đề:** mỗi mục được gắn chủ đề bằng regex.
3. **Điểm:** độ tin cậy của nguồn + tín hiệu (sao, điểm, upvote, theo thang log) + từ khóa phát hành − từ khóa nhiễu, rồi giảm dần theo thời gian.
4. **Không nên bỏ lỡ:** ưu tiên những gì một Enterprise Architect trong ngân hàng cần hành động: quy định và giám sát, rủi ro bảo mật, thương vụ lớn, thay đổi nền tảng doanh nghiệp của nhà cung cấp, ngân hàng triển khai AI. Các lý do này được cộng điểm để xếp trên độ phổ biến. Ngoài ra một mục cũng được chọn khi:
   - Lab công bố model hoặc sản phẩm mới
   - HN từ 300 điểm, Lobsters từ 40 điểm
   - Repo tăng từ 2.000 sao/ngày hoặc 12.000 sao/tuần
   - Model mở mới từ lab lớn (HF trending từ 300), hoặc model mới của lab lớn trên OpenRouter
   - Từ 3 nguồn cùng nhắc một model có phiên bản

   Mỗi kênh có giới hạn số mục (`MUST_LANE_CAP`) để không kênh nào chiếm hết danh sách.
5. **Gộp tin:** cùng một URL từ nhiều nguồn được gộp thành một mục.

## Phát triển

Cần Node.js 22 trở lên và tài khoản Cloudflare.

```bash
npm install
npm run db:local
npm run dev                                      # http://localhost:8787
curl "localhost:8787/__scheduled?cron=0+0+*+*+*" # chạy một lần quét
npm run check && npm test
```

Lần quét local có thể mất vài phút nếu có nguồn phải retry.

## Triển khai

```bash
npx wrangler login
npx wrangler d1 create ai-catchup   # lần đầu; dán database_id vào wrangler.jsonc
npm run deploy
npx wrangler workflows trigger ai-catchup-run   # quét ngay, không chờ cron
```

Có thể đặt `GITHUB_TOKEN` (không cần scope nào) nếu Search API bị giới hạn:

```bash
npx wrangler secret put GITHUB_TOKEN
```

Đổi tên miền trong `routes` của [`wrangler.jsonc`](wrangler.jsonc), đổi lịch quét trong `triggers.crons`.

## Thêm nguồn

Thêm một dòng vào [`src/sources.ts`](src/sources.ts). Nguồn có RSS hoặc Atom không cần viết thêm code. Nguồn khác cần thêm một parser trong [`src/parsers.ts`](src/parsers.ts).

## Lịch sử

Dữ liệu không bị xóa. `items` giữ mọi tin, `signal_history` ghi giá trị sao, điểm và trending theo từng ngày. Bảng này không thể dựng lại về sau, nên nó bắt đầu ghi ngay từ khi triển khai.

## API

- `GET /api/snapshot.json`: dữ liệu của trang, gồm cả tình trạng từng nguồn (`health`) để theo dõi vận hành. Trang không hiển thị và không link tới phần này.
- `GET /api/history.json`: số liệu theo ngày cho dòng thời gian.
