import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UniOS — Нархоз",
    short_name: "UniOS",
    description: "Расписание, дедлайны и объявления Нархоза — в одном месте",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#C41233",
    theme_color: "#C41233",
    lang: "ru",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Дедлайны", url: "/deadlines" },
      { name: "Расписание", url: "/schedule" },
    ],
  };
}
