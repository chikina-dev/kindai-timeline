"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Search, X } from "lucide-react";

type CourseFilterControlsProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  selectedGrades: number[];
  onSelectedGradesChange: (values: number[]) => void;
  gradeOptions: number[];
  selectedClasses: string[];
  onSelectedClassesChange: (values: string[]) => void;
  classOptions: string[];
  onClearFilters: () => void;
};

type MultiSelectFilterProps<T extends string | number> = {
  label: string;
  values: T[];
  selectedValues: T[];
  onChange: (values: T[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  renderValue?: (value: T) => string;
};

function toggleValue<T extends string | number>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((currentValue) => currentValue !== value)
    : [...values, value];
}

function MultiSelectFilter<T extends string | number>({
  label,
  values,
  selectedValues,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  renderValue = (value) => String(value),
}: MultiSelectFilterProps<T>) {
  const [open, setOpen] = useState(false);

  const summary =
    selectedValues.length === 0
      ? placeholder
      : selectedValues.length === 1
      ? renderValue(selectedValues[0])
      : `${selectedValues.length}件選択`;

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-65 p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyLabel}</CommandEmpty>
              <CommandGroup>
                {values.map((value) => {
                  const selected = selectedValues.includes(value);

                  return (
                    <CommandItem
                      key={String(value)}
                      value={renderValue(value)}
                      onSelect={() => onChange(toggleValue(selectedValues, value))}
                    >
                      <Check
                        className={cn(
                          "size-4",
                          selected ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {renderValue(value)}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function CourseFilterControls({
  searchTerm,
  onSearchTermChange,
  selectedGrades,
  onSelectedGradesChange,
  gradeOptions,
  selectedClasses,
  onSelectedClassesChange,
  classOptions,
  onClearFilters,
}: CourseFilterControlsProps) {
  const hasActiveFilters =
    searchTerm.length > 0 ||
    selectedGrades.length > 0 ||
    selectedClasses.length > 0;

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-secondary/20 p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="科目名で検索"
          className="pl-9"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MultiSelectFilter
          label="学年"
          values={gradeOptions}
          selectedValues={selectedGrades}
          onChange={onSelectedGradesChange}
          placeholder="すべての学年"
          searchPlaceholder="学年を検索"
          emptyLabel="学年がありません"
          renderValue={(value) => `${value}年`}
        />
        <MultiSelectFilter
          label="コース"
          values={classOptions}
          selectedValues={selectedClasses}
          onChange={onSelectedClassesChange}
          placeholder="すべてのコース"
          searchPlaceholder="コースを検索"
          emptyLabel="コースがありません"
        />
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {selectedGrades.map((grade) => (
            <Badge key={grade} variant="secondary" className="gap-1 pr-1">
              {grade}年
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-black/10"
                onClick={() =>
                  onSelectedGradesChange(
                    selectedGrades.filter((selectedGrade) => selectedGrade !== grade)
                  )
                }
                aria-label={`${grade}年のフィルターを解除`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {selectedClasses.map((className) => (
            <Badge key={className} variant="secondary" className="gap-1 pr-1">
              {className}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-black/10"
                onClick={() =>
                  onSelectedClassesChange(
                    selectedClasses.filter((selectedClass) => selectedClass !== className)
                  )
                }
                aria-label={`${className}のフィルターを解除`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="h-7 px-2 text-xs"
          >
            クリア
          </Button>
        </div>
      )}
    </div>
  );
}