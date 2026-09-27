'use client'

import { useState, useEffect } from 'react'
import { adminSettingsApi } from '@/lib/api/admin'
import { LoadingBlock } from '@/components/ui/loading-block'
import { AdminHeader } from '@/components/admin/admin-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { Building2, Mail, Globe, Bell, Shield, Palette, Save, Upload, Loader2 } from 'lucide-react'

export default function SettingsPage() {
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const { toast } = useToast()

  // Configurações Gerais
  const [companyName, setCompanyName] = useState('Portal de Suporte')
  const [companyEmail, setCompanyEmail] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [supportEmail, setSupportEmail] = useState('')

  // Notificações
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [smsNotifications, setSmsNotifications] = useState(false)
  const [whatsappNotifications, setWhatsappNotifications] = useState(true)
  const [discordNotifications, setDiscordNotifications] = useState(true)

  // Segurança
  const [twoFactorAuth, setTwoFactorAuth] = useState(false)
  const [sessionTimeout, setSessionTimeout] = useState('30')
  const [ipWhitelist, setIpWhitelist] = useState('')

  // Aparência
  const [logoUrl, setLogoUrl] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#7c3aed')
  const [accentColor, setAccentColor] = useState('#ec4899')

  useEffect(() => {
    adminSettingsApi.get()
      .then(({ data: d }) => {
        setCompanyName(d.companyName ?? 'Portal de Suporte')
        setCompanyEmail(d.companyEmail ?? '')
        setCompanyPhone(d.companyPhone ?? '')
        setCompanyWebsite(d.companyWebsite ?? '')
        setSupportEmail(d.supportEmail ?? '')
        setEmailNotifications(d.emailNotifications ?? true)
        setSmsNotifications(d.smsNotifications ?? false)
        setWhatsappNotifications(d.whatsappNotifications ?? true)
        setDiscordNotifications(d.discordNotifications ?? true)
        setTwoFactorAuth(d.twoFactorAuth ?? false)
        setSessionTimeout(String(d.sessionTimeout ?? 30))
        setIpWhitelist(d.ipWhitelist ?? '')
        setLogoUrl(d.logoUrl ?? '')
        setPrimaryColor(d.primaryColor ?? '#7c3aed')
        setAccentColor(d.accentColor ?? '#ec4899')
      })
      .catch(() => {/* mantém defaults */})
      .finally(() => setInitializing(false))
  }, [])

  const handleSave = async (section: string, data: Record<string, unknown>) => {
    setLoading(true)
    try {
      await adminSettingsApi.update(data as Parameters<typeof adminSettingsApi.update>[0])
      toast({ title: 'Configurações salvas', description: `${section} atualizado com sucesso` })
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível salvar as configurações', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (initializing) {
    return (
      <div className="pt-14 lg:pt-0 flex items-center justify-center min-h-[400px]">
        <LoadingBlock size="lg" className="py-0" />
      </div>
    )
  }

  return (
    <div className="pt-14 lg:pt-0">
      <div className="container mx-auto p-6 pt-6 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Configurações do Portal</h1>
          <p className="text-foreground/60 mt-1">
            Gerencie as configurações gerais, notificações, segurança e aparência do sistema
          </p>
        </div>

        <Tabs defaultValue="general" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="general" className="gap-2">
              <Building2 className="h-4 w-4" />
              Geral
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Notificações
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-2">
              <Shield className="h-4 w-4" />
              Segurança
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-2">
              <Palette className="h-4 w-4" />
              Aparência
            </TabsTrigger>
          </TabsList>

          {/* Configurações Gerais */}
          <TabsContent value="general" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Informações da Empresa
                </CardTitle>
                <CardDescription>
                  Configure as informações básicas da sua empresa
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Nome da Empresa</Label>
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Digite o nome da empresa"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">E-mail Corporativo</Label>
                    <Input
                      id="companyEmail"
                      type="email"
                      value={companyEmail}
                      onChange={(e) => setCompanyEmail(e.target.value)}
                      placeholder="contato@empresa.com.br"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">Telefone</Label>
                    <Input
                      id="companyPhone"
                      value={companyPhone}
                      onChange={(e) => setCompanyPhone(e.target.value)}
                      placeholder="+55 11 9999-9999"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyWebsite">Website</Label>
                    <Input
                      id="companyWebsite"
                      type="url"
                      value={companyWebsite}
                      onChange={(e) => setCompanyWebsite(e.target.value)}
                      placeholder="https://empresa.com.br"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="supportEmail">E-mail de Suporte</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={supportEmail}
                    onChange={(e) => setSupportEmail(e.target.value)}
                    placeholder="suporte@empresa.com.br"
                  />
                  <p className="text-xs text-muted-foreground">
                    Este e-mail será usado para receber tickets criados via formulário público
                  </p>
                </div>

                <Button
                  onClick={() => handleSave('Geral', { companyName, companyEmail, companyPhone, companyWebsite, supportEmail })}
                  disabled={loading}
                  className="gap-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar Alterações
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notificações */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Canais de Notificação
                </CardTitle>
                <CardDescription>
                  Configure como você deseja receber notificações sobre tickets e atividades
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-sem-info text-sem-info-fg rounded-lg">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div>
                        <Label htmlFor="email-notif" className="text-base font-medium">
                          Notificações por E-mail
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Receba atualizações de tickets por e-mail
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="email-notif"
                      checked={emailNotifications}
                      onCheckedChange={setEmailNotifications}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-sem-success text-sem-success-fg rounded-lg">
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                      </div>
                      <div>
                        <Label htmlFor="whatsapp-notif" className="text-base font-medium">
                          Notificações por WhatsApp
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Enviar alertas para grupos do WhatsApp
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="whatsapp-notif"
                      checked={whatsappNotifications}
                      onCheckedChange={setWhatsappNotifications}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-status-migration text-status-migration-fg rounded-lg">
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z"/>
                        </svg>
                      </div>
                      <div>
                        <Label htmlFor="discord-notif" className="text-base font-medium">
                          Notificações por Discord
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Alertas em canal do Discord da equipe
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="discord-notif"
                      checked={discordNotifications}
                      onCheckedChange={setDiscordNotifications}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg opacity-50">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-status-waiting text-status-waiting-fg rounded-lg">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div>
                        <Label htmlFor="sms-notif" className="text-base font-medium">
                          Notificações por SMS
                        </Label>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-muted-foreground">
                            Alertas críticos via SMS
                          </p>
                          <Badge variant="secondary" className="text-xs">Em breve</Badge>
                        </div>
                      </div>
                    </div>
                    <Switch
                      id="sms-notif"
                      checked={smsNotifications}
                      onCheckedChange={setSmsNotifications}
                      disabled
                    />
                  </div>
                </div>

                <Button
                  onClick={() => handleSave('Notificações', { emailNotifications, whatsappNotifications, discordNotifications, smsNotifications })}
                  disabled={loading}
                  className="gap-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar Preferências
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Segurança */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Configurações de Segurança
                </CardTitle>
                <CardDescription>
                  Proteja seu portal com autenticação de dois fatores e controles de acesso
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="2fa" className="text-base font-medium">
                      Autenticação de Dois Fatores (2FA)
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Adicione uma camada extra de segurança exigindo código de verificação
                    </p>
                  </div>
                  <Switch
                    id="2fa"
                    checked={twoFactorAuth}
                    onCheckedChange={setTwoFactorAuth}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="session-timeout">Tempo de Sessão (minutos)</Label>
                  <Input
                    id="session-timeout"
                    type="number"
                    value={sessionTimeout}
                    onChange={(e) => setSessionTimeout(e.target.value)}
                    placeholder="30"
                  />
                  <p className="text-xs text-muted-foreground">
                    Tempo de inatividade antes da sessão expirar automaticamente
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ip-whitelist">Lista de IPs Permitidos (Whitelist)</Label>
                  <Textarea
                    id="ip-whitelist"
                    value={ipWhitelist}
                    onChange={(e) => setIpWhitelist(e.target.value)}
                    placeholder="192.168.1.1&#10;10.0.0.0/24"
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Digite um IP por linha. Deixe vazio para permitir todos os IPs
                  </p>
                </div>

                <Button
                  onClick={() => handleSave('Segurança', { twoFactorAuth, sessionTimeout: parseInt(sessionTimeout) || 30, ipWhitelist })}
                  disabled={loading}
                  className="gap-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar Configurações
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Aparência */}
          <TabsContent value="appearance" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Palette className="h-5 w-5" />
                  Personalização Visual
                </CardTitle>
                <CardDescription>
                  Customize a aparência do portal com sua marca
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="logo">Logo da Empresa</Label>
                  <div className="flex items-center gap-4">
                    <div className="h-20 w-20 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50">
                      {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt="Logo" className="max-h-full max-w-full object-contain" />
                      ) : (
                        <Upload className="h-8 w-8 text-muted-foreground/70" />
                      )}
                    </div>
                    <div className="flex-1">
                      <Input
                        id="logo"
                        type="url"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://exemplo.com/logo.png"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        URL da imagem do logo (recomendado: 200x200px, PNG ou SVG)
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="primary-color">Cor Primária</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="primary-color"
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-20 h-10"
                      />
                      <Input
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        placeholder="#7c3aed"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accent-color">Cor de Destaque</Label>
                    <div className="flex items-center gap-3">
                      <Input
                        id="accent-color"
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-20 h-10"
                      />
                      <Input
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        placeholder="#ec4899"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg bg-muted/50">
                  <Label className="text-sm font-medium mb-3 block">Preview</Label>
                  <div className="flex gap-2">
                    <Button style={{ backgroundColor: primaryColor }}>
                      Botão Primário
                    </Button>
                    <Button variant="outline" style={{ borderColor: accentColor, color: accentColor }}>
                      Botão Destaque
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={() => handleSave('Aparência', { logoUrl, primaryColor, accentColor })}
                  disabled={loading}
                  className="gap-2"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar Personalização
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
