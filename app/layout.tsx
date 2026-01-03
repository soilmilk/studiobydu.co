import "./globals.css";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "Du's Studio",
  description: "Stanford CS Undergrad",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-950">
        <div className="flex min-h-screen flex-col">
          <Nav />

          {/* Main content grows to fill space */}
          <main className="flex-1">{children}</main>

          {/* Footer sticks to bottom */}
          <Footer />
        </div>
      </body>
    </html>
  );
}
