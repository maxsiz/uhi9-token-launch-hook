import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ConnectButton } from "@/components/ui/ConnectButton";
import { NetworkSelector } from "@/components/ui/NetworkSelector";
import { Logo } from "@/components/ui/Logo";
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
          <div className="flex min-h-screen flex-col">
            <header className="border-b border-neutral-800">
              <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
                <Link href="/" className="flex items-center gap-2 font-semibold">
                  <Logo className="h-7 w-7" />
                  <span>
                    TokenLaunchHook <span className="text-neutral-500">Studio</span>
                  </span>
                  <span className="text-xs font-normal text-neutral-600">v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0"}</span>
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
            <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
            <footer className="border-t border-neutral-800">
              <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 text-xs text-neutral-500">
                <span>
                  TokenLaunchHook Studio — a Uniswap v4 fair-launch hook demo · v{process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0"}
                </span>
                <a
                  href="https://github.com/maxsiz/uhi9-token-launch-hook"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-white"
                >
                  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
                  </svg>
                  GitHub
                </a>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
