import type { Metadata } from "next";
import { RegistrarServiceWorker } from "@/_components/pwa/registrar-sw";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Providers } from "@/components/providers/arara-providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Suporte Arara Tech — chamados do SGC",
  description: "Portal de suporte da Arara Tech: abra e acompanhe chamados do SGC, do PDV e do servidor da sua loja.",
  // PWA (Fase 4). O `apple-touch-icon` é o que o Safari usa quando a pessoa
  // adiciona à tela de início — e no iOS a PWA instalada é a ÚNICA forma de
  // receber Web Push.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Suporte", statusBarStyle: "default" },
  icons: { apple: "/apple-icon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Providers>
            {children}
            <Toaster />
            <RegistrarServiceWorker />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
