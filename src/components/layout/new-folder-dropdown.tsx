"use client"

import { useState } from "react"
import { FolderGit2, FolderOpenDot, FolderPlus } from "lucide-react"
import { useTranslations } from "next-intl"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { CloneDialog } from "@/components/layout/clone-dialog"
import { WorkspaceFolderDialog } from "@/components/layout/workspace-folder-dialog"

export function NewFolderDropdown() {
  const t = useTranslations("Folder.folderNameDropdown")
  const [cloneOpen, setCloneOpen] = useState(false)
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:text-foreground/80"
            title={t("openFolder")}
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-56" align="start">
          <DropdownMenuItem onSelect={() => setWorkspaceDialogOpen(true)}>
            <FolderOpenDot className="h-3.5 w-3.5 shrink-0" />
            {t("openFolder")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCloneOpen(true)}>
            <FolderGit2 className="h-3.5 w-3.5 shrink-0" />
            {t("cloneRepository")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} />
      <WorkspaceFolderDialog
        open={workspaceDialogOpen}
        onOpenChange={setWorkspaceDialogOpen}
      />
    </>
  )
}
