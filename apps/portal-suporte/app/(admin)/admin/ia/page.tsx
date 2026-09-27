'use client'

import { Brain, Bot, BookOpen, Sliders, GitBranch, Activity, Play, BarChart3, ClipboardCheck } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgentsTab }          from '@/components/admin/ai/AgentsTab'
import { SkillsTab }          from '@/components/admin/ai/SkillsTab'
import { PlaybooksTab }       from '@/components/admin/ai/PlaybooksTab'
import { RoutingTab }         from '@/components/admin/ai/RoutingTab'
import { LogsTab }            from '@/components/admin/ai/LogsTab'
import { SimulatorTab }       from '@/components/admin/ai/SimulatorTab'
import { LearningDashboard }  from '@/components/admin/ai/LearningDashboard'
import { CurationPanel }      from '@/components/admin/ai/CurationPanel'

export default function IAPage() {
  return (
    <div className="pt-14 lg:pt-0">
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 shadow-md">
            <Brain className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Inteligência Artificial</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Sistema multi-agente com roteamento inteligente via OpenAI</p>
          </div>
        </div>

        <Tabs defaultValue="simulator">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="simulator"> <Play          className="mr-1.5 h-4 w-4" />Simulador</TabsTrigger>
            <TabsTrigger value="agents">    <Bot           className="mr-1.5 h-4 w-4" />Agentes</TabsTrigger>
            <TabsTrigger value="skills">    <Sliders       className="mr-1.5 h-4 w-4" />Skills</TabsTrigger>
            <TabsTrigger value="playbooks"> <BookOpen      className="mr-1.5 h-4 w-4" />Playbooks</TabsTrigger>
            <TabsTrigger value="routing">   <GitBranch     className="mr-1.5 h-4 w-4" />Roteamento</TabsTrigger>
            <TabsTrigger value="logs">      <Activity      className="mr-1.5 h-4 w-4" />Logs</TabsTrigger>
            <TabsTrigger value="learning">  <BarChart3     className="mr-1.5 h-4 w-4" />Aprendizado</TabsTrigger>
            <TabsTrigger value="curation">  <ClipboardCheck className="mr-1.5 h-4 w-4" />Curadoria</TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="simulator"> <SimulatorTab />      </TabsContent>
            <TabsContent value="agents">    <AgentsTab />         </TabsContent>
            <TabsContent value="skills">    <SkillsTab />         </TabsContent>
            <TabsContent value="playbooks"> <PlaybooksTab />      </TabsContent>
            <TabsContent value="routing">   <RoutingTab />        </TabsContent>
            <TabsContent value="logs">      <LogsTab />           </TabsContent>
            <TabsContent value="learning">  <LearningDashboard /> </TabsContent>
            <TabsContent value="curation">  <CurationPanel />     </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}
