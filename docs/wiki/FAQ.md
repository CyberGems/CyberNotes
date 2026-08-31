# Frequently Asked Questions

General questions about CyberNotes features, configuration, and troubleshooting.

---

## General

### What is CyberNotes?
CyberNotes is a privacy-focused desktop note-taking application. It stores all data locally using SQL.js (SQLite compiled to WebAssembly) — no cloud, no accounts, no tracking.

### Is CyberNotes free?
Yes. CyberNotes is free and open source under the GPLv3 license. You can help keep it free [here](https://github.com/CyberGems/CyberNotes#-donate).

### Where is my data stored?
All data is stored locally in `%APPDATA%\CyberNotes\`. No data is sent to external servers.

### Can I use CyberNotes offline?
Yes. CyberNotes works fully offline. Only auto-update checks require internet.

---

## Editing

### What editor does CyberNotes use?
CyberNotes uses TipTap (ProseMirror) for rich text editing with markdown shortcuts.

### Can I use markdown?
Yes. Type markdown shortcuts (`##`, `>`, `-`, etc.) for instant formatting.

### Does CyberNotes support images?
Yes. Insert images into notes. They are stored locally in `%APPDATA%\CyberNotes\images\`.

### Is there spell check?
Yes. Bilingual spell checking for English and Spanish.

### Does notes save automatically?
Yes. Autosave is enabled by default. You can also manually save with Ctrl+S.

---

## Organization

### Can I organize notes into folders?
Yes. Create folders with custom names, icons, and colors. Drag notes between folders.

### How do I favorite notes?
Click the star icon or right-click → Toggle favorite. Starred notes appear in the Favorites filter.

### Can I search notes?
Yes. Full-text search across titles, previews, and content.

### Does CyberNotes support tabs?
Yes. Open multiple notes in tabs. Session restoration remembers open tabs.

---

## Security

### How do I set a master password?
Go to Settings → Security → Enable Master Password. Your password is hashed with bcrypt.

### What is auto-lock?
Auto-lock secures your notes after a period of inactivity. Set the timeout in Settings → Security.

### What is the privacy shield?
The privacy shield hides note content when the app is minimized or hidden, preventing shoulder surfing.

### What is the Caps Lock Manager?
It monitors Caps Lock state and can auto-off after inactivity with sound notifications.

---

## Customization

### What themes are available?
- Cyber Dark (default)
- Midnight
- Forest
- Cyber Neon
- Light
- Graphite

### Can I use a custom background?
Yes. Set a custom wallpaper in Settings → Appearance.

### Can I adjust the glass effects?
Yes. Configure blur intensity (0–40px) and overlay opacity (0–95%).

### Is CyberNotes bilingual?
Yes. Full English and Spanish UI with instant switching.

---

## Data

### Can I export notes?
Yes. Export as Markdown, HTML, or JSON backup.

### Can I import notes?
Yes. Import from JSON backup. A safety backup is created automatically before import.

### How do I backup my data?
Export to JSON for a full backup including all notes, folders, and metadata.

---

## Troubleshooting

### Notes are not saving
- Check if autosave is enabled
- Try manual save (Ctrl+S)
- Verify disk space is available

### The hotkey doesn't work
- Check for conflicts with other apps
- Verify the hotkey in Settings → System
- Try a different key combination

### CyberNotes won't start
- Ensure Node.js dependencies are installed
- Try running as Administrator
- Check Windows Event Viewer for errors

### Spell check not working
- Verify language settings
- Check if spell check is enabled

### Forgot master password
- The password hash is stored locally
- Reset requires deleting the database
- Export notes first if possible

---

## Contributing

### How can I report a bug?
Open an issue on [GitHub Issues](https://github.com/CyberGems/CyberNotes/issues) with:
- CyberNotes version
- Windows version
- Steps to reproduce
- Expected vs actual behavior

### How can I contribute code?
1. Fork the repository
2. Create a feature branch
3. Submit a pull request
4. Describe your changes in the PR description

### How can I help with translations?
UI strings are in `src/languages.ts`. Submit a PR with your translation.

### How can I donate?
See the [Donate section](https://github.com/CyberGems/CyberNotes#-donate) on the main README.
