import { CronJob } from "cron";
import https from "https";
import http from "http";

/**
 * 14분마다 서버 자신에게 health check 요청을 보내
 * Render.com 무료 인스턴스의 비활성화(Sleep)를 방지하는 Cron Job
 */
export const initKeepAliveCron = (port = process.env.PORT || 3000) => {
  // 로컬 개발 환경(development)에서는 cron 작업을 실행하지 않음
  if (process.env.NODE_ENV !== "production") {
    console.log("[Keep-Alive Cron] Skipped in local/development environment.");
    return;
  }

  // Render.com 자동 환경변수 RENDER_EXTERNAL_URL 또는 사용자 정의 SERVER_URL 우선 사용
  const serverUrl =
    process.env.SERVER_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${port}`;

  const healthUrl = `${serverUrl.replace(/\/$/, "")}/health`;

  // 14분마다 실행: '*/14 * * * *'
  const job = new CronJob("*/14 * * * *", () => {
    console.log(
      `[Keep-Alive Cron] Sending ping to: ${healthUrl} at ${new Date().toISOString()}`,
    );

    const client = healthUrl.startsWith("https") ? https : http;

    client
      .get(healthUrl, (res) => {
        if (res.statusCode === 200) {
          console.log(
            `[Keep-Alive Cron] Ping successful (Status: ${res.statusCode})`,
          );
        } else {
          console.warn(
            `[Keep-Alive Cron] Ping responded with status: ${res.statusCode}`,
          );
        }
      })
      .on("error", (err) => {
        console.error(`[Keep-Alive Cron] Ping failed:`, err.message);
      });
  });

  job.start();
  console.log(
    `[Keep-Alive Cron] Initialized. Pinging ${healthUrl} every 14 minutes.`,
  );
};
