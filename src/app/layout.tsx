import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/toast";

export const metadata: Metadata = {
  title: {
    default: "4.4.FORTY Digital Bible",
    template: "%s · 4.4.FORTY Digital Bible",
  },
  description:
    "Creator and entertainment intelligence system for 4.4.Forty Media.",
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
