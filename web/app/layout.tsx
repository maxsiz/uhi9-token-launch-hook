import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ui/ConnectButton";
import { NetworkSelector } from "@/components/ui/NetworkSelector";
import Link from "next/link";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "TokenLaunchHook — Fair Launch Studio",
  description:
    "Launch a fair-launch token campaign in one transaction and watch exactly which Uniswap v4 hook callbacks enforce it. A live demo for TokenLaunchHook.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "TokenLaunchHook — Fair Launch Studio",
    description: "One-transaction fair-launch on Uniswap v4, with a live view of the hook in action.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header className="border-b border-neutral-800">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <Link href="/" className="font-semibold">
                🪝 TokenLaunchHook <span className="text-neutral-500">Studio</span>
              </Link>
              <nav className="flex items-center gap-4 text-sm">
                <Link href="/launch" className="text-neutral-300 hover:text-white">
                  Launch
                </Link>
                <Link href="/governance" className="text-neutral-300 hover:text-white">
                  Governance
                </Link>
                <NetworkSelector />
                <ConnectButton />
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
