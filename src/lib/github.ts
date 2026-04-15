import type {
  FieldDef,
  FieldKind,
  FieldValue,
  IterationOption,
  ItemContent,
  Project,
  ProjectDetail,
  ProjectItem,
  SingleSelectOption,
} from "../types";

const TOKEN_KEY = "github-project-pat";
const GRAPHQL_URL = "https://api.github.com/graphql";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

interface GraphQLError {
  message: string;
  type?: string;
  path?: string[];
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

async function gqlWithToken<T>(
  token: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  }
  const json: GraphQLResponse<T> = await res.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new Error("Empty response");
  return json.data;
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const token = getToken();
  if (!token) throw new Error("No token");
  return gqlWithToken<T>(token, query, variables);
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

export async function verifyToken(token: string): Promise<string> {
  const data = await gqlWithToken<{ viewer: { login: string } }>(
    token,
    "query { viewer { login } }",
  );
  return data.viewer.login;
}

// ---------------------------------------------------------------------------
// Project list (the viewer's own projects)
// ---------------------------------------------------------------------------

const VIEWER_PROJECTS_QUERY = /* GraphQL */ `
  query ViewerProjects($cursor: String) {
    viewer {
      projectsV2(
        first: 30
        after: $cursor
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          number
          title
          shortDescription
          url
          closed
          updatedAt
          owner {
            __typename
            ... on User { login }
            ... on Organization { login }
          }
        }
      }
    }
  }
`;

interface GQLProjectNode {
  id: string;
  number: number;
  title: string;
  shortDescription: string | null;
  url: string;
  closed: boolean;
  updatedAt: string;
  owner: { __typename: string; login: string };
}

interface GQLViewerProjectsResp {
  viewer: {
    projectsV2: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: GQLProjectNode[];
    };
  };
}

