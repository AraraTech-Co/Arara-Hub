import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle } from 'lucide-react';
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SignUpSuccessPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sem-success">
              <CheckCircle className="h-10 w-10 text-sem-success-fg" />
            </div>
            <CardTitle className="text-2xl">Conta criada com sucesso!</CardTitle>
            <CardDescription>
              Sua conta está pronta para uso
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="mb-6 text-sm text-muted-foreground">
              Bem-vindo ao Portal de Suporte. Faça login para acessar seu painel e gerenciar seus tickets.
            </p>
            <Button asChild className="w-full">
              <Link href="/auth/login">
                Fazer login
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
