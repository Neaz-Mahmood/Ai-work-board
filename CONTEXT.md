# AI Work Board

A local, Jira-style kanban board where AI coding agents (and the human who drives them) record and track the work they plan and carry out across local codebases.

## Language

### Structure

**Project**:
One local code repository tracked on the board, identified by its absolute path and a unique Project Key of 2–5 characters (uppercase letters, optionally ending in digits). Each Project has exactly one Board.
_Avoid_: Workspace, repo (as a board term), space

**Board**:
The single kanban view of one Project's Tickets, laid out in the five fixed Columns.
_Avoid_: Sprint, backlog view

**Column**:
One of the five fixed workflow states a Ticket sits in: Backlog, To Do, In Progress, In Review, Done. Identical for every Project.
_Avoid_: Lane, stage, list

### Work

**Ticket**:
A single unit of work on a Board that one agent (or the human) picks up, identified by `<KEY>-<n>`.
_Avoid_: Task, issue, card (card is only its visual rendering), story

**Feature**:
A planned piece of work that is broken down into Tickets; each Ticket belongs to at most one Feature.
_Avoid_: Epic, slug, plan

**Rank**:
A Ticket's manual position within its Column; the top-ranked eligible To Do Ticket is the one an agent claims next.
_Avoid_: Order, sort, priority (priority is a separate field that does not affect Rank)

**Priority**:
A Ticket's importance on Jira's five-level scale (Highest, High, Medium, Low, Lowest), shown on the card only.
_Avoid_: Severity, urgency

**Blocker**:
Another Ticket in the same Project that must be Done before a Ticket can be claimed; a Ticket with any unfinished Blocker is "blocked".
_Avoid_: Dependency, prerequisite

**Claim**:
An agent atomically taking the top-ranked unblocked, unassigned To Do Ticket that is not marked Needs Attention, becoming its Assignee and moving it to In Progress.
_Avoid_: Pick up, grab, checkout

**Assignee**:
The Actor currently responsible for a Ticket; at most one per Ticket.
_Avoid_: Owner, worker

**Needs Attention**:
A flag on a Ticket marking that it could not be completed without human help; it does not move the Ticket out of its Column.
_Avoid_: Blocked, failed (as a Column)

### People and history

**Actor**:
Whoever performs a change on the board: the human user (Actor "you"), or an agent identified by a free-form name it supplies, registered on first use.
_Avoid_: User (when an agent is meant), author

**Activity**:
The append-only record of every change to a Ticket, each entry naming its Actor.
_Avoid_: History, audit log, changelog
