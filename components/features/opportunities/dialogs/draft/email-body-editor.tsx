"use client";

import { useEffect, useState } from "react";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { FIELD_TEXTAREA_CLASSNAME } from "@/components/ui/styles/field-chrome";
import { normalizeHexColor } from "@/lib/opportunities/dispatch/email-body-colors";
import {
  plainToEmailHtml,
  sanitizeEmailHtml,
} from "@/lib/opportunities/dispatch/email-body-html";
import { cn } from "@/lib/utils";

type AlignValue = "left" | "center" | "right";

function readAlign(editor: Editor): AlignValue {
  if (editor.isActive({ textAlign: "center" })) return "center";
  if (editor.isActive({ textAlign: "right" })) return "right";
  return "left";
}

function readTextColor(editor: Editor): string | null {
  const raw = editor.getAttributes("textStyle").color;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return normalizeHexColor(raw);
}

function readHighlightColor(editor: Editor): string | null {
  const raw = editor.getAttributes("highlight").color;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return normalizeHexColor(raw);
}

function looksLikeMarkup(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export type EmailBodyEditorState = {
  editor: Editor | null;
  canUndo: boolean;
  canRedo: boolean;
  boldActive: boolean;
  italicActive: boolean;
  underlineActive: boolean;
  textColor: string | null;
  highlightColor: string | null;
  alignValue: AlignValue;
};

/**
 * TipTap instance for the opportunity email body.
 * `body` is sanitized HTML; Ace plain text should be converted via plainToEmailHtml upstream.
 */
export function useEmailBodyEditor({
  body,
  setBody,
  disabled = false,
  onFocusChange,
}: {
  body: string;
  setBody: (html: string) => void;
  disabled?: boolean;
  onFocusChange?: (focused: boolean) => void;
}): EmailBodyEditorState {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [boldActive, setBoldActive] = useState(false);
  const [italicActive, setItalicActive] = useState(false);
  const [underlineActive, setUnderlineActive] = useState(false);
  const [textColor, setTextColor] = useState<string | null>(null);
  const [highlightColor, setHighlightColor] = useState<string | null>(null);
  const [alignValue, setAlignValue] = useState<AlignValue>("left");

  const syncMarks = (next: Editor) => {
    setCanUndo(next.can().undo());
    setCanRedo(next.can().redo());
    setBoldActive(next.isActive("bold"));
    setItalicActive(next.isActive("italic"));
    setUnderlineActive(next.isActive("underline"));
    setTextColor(readTextColor(next));
    setHighlightColor(readHighlightColor(next));
    setAlignValue(readAlign(next));
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Underline ships inside StarterKit 3.x — do not register it again.
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ["paragraph"],
        alignments: ["left", "center", "right"],
      }),
    ],
    content: body.trim() ? sanitizeEmailHtml(body) : "<p></p>",
    editable: !disabled,
    editorProps: {
      attributes: {
        id: "opp-draft-body",
        class: cn(
          FIELD_TEXTAREA_CLASSNAME,
          "min-h-0 flex-1 resize-none overflow-y-auto bg-transparent px-3 pb-11 pt-2 text-xs leading-relaxed outline-none",
          "[&_p]:my-0 [&_p+p]:mt-3"
        ),
        "aria-label": "Body",
      },
    },
    onUpdate: ({ editor: next }) => {
      setBody(sanitizeEmailHtml(next.getHTML()));
      syncMarks(next);
    },
    onSelectionUpdate: ({ editor: next }) => {
      syncMarks(next);
    },
    onTransaction: ({ editor: next }) => {
      setCanUndo(next.can().undo());
      setCanRedo(next.can().redo());
    },
    onFocus: () => onFocusChange?.(true),
    onBlur: () => onFocusChange?.(false),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const incoming = body.trim()
      ? looksLikeMarkup(body)
        ? sanitizeEmailHtml(body)
        : plainToEmailHtml(body)
      : "<p></p>";
    const current = sanitizeEmailHtml(editor.getHTML());
    if (incoming === current) return;
    editor.commands.setContent(incoming, { emitUpdate: false });
    syncMarks(editor);
  }, [body, editor]);

  return {
    editor,
    canUndo,
    canRedo,
    boldActive,
    italicActive,
    underlineActive,
    textColor,
    highlightColor,
    alignValue,
  };
}

/** TipTap surface for the email body field. */
export function EmailBodyEditorContent({
  editor,
  className,
}: {
  editor: Editor | null;
  className?: string;
}) {
  return (
    <EditorContent
      editor={editor}
      className={cn(
        "flex min-h-0 flex-1 flex-col [&_.tiptap]:flex [&_.tiptap]:min-h-0 [&_.tiptap]:flex-1 [&_.tiptap]:flex-col",
        className
      )}
    />
  );
}
