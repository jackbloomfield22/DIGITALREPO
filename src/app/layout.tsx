import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: {
    default: "4.4.FORTY Repo",
    template: "%s · 4.4.FORTY Repo",
  },
  description:
    "The 4.4.Forty Repo — one-stop information repository for 4.4.Forty Media: talent, projects, companies, formats, and opportunities.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
