# Task 15: Features UI

## Context
The AI Work Board is a local Jira-style kanban for AI agents. Features (planned work broken into Tickets) now exist on the server (task 14): `GET/POST /api/projects/:key/features`, `GET/PATCH/DELETE /api/features/:id`, `featureId` on Ticket PATCH, `Card.feature: { id, name, color } | null`, `Board.features: Feature[]` with `progress { done, total }`. Live updates invalidate `qk.features(key)` and `qk.board(key)` on `feature.*` events (task 08). This task shows Features in the UI.

## Do
- `src/web/api/features.ts`: `useFeatures(projectKey)` (`qk.features`), `useCreateFeature`, `useUpdateFeature`, `useDeleteFeature`; mutations invalidate `qk.features(key)` and `qk.board(key)`.
- `src/web/components/FeatureLabel.tsx`: Jira-epic-style lozenge — the Feature name (max ~20 chars, ellipsis, full name in `title`), uppercase 11px bold text in the Feature colour on a 15%-opacity tint of that colour, 3px radius. Render it in the existing Feature slot of `TicketCard`.
- `TicketModal` side panel: "Feature" select listing the Project's Features (plus "None") → `PATCH /api/tickets/:ticketKey { featureId }`; show the `FeatureLabel` beside the select. `activityText.ts`: `updated` with `field: "feature"` → "set the Feature to X" / "removed the Feature X".
- `src/web/components/features/FeaturesPanel.tsx`: opened from a "Features" button in the `BoardPage` header; a right-side drawer listing Features with colour swatch, name, a progress bar (`done/total`, green fill) and Ticket count; actions: "Create feature" (name, description, colour picker from the 8-colour palette `#0C66E4 #1F845A #E2B203 #C9372C #6E5DC6 #227D9B #E56910 #AE4787`), edit (same form), delete (confirmation: "Delete feature X? Its tickets stay on the board."). Clicking a Feature's name expands its description (rendered with `Markdown`).
- Styles in `src/web/components/features/features.css`.

## Follow these existing patterns
- `src/web/api/tickets.ts`, `src/web/api/board.ts` — hooks and cache keys.
- `src/web/components/Modal.tsx`, `src/web/components/ticket/TicketModal.tsx`, `src/web/components/board/TicketCard.tsx` — reuse and extend.
- `src/web/styles/theme.css` — tokens.

## Do not
- Touch files outside: `src/web/`.
- Add dependencies, reformat unrelated code, or commit.
- Change the REST API.

## Done when
- Feature labels show on cards in their colour; the modal can set/clear a Ticket's Feature; the Features panel lists progress and supports create/edit/delete; a Feature created by an agent appears live.
- `pnpm test && pnpm typecheck && pnpm build` passes.
