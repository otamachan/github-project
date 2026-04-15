export type OwnerKind = "User" | "Organization";

export interface ProjectOwner {
  kind: OwnerKind;
  login: string;
}

export interface Project {
  id: string;
  number: number;
  title: string;
  shortDescription: string | null;
  url: string;
  owner: ProjectOwner;
  closed: boolean;
  updatedAt: string;
}

/**
 * Field `kind` maps to GitHub's `ProjectV2FieldType`. We keep the ones we
 * actively support; anything else is rendered read-only.
 */
export type FieldKind =
  | "TEXT"
  | "NUMBER"
  | "DATE"
  | "SINGLE_SELECT"
  | "ITERATION"
  | "TITLE"
  | "LABELS"
  | "ASSIGNEES"
  | "MILESTONE"
  | "REPOSITORY"
  | "LINKED_PULL_REQUESTS"
  | "REVIEWERS"
  | "TRACKS"
  | "TRACKED_BY"
  | "PARENT_ISSUE"
  | "SUB_ISSUES_PROGRESS"
  | "UNKNOWN";

export interface SingleSelectOption {
  id: string;
  name: string;
  /** Projects V2 color token: GRAY | BLUE | GREEN | YELLOW | ORANGE | RED | PINK | PURPLE */
  color: string;
  description: string;
}

export interface IterationOption {
  id: string;
  title: string;
  startDate: string; // yyyy-mm-dd
  duration: number;  // days
}

export interface FieldDef {
  id: string;
  name: string;
  kind: FieldKind;
  options?: SingleSelectOption[];           // SINGLE_SELECT
  iterations?: IterationOption[];           // ITERATION — active
  completedIterations?: IterationOption[];  // ITERATION — completed
}

export type ItemContent =
  | { kind: "DraftIssue"; draftId: string; title: string; body: string }
  | {
      kind: "Issue";
      title: string;
      number: number;
      url: string;
      state: string;
      repo: string;
    }
  | {
      kind: "PullRequest";
      title: string;
      number: number;
      url: string;
      state: string;
      isDraft: boolean;
      repo: string;
    }
  | { kind: "Redacted" };

export type FieldValue =
  | { kind: "TEXT"; text: string }
  | { kind: "NUMBER"; number: number }
  | { kind: "DATE"; date: string }
  | { kind: "SINGLE_SELECT"; optionId: string; name: string; color: string }
  | {
      kind: "ITERATION";
      iterationId: string;
      title: string;
      startDate: string;
      duration: number;
    }
  | { kind: "LABELS"; labels: { name: string; color: string }[] }
  | { kind: "ASSIGNEES"; users: { login: string; avatarUrl: string }[] }
  | { kind: "MILESTONE"; title: string }
  | { kind: "REPOSITORY"; nameWithOwner: string }
  | { kind: "TITLE"; text: string }
  | { kind: "UNKNOWN" };

export interface ProjectItem {
  id: string;
  content: ItemContent;
  /** keyed by field id */
  fieldValues: Record<string, FieldValue>;
  updatedAt: string;
}

export interface ProjectDetail extends Project {
  fields: FieldDef[];
}

export type Route =
  | { page: "list" }
  | { page: "project"; owner: string; number: number }
  | { page: "item"; owner: string; number: number; itemId: string };
