# Performance local — virtual clients

Nguồn: backend/tests/performance/results.json; testAuditFarm.js. HTTP thật và SQL thật trong DB tạm, synthetic account, không external traffic. Client và server cùng tiến trình Node trên Windows: CPU/RSS là số đo tổng của harness, không phải riêng backend/VPS; pool max 10, không đo peak DB connections/slow-query-log/CPU MySQL. API limiter không mount trong benchmark; không đại diện production/Nginx rate limit.

| Operation | Clients | Max in-flight | RPS thành công | Avg ms | P95 ms | P99 ms | Lỗi/lượt | CPU ms | RSS MiB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| next-task | 1 | 1 | 47.6 | 21.0 | 21.0 | 21.0 | 0/1 | 0.0 | 133.0 |
| heartbeat | 1 | 1 | 111.1 | 9.0 | 9.0 | 9.0 | 0/1 | 15.0 | 133.2 |
| next-task | 10 | 10 | 25.2 | 280.3 | 373.0 | 373.0 | 0/10 | 328.0 | 159.0 |
| heartbeat | 10 | 10 | 238.1 | 39.4 | 40.0 | 40.0 | 0/10 | 47.0 | 159.2 |
| next-task | 50 | 50 | 34.8 | 1103.6 | 1371.0 | 1411.0 | 0/50 | 1047.0 | 164.5 |
| heartbeat | 50 | 50 | 310.6 | 113.2 | 156.0 | 156.0 | 0/50 | 281.0 | 168.4 |
| next-task | 100 | 100 | 44.1 | 1462.9 | 2159.0 | 2240.0 | 0/100 | 1594.0 | 226.0 |
| heartbeat | 100 | 100 | 290.7 | 225.7 | 335.0 | 336.0 | 0/100 | 500.0 | 232.5 |
| next-task | 200 | 200 | 44.7 | 2914.8 | 4299.0 | 4411.0 | 0/200 | 3016.0 | 250.6 |
| heartbeat | 200 | 200 | 317.5 | 409.0 | 618.0 | 627.0 | 0/200 | 749.0 | 251.1 |
| next-task | 500 | 500 | 42.6 | 6778.3 | 9969.0 | 9997.0 | 68/500 | 6313.0 | 264.9 |
| heartbeat | 500 | 500 | 301.9 | 936.7 | 1468.0 | 1515.0 | 35/500 | 1625.0 | 302.7 |
| next-task | 1000 | 1000 | 50.5 | 8943.9 | 13593.0 | 13608.0 | 303/1000 | 8547.0 | 379.2 |
| heartbeat | 1000 | 1000 | 258.3 | 669.9 | 882.0 | 892.0 | 767/1000 | 1156.0 | 409.2 |
| task-report | 1000 | 1000 | 227.9 | 1186.9 | 1950.0 | 2012.0 | 535/1000 | 2235.0 | 408.3 |
| duplicate-task-report | 1000 | 1000 | 228.9 | 653.8 | 988.0 | 1008.0 | 767/1000 | 1141.0 | 409.0 |
| bounded-get-config | 10 | 10 | 270.3 | 34.7 | 36.0 | 36.0 | 0/10 | 31.0 | 408.0 |
| bounded-get-account | 10 | 10 | 137.0 | 54.2 | 70.0 | 70.0 | 0/10 | 32.0 | 408.0 |
| bounded-dashboard | 10 | 10 | 35.3 | 275.5 | 280.0 | 280.0 | 0/10 | 313.0 | 409.5 |
| bounded-get-config | 50 | 50 | 333.3 | 137.2 | 148.0 | 148.0 | 0/50 | 140.0 | 410.1 |
| bounded-get-account | 50 | 50 | 163.4 | 262.6 | 298.0 | 302.0 | 0/50 | 156.0 | 410.2 |
| bounded-dashboard | 50 | 50 | 37.5 | 1292.7 | 1332.0 | 1334.0 | 0/50 | 1625.0 | 432.4 |
| bounded-get-config | 100 | 50 | 350.9 | 137.2 | 155.0 | 159.0 | 0/100 | 266.0 | 428.3 |
| bounded-get-account | 100 | 50 | 142.2 | 304.0 | 363.0 | 370.0 | 0/100 | 500.0 | 429.4 |
| bounded-dashboard | 100 | 50 | 39.3 | 1250.2 | 1296.0 | 1306.0 | 0/100 | 2922.0 | 462.8 |
| bounded-get-config | 200 | 50 | 396.0 | 123.3 | 151.0 | 157.0 | 0/200 | 547.0 | 462.5 |
| bounded-get-account | 200 | 50 | 179.2 | 264.4 | 332.0 | 340.0 | 0/200 | 891.0 | 468.4 |
| bounded-dashboard | 200 | 50 | 38.1 | 1302.3 | 1380.0 | 1406.0 | 0/200 | 6233.0 | 592.8 |
| bounded-get-config | 500 | 50 | 342.7 | 143.7 | 157.0 | 160.0 | 0/500 | 1517.0 | 599.2 |
| bounded-get-account | 500 | 50 | 199.8 | 241.0 | 309.0 | 330.0 | 0/500 | 2171.0 | 611.3 |
| bounded-dashboard | 500 | 50 | 38.2 | 1305.7 | 1384.0 | 1403.0 | 0/500 | 16000.0 | 673.4 |
| bounded-get-config | 1000 | 50 | 351.0 | 141.3 | 149.0 | 155.0 | 0/1000 | 2969.0 | 672.8 |
| bounded-get-account | 1000 | 50 | 192.6 | 252.8 | 302.0 | 338.0 | 0/1000 | 4516.0 | 674.5 |
| bounded-dashboard | 1000 | 50 | 39.2 | 1274.0 | 1311.0 | 1324.0 | 0/1000 | 31187.0 | 674.6 |

RPS attempt bao gồm lỗi; bảng dùng RPS thành công. P95/P99 tính trên request có latency ghi được; transport refused bị loại khỏi latency, vẫn tính error rate. Các lượt tăng dần reuse device và gồm resume; không phải toàn bộ claim mới.

Burst >=500 có ECONNREFUSED: FAIL yêu cầu không lỗi, root cause hạ tầng/client/server socket chưa tách riêng. Retry là phép kiểm tra consistency, không biến error rate thành 0. Bounded-get-* giới hạn 50 HTTP in-flight; mức clients là tổng virtual clients, không phải mức đồng thời. Cron chạy đồng thời ở get-config.

GET TASK/heartbeat/report burst và get-account/config/dashboard bounded đã đo tới 1000; đa user 100 users, sustained production throughput, CPU/RAM DB, Linux network backlog và soak 24/7 chưa đo. Không tự tăng pool/rate/timeout hoặc sửa Dispatcher để che kết quả. Cần staging Linux với Nginx, pacing/jitter giống AutoTouch và limiter thực tế để kết luận sức chứa VPS.
