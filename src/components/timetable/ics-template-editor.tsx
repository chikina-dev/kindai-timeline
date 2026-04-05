"use client";

import { useEffect, useMemo, useState } from "react";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  TextNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  type Spread,
} from "lexical";
import { Bold, Italic, Underline } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IcsTemplateVariable } from "@/lib/ics";

type IcsTemplateEditorProps = {
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
  variables: IcsTemplateVariable[];
};

type SerializedVariableNode = Spread<
  {
    type: "template-variable";
    variableName: IcsTemplateVariable;
    version: 1;
  },
  SerializedTextNode
>;

const editorTheme = {
  paragraph: "mb-1 last:mb-0",
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline underline-offset-2",
  },
};

class TemplateVariableNode extends TextNode {
  __variableName: IcsTemplateVariable;

  static getType() {
    return "template-variable";
  }

  static clone(node: TemplateVariableNode) {
    return new TemplateVariableNode(node.__variableName, node.__key);
  }

  static importJSON(serializedNode: SerializedVariableNode) {
    return $createTemplateVariableNode(serializedNode.variableName).updateFromJSON(
      serializedNode
    );
  }

  afterCloneFrom(node: this): void {
    super.afterCloneFrom(node);
    this.__variableName = node.__variableName;
  }

  constructor(variableName: IcsTemplateVariable, key?: NodeKey) {
    super(`{{ ${variableName} }}`, key);
    this.__variableName = variableName;
    this.__mode = 1;
  }

  createDOM(config: EditorConfig) {
    const element = super.createDOM(config);
    element.className = cn(
      element.className,
      "rounded-md bg-accent/70 px-1.5 py-0.5 font-mono text-[0.95em] text-accent-foreground"
    );
    return element;
  }

  exportJSON(): SerializedVariableNode {
    return {
      ...super.exportJSON(),
      type: "template-variable",
      variableName: this.__variableName,
      version: 1,
    };
  }

  isTextEntity() {
    return true;
  }

  canInsertTextAfter() {
    return false;
  }

  canInsertTextBefore() {
    return false;
  }
}

function $createTemplateVariableNode(variableName: IcsTemplateVariable) {
  return new TemplateVariableNode(variableName);
}

function $isTemplateVariableNode(
  node: LexicalNode | null | undefined
): node is TemplateVariableNode {
  return node instanceof TemplateVariableNode;
}

