import { Children, cloneElement, Fragment, isValidElement, type ElementType, type ReactElement, type ReactNode } from 'react';

export function normalizeSettingsSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();
}

export function SettingsSearchGroup({ children }: { label: string; children: ReactNode }) {
  return <>{children}</>;
}

/** Metadata for cards whose text is rendered inside a separate component. */
export function SettingsSearchItem({ children }: { searchText: string; children: ReactNode }) {
  return <>{children}</>;
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(' ');
  if (!isValidElement<{ children?: ReactNode; searchText?: string }>(node)) return '';
  return `${node.props.searchText ?? ''} ${textOf(node.props.children)}`;
}

function cardsIn(children: ReactNode): ReactElement[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return [];
    if (child.type === SettingsSearchItem || child.props.className?.split(' ').includes('settings-card')) return [child];
    // Fragments and layout wrappers are transparent; card contents stay intact
    // so matched settings retain their original controls and descriptions.
    if (child.type === Fragment || typeof child.type === 'string') return cardsIn(child.props.children);
    return [];
  });
}

function matchingOptions(card: ReactElement, terms: string[], group: string, optionContent: ElementType): ReactNode {
  const children = (card as ReactElement<{ children?: ReactNode }>).props.children;
  const heading = Children.toArray(children)[0];
  const context = normalizeSettingsSearch(`${group} ${textOf(heading)}`);
  const remaining = terms.filter(term => !context.includes(term));
  if (!remaining.length) return card;
  let options = 0;
  let matches = 0;
  const filter = (node: ReactNode): ReactNode => {
    if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) return node;
    const isOption = node.props.className?.split(' ').includes('settings-option-row')
      || Children.toArray(node.props.children).some(child => isValidElement(child) && child.type === optionContent);
    if (isOption) {
      options += 1;
      const text = normalizeSettingsSearch(textOf(node));
      if (!remaining.every(term => text.includes(term))) return null;
      matches += 1;
      return node;
    }
    if (node.props.children === undefined) return node;
    const children = Children.map(node.props.children, filter);
    if ((node.type === 'div' || node.type === 'label') && !Children.toArray(children).length) return null;
    return cloneElement(node, {}, children);
  };
  const filtered = filter(card);
  return options && !matches ? null : filtered;
}

export default function SettingsSearch({ query, emptyMessage, optionContent, children }: {
  query: string;
  emptyMessage: string;
  optionContent: ElementType;
  children: ReactNode;
}) {
  const terms = normalizeSettingsSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return <>{children}</>;
  const groups = Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ label: string; children: ReactNode }>(child) || child.type !== SettingsSearchGroup) return [];
    const cards = cardsIn(child.props.children).flatMap(card => {
      const text = normalizeSettingsSearch(`${child.props.label} ${textOf(card)}`);
      if (!terms.every(term => text.includes(term))) return [];
      const filtered = matchingOptions(card, terms, child.props.label, optionContent);
      return filtered ? [filtered] : [];
    });
    if (!cards.length) return [];
    return <section key={child.key} className="settings-search-results" aria-label={child.props.label}>
      <h2>{child.props.label}</h2>
      {cards}
    </section>;
  });
  return groups.length ? <>{groups}</> : <p className="settings-search-empty" role="status">{emptyMessage}</p>;
}
