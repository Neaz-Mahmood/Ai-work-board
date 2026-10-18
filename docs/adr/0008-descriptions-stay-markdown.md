---
status: accepted
---
# Descriptions stay markdown; the rich text editor works over markdown

Ticket and Feature descriptions are edited in the UI with a WYSIWYG editor, but markdown stays the stored format. The editor loads markdown and saves markdown, and offers only formatting that round-trips through markdown. Agents write descriptions as markdown through MCP and the CLI, the CLI prints them, and search matches their text. Storing the editor's JSON or HTML would break all three. Comments keep a plain markdown textarea.
