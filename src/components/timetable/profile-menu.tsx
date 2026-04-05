"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import type { Session } from "next-auth";
import { Monitor, LogOut, Moon, Settings2, Sun } from "lucide-react";
import { UserCoursePreferencesDialog } from "@/components/timetable/user-course-preferences-dialog";
import { useSharedCourseFilters } from "@/components/timetable/course-filter-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatResolvedUserCourseProfile } from "@/lib/user-course-preferences";
import { cn } from "@/lib/utils";

type ProfileMenuProps = {
  session: Session;
  buttonClassName?: string;
};

export function ProfileMenu({ session, buttonClassName }: ProfileMenuProps) {
  const { theme, setTheme } = useTheme();
  const [isPreferencesDialogOpen, setIsPreferencesDialogOpen] = useState(false);
  const { resolvedUserCourseProfile } = useSharedCourseFilters();
  const profileSummary = formatResolvedUserCourseProfile(resolvedUserCourseProfile);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn("relative h-10 w-10 shrink-0 rounded-full", buttonClassName)}
          >
            <Avatar className="h-10 w-10">
              <AvatarImage src={session.user?.image || ""} alt={session.user?.name || ""} />
              <AvatarFallback>{session.user?.name?.charAt(0) || "U"}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72" align="end">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{session.user?.name}</p>
              <p className="text-xs text-muted-foreground">{session.user?.email}</p>
              <p className="text-xs text-muted-foreground">
                既定フィルター: {profileSummary}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setIsPreferencesDialogOpen(true);
            }}
          >
            <Settings2 className="mr-2 h-4 w-4" />
            ユーザー設定
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
            表示テーマ
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme ?? "dark"} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">
              <Sun className="mr-2 h-4 w-4" />
              ライト
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="mr-2 h-4 w-4" />
              ダーク
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              <Monitor className="mr-2 h-4 w-4" />
              システム
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOut className="mr-2 h-4 w-4" />
            ログアウト
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserCoursePreferencesDialog
        open={isPreferencesDialogOpen}
        onOpenChange={setIsPreferencesDialogOpen}
      />
    </>
  );
}