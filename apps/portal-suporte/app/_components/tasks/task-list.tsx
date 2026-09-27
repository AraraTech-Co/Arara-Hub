"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from "next/link";
import { formatDateShort } from "@/lib/utils";
import { tasksApi } from "@/lib/api/tasks";
import type { TaskStatus } from "@/lib/api/tasks";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  created_at: string;
  ticket: {
    id: string;
    title: string;
  } | null;
  created_by: {
    id: string;
    full_name: string | null;
    email: string;
  };
  assigned_to: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

interface Agent {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

interface TaskListProps {
  tasks: Task[];
  agents: Agent[];
}

const statusColors = {
  todo: "bg-muted text-foreground/80 border-border",
  in_progress: "bg-sem-info text-sem-info-fg border-sem-info-bd",
  done: "bg-sem-success text-sem-success-fg border-sem-success-bd",
};

const priorityColors = {
  low: "bg-muted text-foreground/80 border-border",
  medium: "bg-sem-info text-sem-info-fg border-sem-info-bd",
  high: "bg-status-waiting text-status-waiting-fg border-status-waiting-bd",
};

const statusLabels = {
  todo: "A Fazer",
  in_progress: "Em Andamento",
  done: "Concluída",
};

const priorityLabels = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
};

export function TaskList({ tasks, agents }: TaskListProps) {
  const router = useRouter();

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    await tasksApi.changeStatus(taskId, newStatus as TaskStatus);
    router.refresh();
  };

  const handleAssignAgent = async (taskId: string, agentId: string) => {
    if (agentId === 'unassigned') {
      await tasksApi.update(taskId, { assigned_to: null });
    } else {
      await tasksApi.assign(taskId, agentId);
    }
    router.refresh();
  };

  const handleToggleComplete = async (taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === "done" ? "todo" : "done";
    await handleStatusChange(taskId, newStatus);
  };

  if (!tasks || tasks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Tarefas</CardTitle>
          <CardDescription>Nenhuma tarefa criada ainda</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Crie sua primeira tarefa para começar
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group tasks by status
  const tasksByStatus = {
    todo: tasks.filter(t => t.status === "todo"),
    in_progress: tasks.filter(t => t.status === "in_progress"),
    done: tasks.filter(t => t.status === "done"),
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {Object.entries(tasksByStatus).map(([status, statusTasks]) => (
        <Card key={status}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={statusColors[status as keyof typeof statusColors]}
              >
                {statusLabels[status as keyof typeof statusLabels]}
              </Badge>
              <span className="text-sm font-normal text-muted-foreground">
                ({statusTasks.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {statusTasks.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">
                Nenhuma tarefa
              </p>
            ) : (
              statusTasks.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg bg-card p-4 space-y-3 transition-shadow hover:shadow-[var(--shadow-alta)] shadow-[var(--shadow-media)]"
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={task.status === "done"}
                      onCheckedChange={() => handleToggleComplete(task.id, task.status)}
                      className="mt-1"
                    />
                    <div className="flex-1 space-y-2">
                      <div>
                        <h3 className={`font-semibold text-sm ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="mt-1 text-xs text-foreground/60 line-clamp-2">
                            {task.description}
                          </p>
                        )}
                      </div>

                      {task.ticket && (
                        <Link
                          href={`/admin/tickets/view/?id=${encodeURIComponent(task.ticket.id)}`}
                          className="inline-block text-xs text-primary hover:underline"
                        >
                          Ticket: {task.ticket.title}
                        </Link>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={priorityColors[task.priority as keyof typeof priorityColors]}
                        >
                          {priorityLabels[task.priority as keyof typeof priorityLabels]}
                        </Badge>

                        {task.due_date && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatDateShort(task.due_date)}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Select
                          value={task.status}
                          onValueChange={(value) => handleStatusChange(task.id, value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todo">A Fazer</SelectItem>
                            <SelectItem value="in_progress">Em Andamento</SelectItem>
                            <SelectItem value="done">Concluída</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={task.assigned_to?.id || "unassigned"}
                          onValueChange={(value) => handleAssignAgent(task.id, value)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue>
                              {task.assigned_to?.full_name || "Não atribuído"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">Não atribuído</SelectItem>
                            {agents.map((agent) => (
                              <SelectItem key={agent.id} value={agent.id}>
                                {agent.full_name || agent.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