export async function fetchMyProjects(): Promise<Project[]> {
  const out: Project[] = [];
  let cursor: string | null = null;
  // Usually a user doesn't have hundreds of projects, but paginate defensively.
  for (let i = 0; i < 10; i++) {
    const data: GQLViewerProjectsResp = await gql<GQLViewerProjectsResp>(
      VIEWER_PROJECTS_QUERY,
      { cursor },
    );
    for (const n of data.viewer.projectsV2.nodes) {
      out.push({
        id: n.id,
        number: n.number,
        title: n.title,
        shortDescription: n.shortDescription,
        url: n.url,
        closed: n.closed,
        updatedAt: n.updatedAt,
        owner: {
          kind: n.owner.__typename === "Organization" ? "Organization" : "User",
          login: n.owner.login,
        },
      });
    }
    if (!data.viewer.projectsV2.pageInfo.hasNextPage) break;
    cursor = data.viewer.projectsV2.pageInfo.endCursor;
    if (!cursor) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Single project (header + fields)
// ---------------------------------------------------------------------------

const PROJECT_QUERY = /* GraphQL */ `
  query Project($owner: String!, $number: Int!) {
    repositoryOwner(login: $owner) {
      __typename
      ... on ProjectV2Owner {
        projectV2(number: $number) {
          id
          number
          title
          shortDescription
          url
          closed
          updatedAt
          fields(first: 50) {
            nodes {
              __typename
              ... on ProjectV2FieldCommon {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                options {
                  id
                  name
                  color
                  description
                }
              }
              ... on ProjectV2IterationField {
                configuration {
                  iterations {
                    id
                    title
                    startDate
                    duration
                  }
                  completedIterations {
                    id
                    title
                    startDate
                    duration
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface GQLFieldNode {
  __typename: string;
  id: string;
  name: string;
  dataType: string;
  options?: SingleSelectOption[];
  configuration?: {
    iterations: IterationOption[];
    completedIterations: IterationOption[];
  };
}

interface GQLProjectHeaderResp {
  repositoryOwner: {
    __typename: string;
    projectV2: {
      id: string;
      number: number;
      title: string;
      shortDescription: string | null;
      url: string;
      closed: boolean;
      updatedAt: string;
      fields: { nodes: GQLFieldNode[] };
    } | null;
  } | null;
}

function mapFieldKind(dataType: string): FieldKind {
  switch (dataType) {
    case "TEXT":
    case "NUMBER":
    case "DATE":
    case "SINGLE_SELECT":
    case "ITERATION":
    case "TITLE":
    case "LABELS":
    case "ASSIGNEES":
    case "MILESTONE":
    case "REPOSITORY":
    case "LINKED_PULL_REQUESTS":
    case "REVIEWERS":
    case "TRACKS":
    case "TRACKED_BY":
    case "PARENT_ISSUE":
    case "SUB_ISSUES_PROGRESS":
      return dataType;
    default:
      return "UNKNOWN";
  }
}

function mapField(n: GQLFieldNode): FieldDef {
  const def: FieldDef = {
    id: n.id,
    name: n.name,
    kind: mapFieldKind(n.dataType),
  };
  if (n.options) def.options = n.options;
  if (n.configuration) {
    def.iterations = n.configuration.iterations;
    def.completedIterations = n.configuration.completedIterations;
  }
  return def;
}

export async function fetchProject(
  owner: string,
  number: number,
): Promise<ProjectDetail> {
  const data = await gql<GQLProjectHeaderResp>(PROJECT_QUERY, {
    owner,
    number,
  });
  const proj = data.repositoryOwner?.projectV2;
  if (!proj) throw new Error(`Project not found: ${owner} #${number}`);

  const ownerKind =
    data.repositoryOwner!.__typename === "Organization"
      ? "Organization"
      : "User";

  return {
    id: proj.id,
    number: proj.number,
    title: proj.title,
    shortDescription: proj.shortDescription,
    url: proj.url,
    closed: proj.closed,
    updatedAt: proj.updatedAt,
    owner: { kind: ownerKind, login: owner },
    fields: proj.fields.nodes.map(mapField),
  };
}

// ---------------------------------------------------------------------------
// Project items (paginated)
// ---------------------------------------------------------------------------

const PROJECT_ITEMS_QUERY = /* GraphQL */ `
  query ProjectItems(
    $owner: String!
    $number: Int!
    $cursor: String
    $pageSize: Int!
  ) {
    repositoryOwner(login: $owner) {
      ... on ProjectV2Owner {
        projectV2(number: $number) {
          items(first: $pageSize, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              updatedAt
              content {
                __typename
                ... on DraftIssue {
                  id
                  title
                  body
                }
                ... on Issue {
                  title
                  number
                  url
                  state
                  repository { nameWithOwner }
                }
                ... on PullRequest {
                  title
                  number
                  url
                  state
                  isDraft
                  repository { nameWithOwner }
                }
              }
              fieldValues(first: 30) {
                nodes {
                  __typename
                  ... on ProjectV2ItemFieldTextValue {
                    text
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldNumberValue {
                    number
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    date
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    optionId
                    name
                    color
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldIterationValue {
                    iterationId
                    title
                    startDate
                    duration
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldLabelValue {
                    labels(first: 20) { nodes { name color } }
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldUserValue {
                    users(first: 20) { nodes { login avatarUrl } }
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldMilestoneValue {
                    milestone { title }
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                  ... on ProjectV2ItemFieldRepositoryValue {
                    repository { nameWithOwner }
                    field { ... on ProjectV2FieldCommon { id } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface GQLFieldValueNode {
  __typename: string;
  field?: { id: string };
  text?: string;
  number?: number;
  date?: string | null;
  optionId?: string;
  name?: string;
  color?: string;
  iterationId?: string;
  title?: string;
  startDate?: string;
  duration?: number;
  labels?: { nodes: { name: string; color: string }[] };
  users?: { nodes: { login: string; avatarUrl: string }[] };
  milestone?: { title: string } | null;
  repository?: { nameWithOwner: string };
}

interface GQLItemNode {
  id: string;
  updatedAt: string;
  content:
    | {
        __typename: "DraftIssue";
        id: string;
        title: string;
        body: string;
      }
    | {
        __typename: "Issue";
        title: string;
        number: number;
        url: string;
        state: string;
        repository: { nameWithOwner: string };
      }
    | {
        __typename: "PullRequest";
        title: string;
        number: number;
        url: string;
        state: string;
        isDraft: boolean;
        repository: { nameWithOwner: string };
      }
    | { __typename: "Redacted" };
  fieldValues: { nodes: GQLFieldValueNode[] };
}

interface GQLItemsResp {
  repositoryOwner: {
    projectV2: {
      items: {
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
        nodes: GQLItemNode[];
      };
    } | null;
  } | null;
}

function mapContent(c: GQLItemNode["content"]): ItemContent {
  switch (c.__typename) {
    case "DraftIssue":
      return {
        kind: "DraftIssue",
        draftId: c.id,
        title: c.title,
        body: c.body,
      };
    case "Issue":
      return {
        kind: "Issue",
        title: c.title,
        number: c.number,
        url: c.url,
        state: c.state,
        repo: c.repository.nameWithOwner,
      };
    case "PullRequest":
      return {
        kind: "PullRequest",
        title: c.title,
        number: c.number,
        url: c.url,
        state: c.state,
        isDraft: c.isDraft,
        repo: c.repository.nameWithOwner,
      };
    default:
      return { kind: "Redacted" };
  }
}

function mapFieldValue(n: GQLFieldValueNode): FieldValue | null {
  switch (n.__typename) {
    case "ProjectV2ItemFieldTextValue":
      return { kind: "TEXT", text: n.text ?? "" };
    case "ProjectV2ItemFieldNumberValue":
      return { kind: "NUMBER", number: n.number ?? 0 };
    case "ProjectV2ItemFieldDateValue":
      return { kind: "DATE", date: n.date ?? "" };
    case "ProjectV2ItemFieldSingleSelectValue":
      return {
        kind: "SINGLE_SELECT",
        optionId: n.optionId ?? "",
        name: n.name ?? "",
        color: n.color ?? "GRAY",
      };
    case "ProjectV2ItemFieldIterationValue":
      return {
        kind: "ITERATION",
        iterationId: n.iterationId ?? "",
        title: n.title ?? "",
        startDate: n.startDate ?? "",
        duration: n.duration ?? 0,
      };
    case "ProjectV2ItemFieldLabelValue":
      return { kind: "LABELS", labels: n.labels?.nodes ?? [] };
    case "ProjectV2ItemFieldUserValue":
      return { kind: "ASSIGNEES", users: n.users?.nodes ?? [] };
    case "ProjectV2ItemFieldMilestoneValue":
      return { kind: "MILESTONE", title: n.milestone?.title ?? "" };
    case "ProjectV2ItemFieldRepositoryValue":
      return { kind: "REPOSITORY", nameWithOwner: n.repository?.nameWithOwner ?? "" };
    default:
      return null;
  }
}

export interface ItemsPage {
  items: ProjectItem[];
  nextCursor: string | null;
}

const SINGLE_ITEM_QUERY = /* GraphQL */ `
  query Item($itemId: ID!) {
    node(id: $itemId) {
      __typename
      ... on ProjectV2Item {
        id
        updatedAt
        content {
          __typename
          ... on DraftIssue {
            id
            title
            body
          }
          ... on Issue {
            title
            number
            url
            state
            repository { nameWithOwner }
          }
          ... on PullRequest {
            title
            number
            url
            state
            isDraft
            repository { nameWithOwner }
          }
        }
        fieldValues(first: 30) {
          nodes {
            __typename
            ... on ProjectV2ItemFieldTextValue {
              text
              field { ... on ProjectV2FieldCommon { id } }
            }
            ... on ProjectV2ItemFieldNumberValue {
              number
              field { ... on ProjectV2FieldCommon { id } }
            }
            ... on ProjectV2ItemFieldDateValue {
              date
              field { ... on ProjectV2FieldCommon { id } }
            }
            ... on ProjectV2ItemFieldSingleSelectValue {
              optionId
              name
              color
              field { ... on ProjectV2FieldCommon { id } }
            }
            ... on ProjectV2ItemFieldIterationValue {
              iterationId
              title
              startDate
              duration
              field { ... on ProjectV2FieldCommon { id } }
            }
            ... on ProjectV2ItemFieldLabelValue {
              labels(first: 20) { nodes { name color } }
              field { ... on ProjectV2FieldCommon { id } }
            }
            ... on ProjectV2ItemFieldUserValue {
              users(first: 20) { nodes { login avatarUrl } }
              field { ... on ProjectV2FieldCommon { id } }
            }
            ... on ProjectV2ItemFieldMilestoneValue {
              milestone { title }
              field { ... on ProjectV2FieldCommon { id } }
            }
            ... on ProjectV2ItemFieldRepositoryValue {
              repository { nameWithOwner }
              field { ... on ProjectV2FieldCommon { id } }
            }
          }
        }
      }
    }
  }
`;

export async function fetchItem(itemId: string): Promise<ProjectItem> {
  const data = await gql<{
    node:
      | (GQLItemNode & { __typename: "ProjectV2Item" })
      | { __typename: string }
      | null;
  }>(SINGLE_ITEM_QUERY, { itemId });
  const n = data.node;
  if (!n || n.__typename !== "ProjectV2Item") {
    throw new Error("Item not found");
  }
  const node = n as GQLItemNode;
  const fv: Record<string, FieldValue> = {};
  for (const v of node.fieldValues.nodes) {
    const fid = v.field?.id;
    if (!fid) continue;
    const mapped = mapFieldValue(v);
    if (mapped) fv[fid] = mapped;
  }
  return {
    id: node.id,
    content: mapContent(node.content),
    fieldValues: fv,
    updatedAt: node.updatedAt,
  };
}

export async function fetchProjectItems(
  owner: string,
  number: number,
  cursor: string | null = null,
  pageSize = 50,
): Promise<ItemsPage> {
  const data = await gql<GQLItemsResp>(PROJECT_ITEMS_QUERY, {
    owner,
    number,
    cursor,
    pageSize,
  });
  const page = data.repositoryOwner?.projectV2?.items;
  if (!page) return { items: [], nextCursor: null };

  const items = page.nodes.map<ProjectItem>((n) => {
    const fv: Record<string, FieldValue> = {};
    for (const v of n.fieldValues.nodes) {
      const fid = v.field?.id;
      if (!fid) continue;
      const mapped = mapFieldValue(v);
      if (mapped) fv[fid] = mapped;
    }
    return {
      id: n.id,
      content: mapContent(n.content),
      fieldValues: fv,
      updatedAt: n.updatedAt,
    };
  });

  return {
    items,
    nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null,
  };
}

// ---------------------------------------------------------------------------
// Mutations — edits that stay within the project (safe v1 scope)
// ---------------------------------------------------------------------------

/** Set a single-select / iteration / text / number / date field on an item. */
export async function updateFieldValue(
  projectId: string,
  itemId: string,
  fieldId: string,
  value:
    | { type: "single_select"; optionId: string }
    | { type: "iteration"; iterationId: string }
    | { type: "text"; text: string }
    | { type: "number"; number: number }
    | { type: "date"; date: string },
): Promise<void> {
  let valuePart: Record<string, unknown>;
  switch (value.type) {
    case "single_select":
      valuePart = { singleSelectOptionId: value.optionId };
      break;
    case "iteration":
      valuePart = { iterationId: value.iterationId };
      break;
    case "text":
      valuePart = { text: value.text };
      break;
    case "number":
      valuePart = { number: value.number };
      break;
    case "date":
      valuePart = { date: value.date };
      break;
  }
  await gql<unknown>(
    /* GraphQL */ `
      mutation Update($input: UpdateProjectV2ItemFieldValueInput!) {
        updateProjectV2ItemFieldValue(input: $input) {
          projectV2Item { id }
        }
      }
    `,
    { input: { projectId, itemId, fieldId, value: valuePart } },
  );
}

export async function clearFieldValue(
  projectId: string,
  itemId: string,
  fieldId: string,
): Promise<void> {
  await gql<unknown>(
    /* GraphQL */ `
      mutation Clear($input: ClearProjectV2ItemFieldValueInput!) {
        clearProjectV2ItemFieldValue(input: $input) {
          projectV2Item { id }
        }
      }
    `,
    { input: { projectId, itemId, fieldId } },
  );
}

export async function updateDraftIssue(
  draftIssueId: string,
  title: string,
  body: string,
): Promise<void> {
  await gql<unknown>(
    /* GraphQL */ `
      mutation UpdateDraft($input: UpdateProjectV2DraftIssueInput!) {
        updateProjectV2DraftIssue(input: $input) {
          draftIssue { id }
        }
      }
    `,
    { input: { draftIssueId, title, body } },
  );
}

export async function addDraftIssue(
  projectId: string,
  title: string,
  body: string,
): Promise<{ itemId: string }> {
  const data = await gql<{
    addProjectV2DraftIssue: { projectItem: { id: string } };
  }>(
    /* GraphQL */ `
      mutation AddDraft($input: AddProjectV2DraftIssueInput!) {
        addProjectV2DraftIssue(input: $input) {
          projectItem { id }
        }
      }
    `,
    { input: { projectId, title, body } },
  );
  return { itemId: data.addProjectV2DraftIssue.projectItem.id };
}
