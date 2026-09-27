import { PublicTicketForm } from "@/components/public/public-ticket-form";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import Link from "next/link";

export default function CreatePublicTicketPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="glass border-b sticky top-0 z-10">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <span className="text-lg font-bold">SP</span>
            </div>
            <span className="text-xl font-bold text-foreground">Portal de Suporte</span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle iconOnly />
            <Button asChild variant="ghost">
              <Link href="/auth/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link href="/auth/sign-up">Cadastrar</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 text-center">
          <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Abrir Ticket de Suporte
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
            Preencha o formulário abaixo para criar um ticket de suporte. Nossa equipe entrará em contato em breve.
          </p>
        </div>

        <PublicTicketForm />
      </main>
    </div>
  );
}