export function IcsTemplateEditor({
  onChange,
  placeholder = "{{ title }}",
  value,
  variables,
}: IcsTemplateEditorProps) {
  const initialConfig = useMemo(
    () => ({
      namespace: "IcsTemplateEditor",
      nodes: [TemplateVariableNode],
      onError(error: Error) {
        throw error;
      },
      theme: editorTheme,
      editorState() {
        const root = $getRoot();
        root.clear();

        const lines = value.split("\n");
        for (const line of lines) {
          const paragraph = $createParagraphNode();
          const parts = line.split(/({{\s*[a-zA-Z]+\s*}})/g);

          for (const part of parts) {
            if (!part) {
              continue;
            }

            const matchedVariable = part.match(/^{{\s*([a-zA-Z]+)\s*}}$/);
            if (matchedVariable && isTemplateVariable(matchedVariable[1])) {
              paragraph.append(
                $createTemplateVariableNode(
                  matchedVariable[1] as IcsTemplateVariable
                )
              );
              continue;
            }

            paragraph.append($createTextNode(part));
          }

          if (paragraph.getChildrenSize() === 0) {
            paragraph.append($createTextNode(""));
          }

          root.append(paragraph);
        }
      },
    }),
    [value]
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="rounded-lg border border-input bg-background">
        <TemplateToolbar variables={variables} />
        <RichTextPlugin
          contentEditable={
            <ContentEditable className="min-h-28 resize-y px-3 py-3 text-sm outline-none" />
          }
          placeholder={
            <div className="pointer-events-none absolute top-13 left-3 text-sm text-muted-foreground">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <AutoVariablePlugin />
        <OnChangePlugin
          onChange={(editorState) => {
            onChange(readTemplateFromEditor(editorState));
          }}
        />
      </div>
    </LexicalComposer>
  );
}

function TemplateToolbar({ variables }: { variables: IcsTemplateVariable[] }) {
  const [editor] = useLexicalComposerContext();
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
  });

  useEffect(() => {
    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            setFormats({ bold: false, italic: false, underline: false });
            return;
          }

          setFormats({
            bold: selection.hasFormat("bold"),
            italic: selection.hasFormat("italic"),
            underline: selection.hasFormat("underline"),
          });
        });

        return false;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [editor]);

  return (
    <div className="border-b border-border px-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <FormatButton
          active={formats.bold}
          icon={Bold}
          label="太字"
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
        />
        <FormatButton
          active={formats.italic}
          icon={Italic}
          label="斜体"
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
        />
        <FormatButton
          active={formats.underline}
          icon={Underline}
          label="下線"
          onClick={() =>
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
          }
        />
        <span className="mx-1 h-6 w-px bg-border" />
        <div className="flex flex-wrap gap-1.5">
          {variables.map((variable) => (
            <button
              key={variable}
              type="button"
              onClick={() => insertVariable(editor, variable)}
            >
              <Badge variant="secondary" className="font-mono hover:bg-accent">
                {`{{ ${variable} }}`}
              </Badge>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FormatButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Bold;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function insertVariable(editor: LexicalEditor, variable: IcsTemplateVariable) {
  editor.focus();
  editor.update(() => {
    const selection = $getSelection();
    const nodes = [$createTemplateVariableNode(variable), $createTextNode(" ")];

    if ($isRangeSelection(selection)) {
      selection.insertNodes(nodes);
      return;
    }

    const root = $getRoot();
    const paragraph = root.getLastChild();
    if ($isElementNode(paragraph)) {
      paragraph.append(...nodes);
      return;
    }

    const nextParagraph = $createParagraphNode();
    nextParagraph.append(...nodes);
    root.append(nextParagraph);
  });
}

function AutoVariablePlugin() {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerNodeTransform(TextNode, (textNode) => {
      if ($isTemplateVariableNode(textNode)) {
        return;
      }

      const text = textNode.getTextContent();
      if (!text.includes("{{")) {
        return;
      }

      const parts = splitTemplateText(text);
      if (parts.length === 1 && parts[0]?.type === "text") {
        return;
      }

      const format = textNode.getFormat();
      const style = textNode.getStyle();
      const detail = textNode.getDetail();
      const nodes = parts.map((part) => {
        if (part.type === "variable") {
          return $createTemplateVariableNode(part.value)
            .setFormat(format)
            .setStyle(style)
            .setDetail(detail);
        }

        return $createTextNode(part.value)
          .setFormat(format)
          .setStyle(style)
          .setDetail(detail);
      });

      const [firstNode, ...remainingNodes] = nodes;
      if (!firstNode) {
        return;
      }

      textNode.replace(firstNode);
      let currentNode = firstNode;
      for (const node of remainingNodes) {
        currentNode.insertAfter(node);
        currentNode = node;
      }
    });
  }, [editor]);

  return null;
}

function readTemplateFromEditor(editorState: Parameters<
  NonNullable<React.ComponentProps<typeof OnChangePlugin>["onChange"]>
>[0]) {
  return editorState.read(() => {
    const root = $getRoot();
    return root
      .getChildren()
      .map((child) => readNodeText(child))
      .join("\n");
  });
}

function readNodeText(node: LexicalNode): string {
  if ($isTextNode(node) || $isTemplateVariableNode(node)) {
    return node.getTextContent();
  }

  if ($isLineBreakNode(node)) {
    return "\n";
  }

  if ($isElementNode(node) || $isRootOrShadowRoot(node)) {
    return node.getChildren().map((child) => readNodeText(child)).join("");
  }

  return "";
}

function isTemplateVariable(value: string): value is IcsTemplateVariable {
  return [
    "academicYear",
    "category",
    "className",
    "classroom",
    "credits",
    "day",
    "department",
    "features",
    "instructors",
    "note",
    "period",
    "semester",
    "title",
  ].includes(value);
}

function splitTemplateText(text: string) {
  return text
    .split(/({{\s*[a-zA-Z]+\s*}})/g)
    .filter(Boolean)
    .map((part) => {
      const matchedVariable = part.match(/^{{\s*([a-zA-Z]+)\s*}}$/);
      if (matchedVariable && isTemplateVariable(matchedVariable[1])) {
        return {
          type: "variable" as const,
          value: matchedVariable[1] as IcsTemplateVariable,
        };
      }

      return {
        type: "text" as const,
        value: part,
      };
    });
}