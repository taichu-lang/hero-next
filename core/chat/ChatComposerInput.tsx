"use client";

import { Chip } from "@heroui/react";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Editor,
  EditorContent,
  JSONContent,
  mergeAttributes,
  Node,
  NodeViewWrapper,
  ReactNodeViewProps,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { HammerIcon } from "lucide-react";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { Skill } from "./type";

export interface ChatComposerValue {
  /** Plain text of the input; skills are not included. */
  text: string;
  /** Text with each skill inlined at its position as `<skill>` xml, ready to render as markdown. */
  markdown: string;
  /** Skills in the input, in document order. */
  skills: Skill[];
  /** The full document, for callers that need the position of skills within the text. */
  json: JSONContent;
  /** True when there is no text (whitespace only counts as empty); skills are ignored. */
  isEmpty: boolean;
}

export interface ChatComposerContextValue {
  /** The editor instance; null until the editor is created on the client. */
  editor: Editor | null;
  /** True when there is no text (skills are ignored). Re-renders consumers only when this flips. */
  isEmpty: boolean;
  /** Read the latest value on demand without subscribing to every keystroke. */
  getValue: () => ChatComposerValue;
  addSkill: (skill: Skill) => void;
  clear: () => void;
  /**
   * Submit the current value (no-op if empty or disabled), then clear the input.
   * Aborting the resulting request is not the composer's job: the request's AbortController
   * lives in ChatContext (see `beginRequest`/`cancelRequest`), whose lifetime is the chat page
   * rather than this component, so a request survives the composer instance that started it.
   */
  submit: () => void;
}

const ChatComposerContext = createContext<ChatComposerContextValue | null>(null);

export function useChatComposer(): ChatComposerContextValue {
  const ctx = useContext(ChatComposerContext);
  if (!ctx) {
    throw new Error("useChatComposer must be used within <ChatComposer>");
  }
  return ctx;
}

const EMPTY_VALUE: ChatComposerValue = {
  text: "",
  markdown: "",
  skills: [],
  json: { type: "doc" },
  isEmpty: true,
};

function readValue(editor: Editor): ChatComposerValue {
  const text = editor.getText();
  const skills: Skill[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "skill") {
      const attrs = node.attrs;
      skills.push({
        name: attrs.name,
        description: attrs.description,
        source: attrs.source,
        version: attrs.version,
        installation: attrs.installation,
      });
    }
  });
  const markdown = editor.getText({
    textSerializers: {
      skill: ({ node }) => {
        const { name, source } = node.attrs;
        // Using xml format rather than link in markdown, as those content can be customized based on the xml
        // tag when rendering user input as markdown. Different category can use its special tag, ex: <command>,
        // <file>.
        return `<skill name="${name}" source="${source}"></skill>`;
      },
    },
  });
  return { text, markdown, skills, json: editor.getJSON(), isEmpty: text.trim() === "" };
}

/** Line height of the input in px; max height is `maxRows * LINE_HEIGHT`. */
const LINE_HEIGHT = 26;

export interface ChatComposerProviderProps {
  disabled?: boolean;
  maxRows?: number;
  placeholder?: string;
  onSubmit: (value: ChatComposerValue) => void;
  children: React.ReactNode;
}

export function ChatComposerProvider({
  disabled,
  maxRows = 4,
  placeholder,
  onSubmit,
  children,
}: ChatComposerProviderProps) {
  const maxHeight = maxRows * LINE_HEIGHT;

  // The editor is created once, so keep the latest callbacks in refs to avoid stale closures.
  const submitRef = useRef<() => void>(() => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      Placeholder.configure({ placeholder }),
      SkillNode,
    ],
    editable: true, // the editor is always on, control the sending trigger instead.
    editorProps: {
      attributes: {
        // `prose` caps the width at 65ch, which would override `w-full` and leave the input
        // only partly filled in a wide container; `max-w-none` removes that cap.
        class:
          "overflow-y-auto focus:outline-none prose prose-sm prose-slate text-foreground px-3 w-full max-w-none",
        // Set inline: Tailwind can't generate classes like `max-h-[${n}px]` from runtime values.
        style: `line-height: ${LINE_HEIGHT}px; max-height: ${maxHeight}px;`,
      },
      handleKeyDown: (view, event) => {
        if (view.composing) {
          return false;
        }

        const isMod = event.metaKey || event.ctrlKey;
        if (event.key === "Enter" && !event.shiftKey && !isMod) {
          event.preventDefault();
          submitRef.current();
          return true;
        }

        return false;
      },
    },
    immediatelyRender: false,
  });

  const isEmpty =
    useEditorState({
      editor,
      // A destroyed editor (e.g. the previous page's, during route transitions) has no schema,
      // so `getText()` would throw; treat it as empty.
      selector: ({ editor }) => !editor || editor.isDestroyed || editor.getText().trim() === "",
    }) ?? true;

  const getValue = useCallback(
    () => (editor && !editor.isDestroyed ? readValue(editor) : EMPTY_VALUE),
    [editor],
  );

  const clear = useCallback(() => {
    editor?.commands.clearContent(true);
  }, [editor]);

  const addSkill = useCallback(
    (skill: Skill) => {
      editor?.chain().focus().insertContent({ type: "skill", attrs: skill }).run();
    },
    [editor],
  );

  const submit = useCallback(() => {
    const value = getValue();
    if (value.isEmpty || disabled) {
      return;
    }

    // No AbortController is created here: the request sender registers one in ChatContext
    // (beginRequest), which also aborts any previous in-flight request. That keeps the
    // controller's lifetime tied to the chat page instead of this provider instance, which
    // unmounts when navigating away (ex: landing page -> conversation page).
    onSubmit(value);
    clear();
  }, [getValue, clear, disabled, onSubmit]);

  // Sync the ref after commit; writing it during render is unsafe under concurrent rendering.
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  const ctx = useMemo<ChatComposerContextValue>(
    () => ({ editor, isEmpty, getValue, addSkill, clear, submit }),
    [editor, isEmpty, getValue, addSkill, clear, submit],
  );

  return <ChatComposerContext value={ctx}>{children}</ChatComposerContext>;
}

const SkillNode = Node.create<Skill>({
  name: "skill",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      name: { default: "" },
      description: { default: "" },
      source: { default: "" },
      version: { default: undefined },
      installation: { default: undefined },
    };
  },

  // The React node view only covers display; the schema still needs toDOM. EditorContent clears
  // all nodeViews on unmount (route change), and ProseMirror then falls back to spec.toDOM for
  // every node — without renderHTML that crashes with "spec.toDOM is not a function".
  parseHTML() {
    return [{ tag: "span[data-skill]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-skill": "" }, HTMLAttributes), node.attrs.name];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SkillChipView);
  },
});

function SkillChipView({ node }: ReactNodeViewProps<Skill>) {
  const { name } = node.attrs;
  return (
    <NodeViewWrapper as="span" className="inline align-baseline">
      {" "}
      <Chip size="md" color="warning" className="inline-flex items-center gap-1">
        <HammerIcon className="size-3" />
        {name}
      </Chip>{" "}
    </NodeViewWrapper>
  );
}

/**
 * The rich-text input of ChatComposer. The editor itself lives in ChatComposerProvider
 * so that slots (skill/file/model pickers, send button) can reach it through useChatComposer.
 */
export function ChatComposerInput() {
  const { editor } = useChatComposer();
  return <EditorContent editor={editor} className="w-full" />;
}
