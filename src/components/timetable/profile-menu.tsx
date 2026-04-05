"use client";

import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import type { Session } from "next-auth";
import { Monitor, LogOut, Moon, Sun } from "lucide-react";
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
import { cn } from "@/lib/utils";

type ProfileMenuProps = {
  session: Session;
  buttonClassName?: string;
};

export function ProfileMenu({ session, buttonClassName }: ProfileMenuProps) {
  const { theme, setTheme } = useTheme();

  return (
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
      <DropdownMenuContent className="w-60" align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{session.user?.name}</p>
            <p className="text-xs text-muted-foreground">{session.user?.email}</p>
          </div>
        </DropdownMenuLabel>
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
  );
}