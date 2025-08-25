import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/AuthContext";
import Header from "./components/Header";
import Footer from "./components/Footer";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "YVD NAILS - Premium Nail Artistry",
  description: "Your destination for premium nail services.",
};



export default function RootLayout({

  children,

}: Readonly<{

  children: React.ReactNode;

}>) {

  return (

    <html lang="en">

      {/* These CSS classes help keep the footer at the bottom of the page */}

      <body className={`${inter.className} flex flex-col min-h-screen`}>

        <AuthProvider>

          <Header />

          <main className="flex-grow">

            {children}

          </main>

          <Footer />

        </AuthProvider>

      </body>

    </html>

  );

}