"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type MarkKey = "bold" | "italic" | "underline";

type MarkIntent = Record<MarkKey, boolean>;

const EMPTY_MARK_INTENT: MarkIntent = {
  bold: false,
  italic: false,
  underline: false,
};

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

function readMarks(editor: Editor): MarkIntent {
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
  };
}

function hasAnyMark(marks: MarkIntent): boolean {
  return marks.bold || marks.italic || marks.underline;
}

function hasAnySticky(sticky: MarkIntent): boolean {
  return sticky.bold || sticky.italic || sticky.underline;
}

/**
 * Re-arm toolbar mark intent as ProseMirror stored marks.
 * Empty-caret toolbar toggles set sticky intent; body clicks can wipe stored
 * marks — without this, B/I/U die before typing. Range formatting must not
 * sticky-arm (selection-only, like Gmail/Docs).
 */
function applyMarkIntent(editor: Editor, intent: MarkIntent) {
  if (!editor.isEditable || !editor.state.selection.empty) return;
  const current = readMarks(editor);
  const needsBold = intent.bold !== current.bold;
  const needsItalic = intent.italic !== current.italic;
  const needsUnderline = intent.underline !== current.underline;
  if (!needsBold && !needsItalic && !needsUnderline) return;

  let chain = editor.chain().focus();
  if (needsBold) {
    chain = intent.bold ? chain.setBold() : chain.unsetBold();
  }
  if (needsItalic) {
    chain = intent.italic ? chain.setItalic() : chain.unsetItalic();
  }
  if (needsUnderline) {
    chain = intent.underline ? chain.setUnderline() : chain.unsetUnderline();
  }
  chain.run();
}

function runToggleMark(editor: Editor, mark: MarkKey) {
  const chain = editor.chain().focus();
  if (mark === "bold") return chain.toggleBold().run();
  if (mark === "italic") return chain.toggleItalic().run();
  return chain.toggleUnderline().run();
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
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  /** Apply / clear text color and refresh toolbar (empty-caret stored marks skip onUpdate). */
  applyTextColor: (value: string | null) => void;
  /** Apply / clear highlight and refresh toolbar. */
  applyHighlightColor: (value: string | null) => void;
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

  /** Survives body clicks that wipe ProseMirror stored marks (empty-caret toggles only). */
  const markIntentRef = useRef<MarkIntent>({ ...EMPTY_MARK_INTENT });
  /** Per-mark sticky arm from empty-caret toolbar toggles — never from range formats. */
  const stickyMarkRef = useRef<MarkIntent>({ ...EMPTY_MARK_INTENT });
  const applyingIntentRef = useRef(false);

  const flushUi = useCallback((next: Editor) => {
    setCanUndo(next.can().undo());
    setCanRedo(next.can().redo());
    setBoldActive(markIntentRef.current.bold);
    setItalicActive(markIntentRef.current.italic);
    setUnderlineActive(markIntentRef.current.underline);
    setTextColor(readTextColor(next));
    setHighlightColor(readHighlightColor(next));
    setAlignValue(readAlign(next));
  }, []);

  const syncFromEditor = useCallback(
    (next: Editor) => {
      if (applyingIntentRef.current) {
        flushUi(next);
        return;
      }
      const marks = readMarks(next);
      const empty = next.state.selection.empty;
      // Range selection or caret inside marked text → intent follows content;
      // clear sticky so a prior selection format does not arm typing forever.
      if (!empty || hasAnyMark(marks)) {
        markIntentRef.current = marks;
        stickyMarkRef.current = { ...EMPTY_MARK_INTENT };
      } else if (hasAnySticky(stickyMarkRef.current)) {
        // Plain empty caret after empty-caret toggle → re-arm wiped stored marks.
        applyingIntentRef.current = true;
        applyMarkIntent(next, markIntentRef.current);
        applyingIntentRef.current = false;
      } else {
        markIntentRef.current = marks;
      }
      flushUi(next);
    },
    [flushUi]
  );

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
      syncFromEditor(next);
    },
    onSelectionUpdate: ({ editor: next }) => {
      syncFromEditor(next);
    },
    onTransaction: ({ editor: next }) => {
      setCanUndo(next.can().undo());
      setCanRedo(next.can().redo());
    },
    onFocus: ({ editor: next }) => {
      if (hasAnySticky(stickyMarkRef.current)) {
        applyingIntentRef.current = true;
        applyMarkIntent(next, markIntentRef.current);
        applyingIntentRef.current = false;
      }
      syncFromEditor(next);
      onFocusChange?.(true);
    },
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
    syncFromEditor(editor);
  }, [body, editor, syncFromEditor]);

  const toggleMark = useCallback(
    (mark: MarkKey) => {
      if (!editor) return;
      const empty = editor.state.selection.empty;
      applyingIntentRef.current = true;
      runToggleMark(editor, mark);
      applyingIntentRef.current = false;

      if (empty) {
        // Caret toggle: sticky typing intent until caret enters real content marks.
        const next = editor.isActive(mark);
        markIntentRef.current = { ...markIntentRef.current, [mark]: next };
        stickyMarkRef.current = { ...stickyMarkRef.current, [mark]: true };
      } else {
        // Range toggle: format selection only — do not arm sticky for later typing.
        markIntentRef.current = readMarks(editor);
        stickyMarkRef.current = { ...EMPTY_MARK_INTENT };
      }
      flushUi(editor);
    },
    [editor, flushUi]
  );

  const toggleBold = useCallback(() => toggleMark("bold"), [toggleMark]);
  const toggleItalic = useCallback(() => toggleMark("italic"), [toggleMark]);
  const toggleUnderline = useCallback(
    () => toggleMark("underline"),
    [toggleMark]
  );

  const applyTextColor = useCallback(
    (value: string | null) => {
      if (!editor) return;
      if (value === null) {
        editor.chain().focus().unsetColor().run();
      } else {
        editor.chain().focus().setColor(value).run();
      }
      // Empty-caret color is a stored mark — may not emit onUpdate.
      flushUi(editor);
    },
    [editor, flushUi]
  );

  const applyHighlightColor = useCallback(
    (value: string | null) => {
      if (!editor) return;
      if (value === null) {
        editor.chain().focus().unsetHighlight().run();
      } else {
        editor.chain().focus().setHighlight({ color: value }).run();
      }
      flushUi(editor);
    },
    [editor, flushUi]
  );

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
    toggleBold,
    toggleItalic,
    toggleUnderline,
    applyTextColor,
    applyHighlightColor,
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
