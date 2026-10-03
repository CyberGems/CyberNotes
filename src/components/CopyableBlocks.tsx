import { useEffect, useRef, useState } from 'react';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react';
import Blockquote from '@tiptap/extension-blockquote';
import CodeBlock from '@tiptap/extension-code-block';
import { Check, Copy } from 'lucide-react';
import type { Language } from '../languages';

function useDocumentLanguage(): Language {
  const readLanguage = (): Language => document.documentElement.lang === 'es' ? 'es' : 'en';
  const [language, setLanguage] = useState<Language>(readLanguage);

  useEffect(() => {
    const observer = new MutationObserver(() => setLanguage(readLanguage()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => observer.disconnect();
  }, []);

  return language;
}

function CopyableBlockView({ node, kind }: ReactNodeViewProps & { kind: 'code' | 'quote' }) {
  const language = useDocumentLanguage();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const copyBlock = async () => {
    const text = node.textBetween(0, node.content.size, '\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  };

  const isCode = kind === 'code';
  const blockLabel = isCode
    ? (language === 'es' ? 'Código' : 'Code')
    : (language === 'es' ? 'Cita' : 'Quote');
  const copyLabel = copyState === 'copied'
    ? (language === 'es' ? 'Copiado' : 'Copied')
    : copyState === 'failed'
      ? (language === 'es' ? 'Error al copiar' : 'Copy failed')
      : (language === 'es' ? 'Copiar' : 'Copy');
  const ariaLabel = language === 'es'
    ? `Copiar ${isCode ? 'código' : 'cita'}`
    : `Copy ${isCode ? 'code' : 'quote'}`;

  const header = (
    <div className="copyable-block-header" contentEditable={false}>
      <span>{blockLabel}</span>
      <button
        type="button"
        className="copyable-block-button"
        aria-label={ariaLabel}
        disabled={!node.textContent}
        onMouseDown={event => event.preventDefault()}
        onClick={() => { void copyBlock(); }}
      >
        {copyState === 'copied' ? <Check size={12} /> : <Copy size={12} />}
        <span>{copyLabel}</span>
      </button>
    </div>
  );

  if (isCode) {
    return (
      <NodeViewWrapper className="copyable-block copyable-code-block">
        {header}
        <pre><NodeViewContent as="code" /></pre>
      </NodeViewWrapper>
    );
  }
  return (
    <NodeViewWrapper as="blockquote" className="copyable-block copyable-quote-block">
      {header}
      <NodeViewContent className="copyable-quote-content" />
    </NodeViewWrapper>
  );
}

export const CopyableCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(props => <CopyableBlockView {...props} kind="code" />);
  },
});

export const CopyableBlockquote = Blockquote.extend({
  addNodeView() {
    return ReactNodeViewRenderer(props => <CopyableBlockView {...props} kind="quote" />);
  },
});
