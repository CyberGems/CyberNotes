import { mergeConfig } from 'vite';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, {
  test: {
    // Transform the real bubble menu and Tippy together, as Vite does in the
    // renderer. Native Node ESM otherwise wraps Tippy's CommonJS default twice.
    server: { deps: { inline: ['@tiptap/react', '@tiptap/extension-bubble-menu', 'tippy.js'] } },
  },
});
