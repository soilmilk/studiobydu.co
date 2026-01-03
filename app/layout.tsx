import "./globals.css";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import { ThemeProvider } from "next-themes";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Anthony Du",
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
    other: [
      { rel: "mask-icon", href: "/safari-pinned-tab.svg", color: "#111111" },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <div className="flex min-h-screen flex-col">
            <Nav />

            {/* Main content grows to fill space */}
            <main className="flex-1">{children}</main>

            {/* Footer sticks to bottom */}
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
